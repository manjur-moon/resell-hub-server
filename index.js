import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./src/lib/auth.js";
import { connectDB } from "./src/config/db.js";
import authRoutes from "./src/routes/auth.routes.js";
import userRoutes from "./src/routes/user.routes.js";
import productRoutes from "./src/routes/product.routes.js";
import orderRoutes from "./src/routes/order.routes.js";
import paymentRoutes, { stripeWebhookHandler } from "./src/routes/payment.routes.js";
import wishlistRoutes from "./src/routes/wishlist.routes.js";
import statsRoutes from "./src/routes/stats.routes.js";
import dashboardRoutes from "./src/routes/dashboard.routes.js";
import { seedAdmin } from "./src/utils/seedAdmin.js";
import { errorHandler, notFoundHandler } from "./src/middlewares/errorHandler.js";

dotenv.config();
const app = express();
const port = process.env.PORT || 5000;
app.set("trust proxy", 1);

const normalizeOrigin = (value) => {
  if (!value) return "";
  return value.trim().replace(/\/$/, "");
};

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  process.env.CLIENT_URL,
  process.env.CLIENT_URL_2,
]
  .filter(Boolean)
  .map(normalizeOrigin);

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);

    const normalizedOrigin = normalizeOrigin(origin);

    if (allowedOrigins.includes(normalizedOrigin)) {
      return cb(null, true);
    }

    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "stripe-signature",
  ],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.all("/api/better-auth/*", toNodeHandler(auth));
app.post("/api/payments/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

app.get("/", (req, res) => res.json({ success: true, message: "ReSell Hub server is running.", phase: "Final", environment: process.env.NODE_ENV || "development" }));
app.get("/api/health", (req, res) => res.json({ success: true, message: "API health check passed.", timestamp: new Date().toISOString(), allowedOrigins, betterAuthUrl: process.env.BETTER_AUTH_URL || null, clientUrl: process.env.CLIENT_URL || null }));
app.get("/favicon.ico", (req, res) => res.status(204).end());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

async function start() {
  try {
    await connectDB();
    await seedAdmin();
    app.listen(port, () => console.log(`ReSell Hub server running on port ${port}`));
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}
start();
export default app;
