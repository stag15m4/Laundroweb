import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getExpectedTwilioSignature } from "twilio";

test("outbound bridge requires explicit consent, binds callbacks and never redials retries", { skip: !process.env.PHONE_TEST_DATABASE_URL }, async () => {
  const env = { ...process.env }, transport = globalThis.fetch;
  process.env.DATABASE_URL = process.env.PHONE_TEST_DATABASE_URL;
  process.env.TWILIO_ACCOUNT_SID = "AC" + "a".repeat(32);
  process.env.TWILIO_AUTH_TOKEN = "outbound-test-token";
  process.env.TWILIO_PHONE_NUMBER = "+19195551234";
  process.env.PHONE_PUBLIC_URL = "https://phone.example.com";
  const { prisma } = await import("../src/lib/prisma");
  const { startOutboundCall, normalizeDialNumber } = await import("../src/lib/phone/outbound");
  const { POST } = await import("../src/app/api/phone/outbound/webhook/[event]/route");
  const saved = await prisma.phoneConfig.findUnique({ where: { id: "main" } });
  const user = { id: randomUUID(), name: "Test owner" };
  const operatorNumber = "+19195551235", destination = "+19195551236";
  let dials = 0, mode = "ok";
  const key = () => randomUUID();
  const request = (requestKey = key(), extra = {}) => ({ requestKey, destination, operatorNumber, ...extra });
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /api\.twilio\.com.*Calls\.json$/);
    const body = new URLSearchParams(String(options?.body));
    assert.equal(body.get("To"), operatorNumber);
    assert.equal(body.get("From"), process.env.TWILIO_PHONE_NUMBER);
    assert.match(body.get("Url")!, /outbound\/webhook\/prompt/);
    assert.equal(body.get("TimeLimit"), "1860");
    dials++;
    if (mode === "timeout") throw new Error("simulated uncertain transport");
    if (mode === "reject") return Response.json({ code: 21215, message: "Account not authorized to call +19195551235." }, { status: 400 });
    const sid = "CA" + dials.toString(16).padStart(32, "0");
    if (mode === "early") {
      const id = new URL(body.get("Url")!).searchParams.get("call")!;
      assert.equal((await hook(id, "prompt", { CallSid: sid })).status, 200);
    }
    return Response.json({ sid });
  };
  async function hook(id: string, event: string, fields: Record<string, string> = {}, valid = true) {
    const call = await prisma.phoneOutboundCall.findUniqueOrThrow({ where: { id } });
    const url = `${process.env.PHONE_PUBLIC_URL}/api/phone/outbound/webhook/${event}?call=${id}`;
    const form = { AccountSid: process.env.TWILIO_ACCOUNT_SID!, CallSid: call.callSid ?? "CA" + "e".repeat(32), To: operatorNumber, From: process.env.TWILIO_PHONE_NUMBER!, ...fields };
    return POST(new NextRequest(url, { method: "POST", body: new URLSearchParams(form), headers: { "Content-Type": "application/x-www-form-urlencoded", "x-twilio-signature": valid ? getExpectedTwilioSignature(process.env.TWILIO_AUTH_TOKEN!, url, form) : "invalid" } }), { params: Promise.resolve({ event }) });
  }
  const clear = () => prisma.phoneOutboundCall.deleteMany({ where: { userId: user.id } });
  try {
    await prisma.phoneConfig.upsert({ where: { id: "main" }, create: { id: "main" }, update: {} });
    await prisma.phoneConfig.update({ where: { id: "main" }, data: { enabled: true, contacts: [{ name: "Owner", number: operatorNumber }], onCallHoursEnabled: true, onCallStart: "00:00", onCallEnd: "00:01" } });
    assert.equal(normalizeDialNumber("(919) 555-1236"), destination);
    for (const value of ["911", "+442071234567", "+19005551234", "<Dial>", "9195551236#12"]) assert.throws(() => normalizeDialNumber(value));
    await assert.rejects(startOutboundCall(user, request(key(), { operatorNumber: destination })), /saved on-call/);
    await assert.rejects(startOutboundCall(user, request(key(), { destination: operatorNumber })), /different/);
    await assert.rejects(startOutboundCall(user, request(key(), { destination: process.env.TWILIO_PHONE_NUMBER })), /different/);
    assert.equal(dials, 0);

    const firstKey = key();
    const concurrent = await Promise.allSettled([startOutboundCall(user, request(firstKey)), startOutboundCall(user, request(firstKey))]);
    const first = concurrent.find(r => r.status === "fulfilled");
    assert.ok(first && first.status === "fulfilled");
    const id = first.value.id;
    assert.equal(dials, 1);
    assert.equal((await startOutboundCall(user, request(firstKey))).id, id);
    assert.equal(dials, 1);
    await assert.rejects(startOutboundCall(user, request()), /already have a call/);
    assert.equal((await hook(id, "prompt", {}, false)).status, 403);
    assert.equal((await hook(id, "prompt", { To: destination })).status, 403);
    assert.equal((await hook(id, "prompt", { CallSid: "CA" + "f".repeat(32) })).status, 403);
    assert.doesNotMatch(await (await hook(id, "prompt")).text(), /<Dial\b/);
    assert.doesNotMatch(await (await hook(id, "accept", { Digits: "" })).text(), /<Dial\b/);
    assert.equal((await prisma.phoneOutboundCall.findUniqueOrThrow({ where: { id } })).status, "DECLINED");
    await clear();

    const confirmed = await startOutboundCall(user, request());
    await hook(confirmed.id, "prompt");
    const bridge = await (await hook(confirmed.id, "accept", { Digits: "1" })).text();
    assert.match(bridge, /<Dial callerId="\+19195551234"/);
    assert.match(bridge, /<Number>\+19195551236<\/Number>/);
    assert.match(bridge, /timeLimit="1800"/);
    assert.doesNotMatch(bridge, /<Record\b|record=/);
    assert.doesNotMatch(await (await hook(confirmed.id, "accept", { Digits: "1" })).text(), /<Dial\b/);
    await hook(confirmed.id, "finished", { DialCallStatus: "busy" });
    await hook(confirmed.id, "status", { CallStatus: "completed" });
    assert.equal((await prisma.phoneOutboundCall.findUniqueOrThrow({ where: { id: confirmed.id } })).status, "BUSY");
    await clear();

    const canceled = await startOutboundCall(user, request());
    await prisma.phoneOutboundCall.update({ where: { id: canceled.id }, data: { status: "CANCELED" } });
    assert.doesNotMatch(await (await hook(canceled.id, "prompt")).text(), /<Gather|<Dial/);
    await clear();
    const expired = await startOutboundCall(user, request());
    await prisma.phoneOutboundCall.update({ where: { id: expired.id }, data: { createdAt: new Date(Date.now() - 180000) } });
    assert.doesNotMatch(await (await hook(expired.id, "prompt")).text(), /<Gather|<Dial/);
    await clear();

    mode = "early";
    const early = await startOutboundCall(user, request());
    assert.equal(early.status, "AWAITING_CONFIRMATION");
    assert.ok(early.callSid);
    await clear();
    for (let i = 0; i < 3; i++) await prisma.phoneOutboundCall.create({ data: { userId: user.id, operatorName: user.name, operatorNumber, destination, requestKey: key(), status: "COMPLETED" } });
    await assert.rejects(startOutboundCall(user, request()), /wait a minute/);
    await clear();
    mode = "timeout";
    const uncertainKey = key();
    const uncertain = await startOutboundCall(user, request(uncertainKey));
    assert.equal(uncertain.status, "DELIVERY_UNCERTAIN");
    const before = dials;
    await startOutboundCall(user, request(uncertainKey));
    assert.equal(dials, before);
    await assert.rejects(startOutboundCall(user, request()), /already have a call/);
    await clear();
    mode = "reject";
    const rejected = await startOutboundCall(user, request());
    assert.equal(rejected.status, "REJECTED");
    assert.match(rejected.error!, /21215/);
    assert.doesNotMatch(rejected.error!, /19195551235/);
  } finally {
    globalThis.fetch = transport;
    await clear();
    if (saved) await prisma.phoneConfig.update({ where: { id: "main" }, data: { enabled: saved.enabled, contacts: saved.contacts!, onCallHoursEnabled: saved.onCallHoursEnabled, onCallStart: saved.onCallStart, onCallEnd: saved.onCallEnd } });
    else await prisma.phoneConfig.deleteMany({ where: { id: "main" } });
    await prisma.$disconnect();
    process.env = env;
  }
});
