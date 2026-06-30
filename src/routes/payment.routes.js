import express from "express";
import { ObjectId } from "mongodb";
import { getCollections } from "../config/db.js";
import { requireStripe, toStripeAmount, fromStripeAmount, stripeCurrency } from "../lib/stripe.js";
import { verifyAuth } from "../middlewares/verifyAuth.js";
import { verifyRole } from "../middlewares/verifyRole.js";
import { generateTransactionId } from "../utils/generateTransactionId.js";

const router = express.Router();
function isValidObjectId(id) { return ObjectId.isValid(id); }
function getUserIdValue(user) { const rawId = user?._id || user?.id; return rawId && ObjectId.isValid(rawId) ? new ObjectId(rawId) : rawId; }
function idsEqual(a, b) { return String(a) === String(b); }

async function completeCheckoutSession(sessionInput) {
  const stripe = requireStripe();
  const session = typeof sessionInput === "string" ? await stripe.checkout.sessions.retrieve(sessionInput) : sessionInput;
  if (!session?.id) throw new Error("Invalid Stripe checkout session.");
  if (session.payment_status !== "paid") throw new Error("Payment is not completed yet.");

  const { ordersCollection, paymentsCollection, productsCollection } = getCollections();
  const existingPayment = await paymentsCollection.findOne({ stripeSessionId: session.id });
  if (existingPayment) {
    const existingOrder = await ordersCollection.findOne({ _id: existingPayment.orderId });
    return { payment: existingPayment, order: existingOrder, alreadyProcessed: true };
  }

  const orderId = session.metadata?.orderId;
  if (!orderId || !ObjectId.isValid(orderId)) throw new Error("Order id missing from Stripe session metadata.");
  const order = await ordersCollection.findOne({ _id: new ObjectId(orderId) });
  if (!order) throw new Error("Order not found for this payment.");
  const product = await productsCollection.findOne({ _id: order.productId });
  if (!product) throw new Error("Product not found for this payment.");

  const transactionId = generateTransactionId();
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || "";
  const payment = {
    orderId: order._id, buyerId: order.buyerInfo.userId, sellerId: order.sellerInfo.userId,
    transactionId, stripeSessionId: session.id, stripePaymentIntentId: paymentIntentId,
    amount: fromStripeAmount(session.amount_total), currency: session.currency || stripeCurrency,
    paymentStatus: "paid", paymentMethod: "card",
    productSnapshot: { productId: order.productId, title: order.productTitle, image: order.productImage },
    paymentDate: new Date(), createdAt: new Date(),
  };

  await paymentsCollection.insertOne(payment);
  const nextOrderStatus = order.orderStatus === "pending" ? "accepted" : order.orderStatus;
  await ordersCollection.updateOne({ _id: order._id }, { $set: { paymentStatus: "paid", orderStatus: nextOrderStatus, stripeSessionId: session.id, transactionId, updatedAt: new Date() } });
  const currentStock = Number(product.stockQuantity || 0);
  const newStock = Math.max(currentStock - Number(order.quantity || 1), 0);
  await productsCollection.updateOne({ _id: product._id }, { $set: { stockQuantity: newStock, status: newStock <= 0 ? "sold" : product.status, updatedAt: new Date() } });

  return { payment, order: { ...order, paymentStatus: "paid", orderStatus: nextOrderStatus, transactionId }, alreadyProcessed: false };
}

