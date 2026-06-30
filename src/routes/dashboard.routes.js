import express from "express";
import { ObjectId } from "mongodb";
import { getCollections } from "../config/db.js";
import { verifyAuth } from "../middlewares/verifyAuth.js";
import { verifyRole } from "../middlewares/verifyRole.js";

const router = express.Router();
function getUserIdValue(user) { const rawId = user?._id || user?.id; return rawId && ObjectId.isValid(rawId) ? new ObjectId(rawId) : rawId; }

router.get("/buyer", verifyAuth, verifyRole("buyer"), async (req, res, next) => {
  try {
    const { ordersCollection, wishlistsCollection, paymentsCollection } = getCollections();
    const userId = getUserIdValue(req.user);
    const [totalOrders, wishlistCount, payments] = await Promise.all([
      ordersCollection.countDocuments({ "buyerInfo.userId": userId }),
      wishlistsCollection.countDocuments({ userId }),
      paymentsCollection.find({ buyerId: userId }).toArray(),
    ]);
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    res.json({ success: true, stats: { totalOrders, wishlistCount, totalPaid } });
  } catch (error) { next(error); }
});

router.get("/seller", verifyAuth, verifyRole("seller"), async (req, res, next) => {
  try {
    const { productsCollection, ordersCollection, paymentsCollection } = getCollections();
    const userId = getUserIdValue(req.user);
    const [totalProducts, totalSales, pendingOrders, payments] = await Promise.all([
      productsCollection.countDocuments({ "sellerInfo.userId": userId }),
      ordersCollection.countDocuments({ "sellerInfo.userId": userId, paymentStatus: "paid" }),
      ordersCollection.countDocuments({ "sellerInfo.userId": userId, orderStatus: "pending" }),
      paymentsCollection.find({ sellerId: userId }).toArray(),
    ]);
    const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    res.json({ success: true, stats: { totalProducts, totalSales, totalRevenue, pendingOrders }, charts: { monthlySales: [{ name: "Jan", value: 0 }, { name: "Feb", value: 0 }, { name: "Mar", value: totalRevenue }] } });
  } catch (error) { next(error); }
});

router.get("/admin", verifyAuth, verifyRole("admin"), async (req, res, next) => {
  try {
    const { usersCollection, productsCollection, ordersCollection, paymentsCollection } = getCollections();
    const [totalUsers, totalProducts, totalOrders, payments] = await Promise.all([
      usersCollection.countDocuments(), productsCollection.countDocuments(), ordersCollection.countDocuments(), paymentsCollection.find({ paymentStatus: "paid" }).toArray(),
    ]);
    const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    res.json({ success: true, stats: { totalUsers, totalProducts, totalOrders, totalRevenue }, charts: { userGrowth: [{ name: "Jan", value: 0 }, { name: "Feb", value: 0 }, { name: "Mar", value: totalUsers }] } });
  } catch (error) { next(error); }
});

export default router;
