import express from "express";
import { ObjectId } from "mongodb";
import { getCollections } from "../config/db.js";
import { verifyAuth } from "../middlewares/verifyAuth.js";
import { verifyRole } from "../middlewares/verifyRole.js";

const router = express.Router();
function getUserIdValue(user) { const rawId = user?._id || user?.id; return rawId && ObjectId.isValid(rawId) ? new ObjectId(rawId) : rawId; }

router.post("/:productId", verifyAuth, verifyRole("buyer"), async (req, res, next) => {
  try {
    const { productId } = req.params;
    if (!ObjectId.isValid(productId)) return res.status(400).json({ success: false, message: "Invalid product id." });
    const { productsCollection, wishlistsCollection } = getCollections();
    const product = await productsCollection.findOne({ _id: new ObjectId(productId) });
    if (!product) return res.status(404).json({ success: false, message: "Product not found." });
    if (product.status !== "available") return res.status(400).json({ success: false, message: "Only available products can be added to wishlist." });
    const item = {
      userId: getUserIdValue(req.user), productId: product._id,
      productSnapshot: { title: product.title, image: product.images?.[0] || "", price: product.price, condition: product.condition, category: product.category, status: product.status },
      createdAt: new Date(),
    };
    await wishlistsCollection.insertOne(item);
    res.status(201).json({ success: true, message: "Product added to wishlist." });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "Product already exists in wishlist." });
    next(error);
  }
});

router.get("/my-wishlist", verifyAuth, verifyRole("buyer"), async (req, res, next) => {
  try {
    const { wishlistsCollection } = getCollections();
    const wishlist = await wishlistsCollection.find({ userId: getUserIdValue(req.user) }).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, wishlist });
  } catch (error) { next(error); }
});

router.delete("/:productId", verifyAuth, verifyRole("buyer"), async (req, res, next) => {
  try {
    const { productId } = req.params;
    if (!ObjectId.isValid(productId)) return res.status(400).json({ success: false, message: "Invalid product id." });
    const { wishlistsCollection } = getCollections();
    const result = await wishlistsCollection.deleteOne({ userId: getUserIdValue(req.user), productId: new ObjectId(productId) });
    if (!result.deletedCount) return res.status(404).json({ success: false, message: "Wishlist item not found." });
    res.json({ success: true, message: "Product removed from wishlist." });
  } catch (error) { next(error); }
});

export default router;
