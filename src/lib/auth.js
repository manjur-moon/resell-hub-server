import dotenv from "dotenv";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { jwt } from "better-auth/plugins";
import { authDatabase, mongoClient } from "../config/db.js";
dotenv.config();
const isProduction = process.env.NODE_ENV === "production";
const normalizeOrigin = (value) => {
  if (!value) return "";
  return value.trim().replace(/\/$/, "");
};

const trustedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  process.env.CLIENT_URL,
  process.env.CLIENT_URL_2,
]
  .filter(Boolean)
  .map(normalizeOrigin);
const socialProviders = {};
if(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET){ socialProviders.google={clientId:process.env.GOOGLE_CLIENT_ID, clientSecret:process.env.GOOGLE_CLIENT_SECRET}; }
export const auth = betterAuth({
  appName:"ReSell Hub", baseURL:process.env.BETTER_AUTH_URL || "http://localhost:5000", basePath:"/api/better-auth", secret:process.env.BETTER_AUTH_SECRET,
  trustedOrigins, database: mongodbAdapter(authDatabase,{client:mongoClient}), emailAndPassword:{enabled:true,autoSignIn:true,minPasswordLength:6}, socialProviders,
  user:{modelName:"users", additionalFields:{ role:{type:["buyer","seller","admin"],defaultValue:"buyer",input:false}, phone:{type:"string",required:false,defaultValue:""}, location:{type:"string",required:false,defaultValue:""}, status:{type:["active","blocked"],defaultValue:"active",input:false}, isVerifiedSeller:{type:"boolean",defaultValue:false,input:false}, provider:{type:"string",required:false,defaultValue:"credentials"}}},
  session:{modelName:"sessions"}, account:{modelName:"accounts"}, verification:{modelName:"verifications"}, plugins:[jwt()],
  advanced:{cookiePrefix:"resellhub", useSecureCookies:isProduction, defaultCookieAttributes:{sameSite:isProduction?"none":"lax",secure:isProduction,httpOnly:true,path:"/"}}
});
