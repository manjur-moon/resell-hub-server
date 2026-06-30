const API_URL = process.env.API_URL || "http://localhost:5000";
const endpoints = [
  ["Root API", "/"], ["Health Check", "/api/health"], ["Public Products", "/api/products"],
  ["Featured Products", "/api/products/featured"], ["Product Categories", "/api/products/categories"],
  ["Marketplace Stats", "/api/stats/marketplace"], ["Trusted Sellers", "/api/stats/trusted-sellers"],
];
async function run() {
  console.log(`Running smoke tests against: ${API_URL}`);
  let failed = 0;
  for (const [name, path] of endpoints) {
    try {
      const res = await fetch(`${API_URL}${path}`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      console.log(`✅ ${name}: ${res.status}`);
    } catch (error) { failed++; console.error(`❌ ${name}: ${error.message}`); }
  }
  if (failed) process.exit(1);
  console.log("✅ All smoke tests passed.");
}
run();
