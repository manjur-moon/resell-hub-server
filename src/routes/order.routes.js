import express from "express";
import { ObjectId } from "mongodb";
import { getCollections } from "../config/db.js";
import { verifyAuth } from "../middlewares/verifyAuth.js";
import { verifyRole } from "../middlewares/verifyRole.js";

const router = express.Router();
const allowedOrderStatuses = ["pending", "accepted", "processing", "shipped", "delivered", "cancelled", "rejected"];

function isValidObjectId(id) { return ObjectId.isValid(id); }
function getUserIdValue(user) {
  const rawId = user?._id || user?.id;
  return rawId && ObjectId.isValid(rawId) ? new ObjectId(rawId) : rawId;
}
function idsEqual(a, b) { return String(a) === String(b); }
function validateDeliveryInfo(info) {
  if (!info?.fullName?.trim()) return "Full name is required.";
  if (!info?.phone?.trim()) return "Phone number is required.";
  if (!info?.address?.trim()) return "Delivery address is required.";
  if (!info?.city?.trim()) return "City is required.";
  return null;
}
function buildOrderQuery({ search, orderStatus, paymentStatus }) {
  const query = {};
  if (search) {
    query.$or = [
      { productTitle: { $regex: search, $options: "i" } },
      { "buyerInfo.name": { $regex: search, $options: "i" } },
      { "buyerInfo.email": { $regex: search, $options: "i" } },
      { "sellerInfo.name": { $regex: search, $options: "i" } },
      { "sellerInfo.email": { $regex: search, $options: "i" } },
    ];
  }
  if (orderStatus && allowedOrderStatuses.includes(orderStatus)) query.orderStatus = orderStatus;
  if (paymentStatus && ["pending", "paid", "failed"].includes(paymentStatus)) query.paymentStatus = paymentStatus;
  return query;
}

router.post("/", verifyAuth, verifyRole("buyer"), async (req, res, next) => {
  try {
    const { productId, quantity = 1, deliveryInfo } = req.body;
    if (!isValidObjectId(productId)) return res.status(400).json({ success: false, message: "Invalid product id." });
    const deliveryError = validateDeliveryInfo(deliveryInfo);
    if (deliveryError) return res.status(400).json({ success: false, message: deliveryError });
    const orderQuantity = Number(quantity);
    if (Number.isNaN(orderQuantity) || orderQuantity <= 0) return res.status(400).json({ success: false, message: "Quantity must be greater than 0." });

    const { productsCollection, ordersCollection } = getCollections();
    const product = await productsCollection.findOne({ _id: new ObjectId(productId) });
    if (!product) return res.status(404).json({ success: false, message: "Product not found." });
    if (product.status !== "available") return res.status(400).json({ success: false, message: "This product is not available for purchase." });
    if (orderQuantity > Number(product.stockQuantity || 0)) return res.status(400).json({ success: false, message: "Requested quantity exceeds available stock." });

    const buyerId = getUserIdValue(req.user);
    if (idsEqual(product.sellerInfo?.userId, buyerId)) return res.status(400).json({ success: false, message: "You cannot buy your own product." });

    const unitPrice = Number(product.price);
    const order = {
      buyerInfo: { userId: buyerId, name: req.user.name, email: req.user.email, phone: req.user.phone || deliveryInfo.phone || "" },
      sellerInfo: { userId: product.sellerInfo?.userId, name: product.sellerInfo?.name || "", email: product.sellerInfo?.email || "", phone: product.sellerInfo?.phone || "" },
      productId: product._id,
      productTitle: product.title,
      productImage: product.images?.[0] || "",
      quantity: orderQuantity,
      unitPrice,
      totalAmount: unitPrice * orderQuantity,
      paymentStatus: "pending",
      orderStatus: "pending",
      stripeSessionId: "",
      transactionId: "",
      deliveryInfo: {
        fullName: deliveryInfo.fullName.trim(), phone: deliveryInfo.phone.trim(),
        address: deliveryInfo.address.trim(), city: deliveryInfo.city.trim(), notes: deliveryInfo.notes?.trim() || "",
      },
      createdAt: new Date(), updatedAt: new Date(),
    };
    const result = await ordersCollection.insertOne(order);
    res.status(201).json({ success: true, message: "Order created successfully.", orderId: result.insertedId });
  } catch (error) { next(error); }
});

