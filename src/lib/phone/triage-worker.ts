import { randomUUID } from "node:crypto";
import { prisma } from "../prisma";
import { transcribePhoneRecording } from "./transcribe";
import { classifyPhoneMessage, hazardPhrase, type Triage } from "./triage";

// Transcription may arrive after recording. Give it a bounded grace period;
// missing/failed analysis becomes a 24-hour human-review alert, never ROUTINE.
export async function processPhoneTriage(
  classify = classifyPhoneMessage,
  transcribe = transcribePhoneRecording,
) {
  const now = new Date();
  const expired = new Date(now.getTime() - 180000);
  const pending = await prisma.phoneMessage.findMany({
    where: {
      status: "OPEN", triageLevel: "PENDING",
      AND: [
        { OR: [{ triageLeaseUntil: null }, { triageLeaseUntil: { lt: now } }] },
        { OR: [...(process.env.OPENAI_API_KEY ? [{ recordingSid: { not: null } }] : []), { transcript: { not: null } }, { createdAt: { lt: expired }, OR: [{ urgent: true }, { recordingSid: { not: null } }] }] },
      ],
    },
    orderBy: { createdAt: "asc" }, take: 5,
  });
  for (const message of pending) {
    const token = randomUUID();
    const claim = await prisma.phoneMessage.updateMany({
      where: { id: message.id, status: "OPEN", triageLevel: "PENDING",
        OR: [{ triageLeaseUntil: null }, { triageLeaseUntil: { lt: now } }] },
      data: { triageLeaseToken: token, triageLeaseUntil: new Date(Date.now() + 120000) },
    });
    if (!claim.count) continue;
    try {
      let text = message.transcript || "";
      let language: string | null = null;
      let transcriptionSource = "TWILIO_NATIVE";
      let transcriptionError: string | null = null;
      let multilingual = false;
      if (!hazardPhrase(text) && message.recordingSid && process.env.OPENAI_API_KEY) {
        try {
          const transcript = await transcribe(message.recordingSid);
          text = transcript.text;
          language = transcript.language;
          transcriptionSource = "MULTILINGUAL";
          multilingual = true;
        } catch (error) {
          transcriptionError = error instanceof Error ? error.message : "Transcription failed.";
        }
      }
      // English-only native transcripts cannot safely clear a message from a
      // multilingual caller. They can still promote an obvious hazard.
      let result: Triage;
      if (hazardPhrase(text)) result = await classify(text);
      else if (!multilingual) result = { level: "REVIEW", source: "FALLBACK",
        reason: "Multilingual transcription is unavailable. Listen to the recording; this message cannot safely be deferred automatically." };
      else result = await classify(text);
      await prisma.phoneMessage.updateMany({
        // Never reopen an acknowledged/resolved message or classify stale text.
        where: { id: message.id, status: "OPEN", triageLevel: "PENDING", triageLeaseToken: token, transcript: message.transcript },
        data: {
          triageLevel: result.level, triageReason: result.reason, triageSource: result.source,
          triagedAt: new Date(), urgent: result.level !== "ROUTINE",
          transcript: text || null, transcriptLanguage: language, transcriptionSource,
          transcriptionError, englishSummary: result.englishSummary || null,
          nextAttemptAt: result.level === "ROUTINE" ? null : new Date(),
        },
      });
    } finally {
      await prisma.phoneMessage.updateMany({ where: { id: message.id, triageLeaseToken: token },
        data: { triageLeaseUntil: null, triageLeaseToken: null } });
    }
  }
}
