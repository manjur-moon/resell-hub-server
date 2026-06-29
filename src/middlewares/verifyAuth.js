import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";
import { getCollections } from "../config/db.js";
import { sanitizeUser } from "../utils/sanitizeUser.js";
export async function verifyAuth(req,res,next){ try{ const session=await auth.api.getSession({headers:fromNodeHeaders(req.headers)}); if(!session?.user?.email) return res.status(401).json({success:false,message:'Unauthorized access. Please login first.'}); const {usersCollection}=getCollections(); const dbUser=await usersCollection.findOne({email:session.user.email}); if(!dbUser) return res.status(401).json({success:false,message:'User not found. Please login again.'}); if(dbUser.status==='blocked') return res.status(403).json({success:false,message:'Your account has been blocked. Please contact support.'}); req.user=sanitizeUser({...dbUser,image:session.user.image||dbUser.image||dbUser.photo}); next(); }catch(error){ next(error); } }
