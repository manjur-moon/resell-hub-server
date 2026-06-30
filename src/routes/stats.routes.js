import express from "express";
import { getCollections } from "../config/db.js";

const router = express.Router();

router.get("/marketplace", async (req, res, next) => {
  try {
    const { usersCollection, productsCollection, ordersCollection } = getCollections();
    const [totalProducts, totalSellers, totalBuyers, completedOrders, availableProducts] = await Promise.all([
      productsCollection.countDocuments(),
      usersCollection.countDocuments({ role: "seller" }),
      usersCollection.countDocuments({ role: "buyer" }),
      ordersCollection.countDocuments({ orderStatus: "delivered" }),
      productsCollection.countDocuments({ status: "available" }),
    ]);
    res.json({ success: true, stats: { totalProducts, totalSellers, totalBuyers, completedOrders, availableProducts } });
  } catch (error) { next(error); }
});

router.get("/trusted-sellers", async (req, res, next) => {
  try {
    const { usersCollection } = getCollections();
    const sellers = await usersCollection.find({ role: "seller", status: "active", isVerifiedSeller: true }, { projection: { password: 0 } }).sort({ createdAt: -1 }).limit(6).toArray();
    res.json({ success: true, sellers });
  } catch (error) { next(error); }
});

export default router;
