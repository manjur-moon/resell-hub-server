import express from "express";
import { verifyAuth } from "../middlewares/verifyAuth.js";
const router=express.Router();
router.get('/me',verifyAuth,(req,res)=>res.json({success:true,user:req.user}));
export default router;
