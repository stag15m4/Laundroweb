import { providerAuth } from "./provider";
import { recordingPattern } from "./core";

export async function transcribePhoneRecording(recordingSid: string): Promise<{ text: string; language: string | null }> {
  if (!process.env.OPENAI_API_KEY) throw new Error("Multilingual transcription needs OPENAI_API_KEY.");
  if (!recordingPattern.test(recordingSid)) throw new Error("Invalid recording identifier.");
  const audio = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Recordings/${recordingSid}.mp3`, {
    headers: { Authorization: providerAuth() }, signal: AbortSignal.timeout(10000), redirect: "error",
  });
  if (!audio.ok || !audio.body) throw new Error("Recording unavailable for analysis.");
  const reader = audio.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 5 * 1024 * 1024) { await reader.cancel(); throw new Error("Recording exceeds analysis size limit."); }
    chunks.push(value);
  }
  const file = new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
  const body = new FormData();
  body.set("file", file, "voicemail.mp3");
  body.set("model", process.env.PHONE_TRANSCRIPTION_MODEL || "gpt-transcribe");
  body.set("response_format", "json");
  // Auto-detect; do not force English or translate Creole as French.
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body, signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`Multilingual transcription returned HTTP ${response.status}.`);
  const result = await response.json();
  if (typeof result.text !== "string" || !result.text.trim()) throw new Error("No intelligible transcript.");
  const language = typeof result.language === "string" ? result.language :
    Array.isArray(result.languages) && result.languages.every((l: unknown) => typeof l === "string") ? result.languages.join(", ") : null;
  return { text: result.text.trim().slice(0, 10000), language: language?.slice(0, 100) || null };
}
