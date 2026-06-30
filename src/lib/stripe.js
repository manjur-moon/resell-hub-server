import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

export const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
export const stripeCurrency = (process.env.STRIPE_CURRENCY || "bdt").toLowerCase();

export function requireStripe() {
  if (!stripe) {
    throw new Error("STRIPE_SECRET_KEY is missing in environment variables.");
  }
  return stripe;
}

export function toStripeAmount(amount) {
  const numericAmount = Number(amount);
  if (Number.isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error("Invalid payment amount.");
  }
  return Math.round(numericAmount * 100);
}

export function fromStripeAmount(amount) {
  return Number(amount || 0) / 100;
}
