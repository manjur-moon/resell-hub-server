import dotenv from "dotenv";
import { MongoClient } from "mongodb";
dotenv.config();
const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || "resellhub";
if (!uri) throw new Error("MONGODB_URI is missing.");
export const mongoClient = new MongoClient(uri);
export const authDatabase = mongoClient.db(dbName);
let db;
export async function connectDB(){
  if(db) return db;
  await mongoClient.connect();
  db = mongoClient.db(dbName);
  console.log(`MongoDB connected: ${dbName}`);
  await createIndexes();
  return db;
}
export function getDB(){ if(!db) db=mongoClient.db(dbName); return db; }
export function getCollections(){ const d=getDB(); return {
  usersCollection:d.collection('users'), productsCollection:d.collection('products'),
  ordersCollection:d.collection('orders'), paymentsCollection:d.collection('payments'),
  reviewsCollection:d.collection('reviews'), wishlistsCollection:d.collection('wishlists'),
  reportsCollection:d.collection('reports'), recentlyViewedCollection:d.collection('recentlyViewed')
};}
async function createIndexes(){ const c=getCollections(); await Promise.all([
  c.usersCollection.createIndex({email:1},{unique:true}), c.usersCollection.createIndex({role:1}), c.usersCollection.createIndex({status:1}),
  c.productsCollection.createIndex({title:1}), c.productsCollection.createIndex({category:1}), c.productsCollection.createIndex({condition:1}), c.productsCollection.createIndex({price:1}), c.productsCollection.createIndex({status:1}), c.productsCollection.createIndex({createdAt:-1}), c.productsCollection.createIndex({'sellerInfo.userId':1}),
  c.ordersCollection.createIndex({'buyerInfo.userId':1}), c.ordersCollection.createIndex({'sellerInfo.userId':1}),
  c.paymentsCollection.createIndex({transactionId:1},{unique:true,sparse:true}),
  c.wishlistsCollection.createIndex({userId:1,productId:1},{unique:true}), c.reportsCollection.createIndex({status:1}), c.recentlyViewedCollection.createIndex({userId:1,viewedAt:-1})
]); console.log('Indexes ready.'); }
