import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyPhoneMessage, hazardPhrase, parseTriage, bypassOnCallHours, triageSystem } from "../src/lib/phone/triage";
import { transcribePhoneRecording } from "../src/lib/phone/transcribe";

test("current hazard phrases bypass hours in English, Spanish and Haitian Creole", async () => {
  for (const text of [
    "The floor is flooding from a busted hose.", "I need a Sprite refund but water is gushing from the washer.",
    "La manguera está rota y el piso se está inundando.", "Gen dife nan seche rad la.", "Tiyo a pete, dlo ap anvayi sal la.",
  ]) {
    const result = await classifyPhoneMessage(text, async () => { throw new Error("AI should not be needed"); });
    assert.equal(result.level, "CRITICAL", text);
    assert.equal(result.source, "KEYWORD");
    assert.equal(bypassOnCallHours(result.level), true);
  }
});
test("negated and historical hazards need context analysis rather than keyword escalation", () => {
  for (const text of ["There is no flooding.", "The floor was flooding yesterday.", "Pa gen dife.", "No hay incendio.", "The machine did not vend my Sprite."])
    assert.equal(hazardPhrase(text), null, text);
  assert.ok(hazardPhrase("There is no flooding but smoke coming from the dryer."));
});
test("routine issues stay in the inbox while service issues respect hours", async () => {
  for (const [text, level] of [
    ["The machine didn't vend my Sprite", "ROUTINE"],
    ["La máquina no me dio mi refresco", "ROUTINE"],
    ["Machin nan pa bay bwason mwen an", "ROUTINE"],
    ["My clothes are stuck inside a washer", "URGENT"],
  ]) {
    const result = await classifyPhoneMessage(text, async () => JSON.stringify({ level, reason: "Fixture", englishSummary: text }));
    assert.equal(result.level, level);
    assert.equal(bypassOnCallHours(result.level), false);
  }
});
test("failed or malformed AI output requires human review at any hour", async () => {
  for (const analyze of [async () => { throw new Error("Timeout"); }, async () => "not json", async () => '{"level":"ROUTINE"}']) {
    const result = await classifyPhoneMessage("Something is wrong", analyze);
    assert.equal(result.level, "REVIEW");
    assert.equal(bypassOnCallHours(result.level), true);
  }
  assert.throws(() => parseTriage('{"level":"IGNORE","reason":"x"}'));
  assert.match(triageSystem, /untrusted DATA/);
  assert.match(triageSystem, /Haitian Creole is not French/);
});
test("audio transcription fetches only authenticated Twilio media and preserves multilingual text", async () => {
  const savedEnv = { ...process.env };
  const savedFetch = globalThis.fetch;
  try {
    process.env.OPENAI_API_KEY = "fixture";
    process.env.TWILIO_ACCOUNT_SID = "AC" + "a".repeat(32);
    process.env.TWILIO_AUTH_TOKEN = "fixture";
    let calls = 0;
    globalThis.fetch = async (input, init) => {
      calls++;
      if (calls === 1) {
        assert.match(String(input), /^https:\/\/api.twilio.com\/2010-04-01\/Accounts\/AC[a-f0-9]{32}\/Recordings\/RE[a-f0-9]{32}\.mp3$/);
        assert.equal(init?.redirect, "error");
        return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/mpeg" } });
      }
      assert.equal(String(input), "https://api.openai.com/v1/audio/transcriptions");
      const body = init?.body as FormData;
      assert.equal(body.get("model"), "gpt-transcribe");
      assert.equal(body.get("language"), null);
      assert.ok(body.get("file") instanceof Blob);
      return Response.json({ text: "Tiyo a pete.", languages: ["ht"] });
    };
    assert.deepEqual(await transcribePhoneRecording("RE" + "b".repeat(32)), { text: "Tiyo a pete.", language: "ht" });
    assert.equal(calls, 2);
    await assert.rejects(() => transcribePhoneRecording("https://attacker.example/recording"), /identifier/);
  } finally { globalThis.fetch = savedFetch; process.env = savedEnv; }
});

test("classifier uses the phone OpenAI key and strict structured output", async () => {
  const savedEnv = { ...process.env };
  const savedFetch = globalThis.fetch;
  try {
    process.env.OPENAI_API_KEY = "fixture-phone-key";
    process.env.ANTHROPIC_API_KEY = "unrelated-manuals-key";
    delete process.env.PHONE_TRIAGE_MODEL;
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), "https://api.openai.com/v1/responses");
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer fixture-phone-key");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "gpt-6-luna");
      assert.equal(body.store, false);
      assert.equal(body.reasoning.effort, "low");
      assert.equal(body.text.format.type, "json_schema");
      assert.equal(body.text.format.strict, true);
      return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ level: "ROUTINE", reason: "Isolated vending refund with no safety issue.", englishSummary: "Sprite did not vend." }) }] }] });
    };
    const result = await classifyPhoneMessage("This is a test. The vending machine didn't dispense my Sprite. There is no safety issue.");
    assert.equal(result.level, "ROUTINE");
    assert.equal(result.source, "AI");
  } finally { process.env = savedEnv; globalThis.fetch = savedFetch; }
});
test("classifier failures report safe status metadata, never a provider's secret-bearing body", async () => {
  const savedEnv = { ...process.env };
  const savedFetch = globalThis.fetch;
  try {
    process.env.OPENAI_API_KEY = "fixture-phone-key";
    for (const [status, code] of [[401, "invalid_api_key"], [403, "permission_denied"], [429, "insufficient_quota"], [404, "model_not_found"]] as const) {
      globalThis.fetch = async () => Response.json({ error: { code, message: "secret-marker-must-not-appear" } }, { status });
      const result = await classifyPhoneMessage("Vending machine refund request");
      assert.equal(result.level, "REVIEW");
      assert.match(result.reason, new RegExp(`HTTP ${status}`));
      assert.ok(result.reason.includes(code));
      assert.ok(!result.reason.includes("secret-marker"));
    }
    globalThis.fetch = async () => Response.json({ status: "incomplete", output: [] });
    assert.match((await classifyPhoneMessage("Vending machine refund")).reason, /did not complete/);
    globalThis.fetch = async () => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "No" }] }] });
    assert.equal((await classifyPhoneMessage("Vending machine refund")).level, "REVIEW");
  } finally { process.env = savedEnv; globalThis.fetch = savedFetch; }
});
