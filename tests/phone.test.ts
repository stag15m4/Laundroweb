import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acknowledges,
  escalationTarget,
  parseContacts,
  validSignature,
  xml,
} from "../src/lib/phone/core";
import { authenticateWebhook } from "../src/lib/phone/provider";
import { getExpectedTwilioSignature } from "twilio";

test("Twilio signature binds the public URL, callback query, and all form fields", () => {
  // Fixed signature fixture: changing any field or callback URL invalidates it.
  const fields = new URLSearchParams({
    CallSid: "CA1234567890ABCDE",
    Caller: "+14158675310",
    Digits: "1234",
    From: "+14158675310",
    To: "+18005551212",
  });
  const url = "https://mycompany.com/myapp.php?foo=1&bar=2";
  assert.equal(
    validSignature("12345", url, fields, "GvWf1cFY/Q7PnoempGyD5oXAezc="),
    true,
  );
  assert.equal(
    validSignature("12345", url + "x", fields, "GvWf1cFY/Q7PnoempGyD5oXAezc="),
    false,
  );
  fields.set("Digits", "1");
  assert.equal(
    validSignature("12345", url, fields, "GvWf1cFY/Q7PnoempGyD5oXAezc="),
    false,
  );
  assert.equal(validSignature("12345", url, fields, ""), false);
});

test("webhooks use the configured origin rather than an untrusted proxy host", async () => {
  const saved = { ...process.env };
  try {
    process.env.TWILIO_ACCOUNT_SID = "AC" + "a".repeat(32);
    process.env.TWILIO_AUTH_TOKEN = "test-token";
    process.env.TWILIO_PHONE_NUMBER = "+19195551234";
    process.env.PHONE_PUBLIC_URL = "https://phone.example.com";
    const form = {
      AccountSid: process.env.TWILIO_ACCOUNT_SID,
      CallSid: "CA" + "b".repeat(32),
      Digits: "9",
    };
    const path = "/api/phone/webhooks/menu";
    const request = (signature: string) =>
      new Request("http://internal:3000" + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "x-twilio-signature": signature,
        },
        body: new URLSearchParams(form),
      });
    assert.ok(
      await authenticateWebhook(
        request(
          getExpectedTwilioSignature(
            "test-token",
            "https://phone.example.com" + path,
            form,
          ),
        ),
      ),
    );
    assert.equal(
      await authenticateWebhook(
        request(
          getExpectedTwilioSignature(
            "test-token",
            "http://internal:3000" + path,
            form,
          ),
        ),
      ),
      null,
    );
    delete process.env.TWILIO_AUTH_TOKEN;
    assert.equal(await authenticateWebhook(request("")), null);
  } finally {
    process.env = saved;
  }
});

test("urgent acknowledgment requires an explicit 1, never an answered/completed call", () => {
  for (const digit of [null, "", "2", "9", "11", "completed", "answered"])
    assert.equal(acknowledges(digit), false);
  assert.equal(acknowledges("1"), true);
});

test("on-call routing rotates in configured order and rejects unsafe destinations", () => {
  const contacts = parseContacts([
    { name: "Seth", number: "+19195551234" },
    { name: "Backup", number: "+19195551235" },
  ]);
  assert.deepEqual(
    [0, 1, 2, 3].map((i) => escalationTarget(contacts, i)?.name),
    ["Seth", "Backup", "Seth", "Backup"],
  );
  assert.equal(escalationTarget([], 0), undefined);
  for (const input of [
    null,
    {},
    [{ name: "", number: "+19195551234" }],
    [{ name: "Invalid", number: "911" }],
    [{ name: "International", number: "+449999999999" }],
    [...contacts, ...contacts],
  ])
    assert.throws(() => parseContacts(input));
  assert.throws(
    () => parseContacts([contacts[0], contacts[0]]),
    /different number/,
  );
});

test("user-controlled greetings and transcripts cannot inject telephone commands", () => {
  assert.equal(
    xml('<Dial a="x">&\'</Dial>'),
    "&lt;Dial a=&quot;x&quot;&gt;&amp;&apos;&lt;/Dial&gt;",
  );
});
