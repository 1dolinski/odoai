import { createClient } from "apinow-sdk";
import { config } from "dotenv";
config({ path: ".env.local" });

const apinow = createClient({ privateKey: process.env.APINOW_PRIVATE_KEY?.trim() });

console.log("--- discoverPrice ---");
try {
  const price = await apinow.discoverPrice("https://stablesocial.dev/api/instagram/profile");
  console.log(JSON.stringify(price, null, 2));
} catch (err) {
  console.error("discoverPrice failed:", err.message);
}

console.log("\n--- callExternal ---");
try {
  const data = await apinow.callExternal("https://stablesocial.dev/api/instagram/profile", {
    method: "POST",
    body: { handle: "nike" },
  });
  const parsed = typeof data === "string" ? JSON.parse(data) : data;
  console.log("Result:", JSON.stringify(parsed, null, 2).substring(0, 2000));
} catch (err) {
  console.error("callExternal failed:", err.message);
  // Check raw what the proxy returns
  console.log("\n--- Raw proxy 402 check ---");
  try {
    const res = await fetch("https://www.apinow.fun/api/proxy?url=https://stablesocial.dev/api/instagram/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: "nike" }) });
    console.log("Status:", res.status);
    const hdrs = {};
    for (const [k,v] of res.headers.entries()) { if (k.includes("402") || k.includes("pay") || k.includes("x402")) hdrs[k] = v.substring(0, 200); }
    console.log("Payment headers:", JSON.stringify(hdrs, null, 2));
    const body = await res.text();
    console.log("Body:", body.substring(0, 500));
  } catch (e) { console.error("Raw check failed:", e.message); }
}