router.post("/create-checkout-session", verifyAuth, verifyRole("buyer"), async (req, res, next) => {
  try {
    const { orderId } = req.body;
    if (!isValidObjectId(orderId)) return res.status(400).json({ success: false, message: "Invalid order id." });
    const { ordersCollection } = getCollections();
    const order = await ordersCollection.findOne({ _id: new ObjectId(orderId) });
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });
    if (!idsEqual(order.buyerInfo?.userId, getUserIdValue(req.user))) return res.status(403).json({ success: false, message: "You can pay only for your own order." });
    if (order.paymentStatus === "paid") return res.status(400).json({ success: false, message: "This order is already paid." });
    if (order.orderStatus === "cancelled") return res.status(400).json({ success: false, message: "Cancelled order cannot be paid." });

    const stripe = requireStripe();
    const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: order.buyerInfo.email,
      line_items: [{
        price_data: { currency: stripeCurrency, product_data: { name: order.productTitle, images: order.productImage ? [order.productImage] : [] }, unit_amount: toStripeAmount(order.unitPrice) },
        quantity: order.quantity,
      }],
      success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}/payment/cancel?orderId=${order._id}`,
      metadata: { orderId: String(order._id), buyerId: String(order.buyerInfo.userId), sellerId: String(order.sellerInfo.userId), productId: String(order.productId) },
      payment_intent_data: { metadata: { orderId: String(order._id), buyerId: String(order.buyerInfo.userId), productId: String(order.productId) } },
    });
    await ordersCollection.updateOne({ _id: order._id }, { $set: { stripeSessionId: session.id, updatedAt: new Date() } });
    res.json({ success: true, url: session.url, sessionId: session.id });
  } catch (error) { next(error); }
});

router.post("/confirm", verifyAuth, verifyRole("buyer"), async (req, res, next) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ success: false, message: "Stripe session id is required." });
    const result = await completeCheckoutSession(sessionId);
    if (!idsEqual(result.order?.buyerInfo?.userId, getUserIdValue(req.user))) return res.status(403).json({ success: false, message: "You do not have permission to confirm this payment." });
    res.json({ success: true, message: result.alreadyProcessed ? "Payment was already confirmed." : "Payment confirmed successfully.", payment: result.payment, order: result.order });
  } catch (error) { next(error); }
});

router.get("/my-history", verifyAuth, verifyRole("buyer"), async (req, res, next) => {
  try {
    const { paymentsCollection } = getCollections();
    const payments = await paymentsCollection.find({ buyerId: getUserIdValue(req.user) }).sort({ paymentDate: -1 }).toArray();
    res.json({ success: true, payments });
  } catch (error) { next(error); }
});

router.get("/", verifyAuth, verifyRole("admin"), async (req, res, next) => {
  try {
    const { status = "", search = "", page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (pageNumber - 1) * limitNumber;
    const query = {};
    if (status && ["pending", "paid", "failed"].includes(status)) query.paymentStatus = status;
    if (search) query.$or = [{ transactionId: { $regex: search, $options: "i" } }, { "productSnapshot.title": { $regex: search, $options: "i" } }];
    const { paymentsCollection } = getCollections();
    const [payments, total] = await Promise.all([
      paymentsCollection.find(query).sort({ paymentDate: -1 }).skip(skip).limit(limitNumber).toArray(),
      paymentsCollection.countDocuments(query),
    ]);
    res.json({ success: true, total, page: pageNumber, limit: limitNumber, totalPages: Math.ceil(total / limitNumber), payments });
  } catch (error) { next(error); }
});

router.get("/:id", verifyAuth, async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid payment id." });
    const { paymentsCollection } = getCollections();
    const payment = await paymentsCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!payment) return res.status(404).json({ success: false, message: "Payment not found." });
    const currentUserId = getUserIdValue(req.user);
    const allowed = req.user.role === "admin" || idsEqual(payment.buyerId, currentUserId) || idsEqual(payment.sellerId, currentUserId);
    if (!allowed) return res.status(403).json({ success: false, message: "You do not have permission to view this payment." });
    res.json({ success: true, payment });
  } catch (error) { next(error); }
});

export async function stripeWebhookHandler(req, res) {
  const stripe = requireStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return res.status(200).json({ received: true, message: "Webhook received, but STRIPE_WEBHOOK_SECRET is not configured." });
  const signature = req.headers["stripe-signature"];
  let event;
  try { event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret); }
  catch (error) { return res.status(400).send(`Webhook Error: ${error.message}`); }
  try {
    if (event.type === "checkout.session.completed") await completeCheckoutSession(event.data.object);
    res.json({ received: true });
  } catch (error) { res.status(500).json({ received: false, message: error.message }); }
}

export default router;
