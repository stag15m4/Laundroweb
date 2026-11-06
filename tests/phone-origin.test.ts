import { test } from "node:test";
import assert from "node:assert/strict";
import { outboundOriginAllowed } from "../src/lib/phone/origin";
test("custom-domain browser mutations survive internal Railway URLs without trusting forwarded headers", () => {
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { NODE_ENV: "production", NEXTAUTH_URL: "https://login.example.com/", PHONE_PUBLIC_URL: "https://webhooks.example.com" });
    const req = (origin?: string) => new Request("http://internal:8080/api/phone/outbound", { headers: { ...(origin ? { Origin: origin } : {}), "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" } });
    for (const origin of ["https://laundroweb.erwinmills.com", "https://login.example.com", "https://webhooks.example.com"]) assert.equal(outboundOriginAllowed(req(origin)), true);
    for (const origin of [undefined, "null", "http://internal:8080", "https://evil.example", "https://laundroweb.erwinmills.com.evil.example", "http://laundroweb.erwinmills.com"]) assert.equal(outboundOriginAllowed(req(origin)), false);
  } finally { process.env = saved; }
});
