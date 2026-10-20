import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { getExpectedTwilioSignature } from "twilio";

// Explicit opt-in: these tests create and delete phone data in a throwaway DB.
// They never dial a real telephone: the provider transport is replaced below.
test(
  "phone webhook and durable escalation lifecycle",
  { skip: !process.env.PHONE_TEST_DATABASE_URL },
  async (t) => {
    const savedEnv = { ...process.env };
    const savedFetch = globalThis.fetch;
    process.env.DATABASE_URL = process.env.PHONE_TEST_DATABASE_URL;
    process.env.TWILIO_ACCOUNT_SID = "AC" + "a".repeat(32);
    process.env.TWILIO_AUTH_TOKEN = "phone-test-token";
    process.env.TWILIO_PHONE_NUMBER = "+19195551234";
    process.env.PHONE_PUBLIC_URL = "https://phone.example.com";
    process.env.PHONE_WORKER_ENABLED = "true";
    const { prisma } = await import("../src/lib/prisma");
    const { POST } = await import(
      "../src/app/api/phone/webhooks/[event]/route"
    );
    const { processPhoneAlerts } = await import("../src/lib/phone/worker");
    let dialCount = 0;
    let shouldFail = false;
    globalThis.fetch = async (input, options) => {
      assert.match(
        String(input),
        /^https:\/\/api\.twilio\.com\/2010-04-01\/Accounts\/AC[a-f0-9]{32}\/Calls\.json$/,
      );
      assert.equal(options?.method, "POST");
      dialCount++;
      if (shouldFail) throw new Error("Simulated provider timeout");
      return Response.json({
        sid: "CA" + dialCount.toString(16).padStart(32, "0"),
      });
    };
    const incomingSid = "CA" + "b".repeat(32);
    const generalSid = "CA" + "c".repeat(32);
    const caller = "+19195551236";
    const receiving = process.env.TWILIO_PHONE_NUMBER;
    async function hook(
      event: string,
      fields: Record<string, string> = {},
      query = "",
      valid = true,
    ) {
      const url = `${process.env.PHONE_PUBLIC_URL}/api/phone/webhooks/${event}${query}`;
      const form = {
        AccountSid: process.env.TWILIO_ACCOUNT_SID!,
        CallSid: incomingSid,
        From: caller,
        To: receiving!,
        ...fields,
      };
      return POST(
        new NextRequest(url, {
          method: "POST",
          body: new URLSearchParams(form),
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "x-twilio-signature": valid
              ? getExpectedTwilioSignature(
                  process.env.TWILIO_AUTH_TOKEN!,
                  url,
                  form,
                )
              : "invalid",
          },
        }),
        { params: Promise.resolve({ event }) },
      );
    }
    const dueNow = async (id: string) =>
      prisma.phoneMessage.update({
        where: { id },
        data: { nextAttemptAt: new Date(Date.now() - 1000) },
      });
    try {
      await prisma.phoneConfig.upsert({
        where: { id: "main" },
        create: { id: "main" },
        update: {},
      });
      await prisma.phoneConfig.update({
        where: { id: "main" },
        data: {
          enabled: true,
          maxAttempts: 2,
          retrySeconds: 120,
          contacts: [
            { name: "Primary", number: "+19195551237" },
            { name: "Backup", number: "+19195551238" },
          ],
        },
      });
      await prisma.phoneMessage.deleteMany({
        where: { callSid: { in: [incomingSid, generalSid] } },
      });
      await t.test(
        "forged callbacks are rejected without creating messages",
        async () => {
          assert.equal(
            (await hook("menu", { Digits: "9" }, "", false)).status,
            403,
          );
          assert.equal(await prisma.phoneMessage.count(), 0);
        },
      );
      await t.test(
        "menu and voicemail are separate, with escaped customer-facing instructions",
        async () => {
          const menu = await (await hook("incoming")).text();
          assert.match(menu, /numDigits="1"/);
          assert.match(menu, /press 9/);
          const response = await hook("menu", {
            Digits: "2",
            CallSid: generalSid,
          });
          assert.match(await response.text(), /<Record/);
          const general = await prisma.phoneMessage.findUniqueOrThrow({
            where: { callSid: generalSid },
          });
          assert.equal(general.urgent, false);
          assert.equal(general.nextAttemptAt, null);
        },
      );
      await t.test(
        "press 9 schedules an alert even if caller hangs up; retries are idempotent",
        async () => {
          await hook("menu", { Digits: "9" });
          await hook("menu", { Digits: "9" });
          const messages = await prisma.phoneMessage.findMany({
            where: { callSid: incomingSid },
          });
          assert.equal(messages.length, 1);
          assert.equal(messages[0].urgent, true);
          assert.ok(messages[0].nextAttemptAt);
        },
      );
      const message = await prisma.phoneMessage.findUniqueOrThrow({
        where: { callSid: incomingSid },
      });
      await t.test(
        "recording and transcription callbacks attach only to their own call",
        async () => {
          const query = `?message=${message.id}`;
          const recordingSid = "RE" + "d".repeat(32);
          assert.equal(
            (
              await hook(
                "recording",
                { CallSid: generalSid, RecordingSid: recordingSid },
                query,
              )
            ).status,
            403,
          );
          await hook(
            "recording",
            {
              RecordingSid: recordingSid,
              RecordingDuration: "12",
              RecordingStatus: "completed",
            },
            query,
          );
          await hook(
            "transcription",
            {
              RecordingSid: recordingSid,
              TranscriptionStatus: "completed",
              TranscriptionText: "Washer is leaking.",
            },
            query,
          );
          const recorded = await prisma.phoneMessage.findUniqueOrThrow({
            where: { id: message.id },
          });
          assert.equal(recorded.recordingSid, recordingSid);
          assert.equal(recorded.transcript, "Washer is leaking.");
        },
      );
      await t.test(
        "competing workers claim only one outbound attempt",
        async () => {
          await dueNow(message.id);
          await Promise.all([processPhoneAlerts(), processPhoneAlerts()]);
          assert.equal(dialCount, 1);
          assert.equal(
            await prisma.phoneAttempt.count({
              where: { messageId: message.id },
            }),
            1,
          );
        },
      );
      const attempt = await prisma.phoneAttempt.findFirstOrThrow({
        where: { messageId: message.id },
      });
      const alertFields = {
        From: receiving!,
        To: attempt.destination,
        CallSid: attempt.callSid!,
      };
      const query = `?attempt=${attempt.id}`;
      await t.test(
        "personal voicemail completing a call does not acknowledge the alert",
        async () => {
          await hook(
            "status",
            { ...alertFields, CallStatus: "completed" },
            query,
          );
          await hook("ack", { ...alertFields, Digits: "" }, query);
          const current = await prisma.phoneMessage.findUniqueOrThrow({
            where: { id: message.id },
          });
          assert.equal(current.status, "OPEN");
          assert.ok(current.nextAttemptAt);
        },
      );
      await t.test(
        "expired leases recover on restart; provider timeout waits before retrying",
        async () => {
          await prisma.phoneMessage.update({
            where: { id: message.id },
            data: {
              nextAttemptAt: new Date(0),
              leaseToken: "old-process",
              leaseUntil: new Date(0),
            },
          });
          shouldFail = true;
          await processPhoneAlerts();
          assert.equal(dialCount, 2);
          const second = await prisma.phoneAttempt.findUniqueOrThrow({
            where: {
              messageId_sequence: { messageId: message.id, sequence: 2 },
            },
          });
          assert.equal(second.contactName, "Backup");
          assert.equal(second.status, "DELIVERY_UNCERTAIN");
          await processPhoneAlerts();
          assert.equal(dialCount, 2);
          shouldFail = false;
        },
      );
      await t.test(
        "retry limit leaves an unresolved alert visible instead of silently resolving it",
        async () => {
          await dueNow(message.id);
          await processPhoneAlerts();
          const current = await prisma.phoneMessage.findUniqueOrThrow({
            where: { id: message.id },
          });
          assert.equal(current.status, "OPEN");
          assert.equal(current.escalationEnded, true);
          assert.equal(dialCount, 2);
        },
      );
      await t.test(
        "a valid press 1 stops future alerts and callback replays cannot reopen them",
        async () => {
          await hook("ack", { ...alertFields, Digits: "1" }, query);
          await hook("menu", { Digits: "9" });
          await hook(
            "recorded",
            { RecordingSid: "RE" + "d".repeat(32), RecordingDuration: "12" },
            `?message=${message.id}`,
          );
          const current = await prisma.phoneMessage.findUniqueOrThrow({
            where: { id: message.id },
          });
          assert.equal(current.status, "ACKNOWLEDGED");
          assert.equal(current.nextAttemptAt, null);
          await processPhoneAlerts();
          assert.equal(dialCount, 2);
        },
      );
      await t.test(
        "an alert URL cannot acknowledge a different outbound call",
        async () => {
          assert.equal(
            (
              await hook(
                "ack",
                { ...alertFields, CallSid: "CA" + "f".repeat(32), Digits: "1" },
                query,
              )
            ).status,
            403,
          );
        },
      );
    } finally {
      globalThis.fetch = savedFetch;
      await prisma.phoneMessage.deleteMany({
        where: { callSid: { in: [incomingSid, generalSid] } },
      });
      await prisma.phoneConfig.delete({ where: { id: "main" } });
      await prisma.$disconnect();
      process.env = savedEnv;
    }
  },
);