router.get("/my-orders", verifyAuth, verifyRole("buyer"), async (req, res, next) => {
  try {
    const { ordersCollection } = getCollections();
    const orders = await ordersCollection.find({ "buyerInfo.userId": getUserIdValue(req.user) }).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, orders });
  } catch (error) { next(error); }
});

router.get("/seller", verifyAuth, verifyRole("seller"), async (req, res, next) => {
  try {
    const query = { "sellerInfo.userId": getUserIdValue(req.user) };
    if (req.query.status && allowedOrderStatuses.includes(req.query.status)) query.orderStatus = req.query.status;
    const { ordersCollection } = getCollections();
    const orders = await ordersCollection.find(query).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, orders });
  } catch (error) { next(error); }
});

router.get("/", verifyAuth, verifyRole("admin"), async (req, res, next) => {
  try {
    const { search = "", orderStatus = "", paymentStatus = "", page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (pageNumber - 1) * limitNumber;
    const query = buildOrderQuery({ search, orderStatus, paymentStatus });
    const { ordersCollection } = getCollections();
    const [orders, total] = await Promise.all([
      ordersCollection.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNumber).toArray(),
      ordersCollection.countDocuments(query),
    ]);
    res.json({ success: true, total, page: pageNumber, limit: limitNumber, totalPages: Math.ceil(total / limitNumber), orders });
  } catch (error) { next(error); }
});

router.get("/:id", verifyAuth, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid order id." });
    const { ordersCollection } = getCollections();
    const order = await ordersCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });
    const currentUserId = getUserIdValue(req.user);
    const allowed = req.user.role === "admin" || idsEqual(order.buyerInfo?.userId, currentUserId) || idsEqual(order.sellerInfo?.userId, currentUserId);
    if (!allowed) return res.status(403).json({ success: false, message: "You do not have permission to view this order." });
    res.json({ success: true, order });
  } catch (error) { next(error); }
});

router.patch("/:id/cancel", verifyAuth, verifyRole("buyer"), async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid order id." });
    const { ordersCollection } = getCollections();
    const order = await ordersCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });
    if (!idsEqual(order.buyerInfo?.userId, getUserIdValue(req.user))) return res.status(403).json({ success: false, message: "You can cancel only your own order." });
    if (["shipped", "delivered"].includes(order.orderStatus)) return res.status(400).json({ success: false, message: "Shipped or delivered order cannot be cancelled." });
    await ordersCollection.updateOne({ _id: order._id }, { $set: { orderStatus: "cancelled", updatedAt: new Date() } });
    res.json({ success: true, message: "Order cancelled successfully." });
  } catch (error) { next(error); }
});

router.patch("/:id/status", verifyAuth, verifyRole("seller", "admin"), async (req, res, next) => {
  try {
    const { orderStatus } = req.body;
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid order id." });
    if (!allowedOrderStatuses.includes(orderStatus)) return res.status(400).json({ success: false, message: "Invalid order status." });
    const { ordersCollection } = getCollections();
    const order = await ordersCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });
    if (req.user.role === "seller" && !idsEqual(order.sellerInfo?.userId, getUserIdValue(req.user))) return res.status(403).json({ success: false, message: "You can update only orders for your products." });
    await ordersCollection.updateOne({ _id: order._id }, { $set: { orderStatus, updatedAt: new Date() } });
    res.json({ success: true, message: "Order status updated successfully." });
  } catch (error) { next(error); }
});

export default router;
