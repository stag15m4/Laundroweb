import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateWebhook, phoneUrl } from "@/lib/phone/provider";
import {
  acknowledges,
  phonePattern,
  recordingPattern,
  sidPattern,
  twiml,
  xml,
} from "@/lib/phone/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const say = (text: string) => `<Say>${xml(text)}</Say>`;
const endpoint = (event: string, query = "") =>
  xml(phoneUrl(`/api/phone/webhooks/${event}${query}`));
const end = () =>
  twiml(say("Thank you. Your message has been saved.") + "<Hangup/>");
function unavailable() {
  const fallback = process.env.PHONE_FALLBACK_NUMBER || "";
  return twiml(
    phonePattern.test(fallback) && fallback !== process.env.TWILIO_PHONE_NUMBER
      ? `<Dial timeout="25">${xml(fallback)}</Dial>`
      : say(
          "The laundromat phone service is currently unavailable. Please try again later. For an immediate threat to life or safety, hang up and call 9 1 1.",
        ) + "<Hangup/>",
  );
}
function menu(greeting: string, audioUrl: string | null = null) {
  return twiml(
    `<Gather numDigits="1" timeout="7" action="${endpoint("menu")}" method="POST" actionOnEmptyResult="true">` +
      (audioUrl ? `<Play>${xml(audioUrl)}</Play>` : say(
        `${greeting} Hours, press 1. Leave a message, press 2. Urgent problem, press 9. For immediate danger, call 9 1 1.`,
      ) + '<Say language="es-MX">Para dejar un mensaje, oprima dos.</Say>') +
      "</Gather>",
  );
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ event: string }> },
) {
  const form = await authenticateWebhook(req);
  if (!form)
    return Response.json(
      { message: "Invalid telephone provider signature or configuration." },
      { status: 403 },
    );
  const { event } = await context.params;
  const callSid = form.get("CallSid") || "";
  if (!sidPattern.test(callSid))
    return Response.json(
      { message: "Missing call identifier." },
      { status: 400 },
    );

  // Outbound alert callbacks remain valid after the line is paused: an in-flight
  // acknowledgment must still be able to stop retries.
  if (["alert", "ack", "status"].includes(event)) {
    const attemptId = req.nextUrl.searchParams.get("attempt") || "";
    const attempt = await prisma.phoneAttempt.findUnique({
      where: { id: attemptId },
      include: { message: true },
    });
    if (
      !attempt ||
      form.get("To") !== attempt.destination ||
      form.get("From") !== process.env.TWILIO_PHONE_NUMBER ||
      (attempt.callSid && attempt.callSid !== callSid) ||
      attempt.status === "CANCELED"
    ) {
      return Response.json({ message: "Unknown alert call." }, { status: 403 });
    }
    if (!attempt.callSid) {
      // Twilio can deliver a callback before the create-call response returns.
      const bound = await prisma.phoneAttempt.updateMany({
        where: { id: attempt.id, callSid: null },
        data: { callSid },
      });
      if (!bound.count) {
        const existing = await prisma.phoneAttempt.findUnique({
          where: { id: attempt.id },
        });
        if (existing?.callSid !== callSid)
          return Response.json(
            { message: "Alert call mismatch." },
            { status: 403 },
          );
      }
    }
    if (event === "status") {
      const status = form.get("CallStatus") || "unknown";
      if (
        [
          "queued",
          "initiated",
          "ringing",
          "in-progress",
          "completed",
          "busy",
          "failed",
          "no-answer",
          "canceled",
        ].includes(status)
      ) {
        await prisma.phoneAttempt.updateMany({
          where: { id: attempt.id, status: { not: "ACKNOWLEDGED" } },
          data: { status },
        });
      }
      return new Response(null, { status: 204 });
    }
    if (event === "ack") {
      if (acknowledges(form.get("Digits"))) {
        await prisma.$transaction(async (tx) => {
          await tx.phoneMessage.updateMany({
            where: { id: attempt.messageId, status: "OPEN" },
            data: {
              status: "ACKNOWLEDGED",
              acknowledgedAt: new Date(),
              acknowledgedBy: attempt.contactName,
              nextAttemptAt: null,
            },
          });
          await tx.phoneAttempt.update({
            where: { id: attempt.id },
            data: { status: "ACKNOWLEDGED" },
          });
        });
        return twiml(
          say(
            "Acknowledged. Further alert calls for this message have stopped. Please contact the caller and resolve the issue in Laundroweb.",
          ) + "<Hangup/>",
        );
      }
      return twiml(
        say("No acknowledgment received. The alert remains open.") +
          "<Hangup/>",
      );
    }
    if (attempt.message.status !== "OPEN")
      return twiml(say("This alert has already been handled.") + "<Hangup/>");
    const details = attempt.message.transcript
      ? `The message says: ${attempt.message.transcript.slice(0, 1500)}`
      : "Open the phone inbox in Laundroweb to check the message and recording.";
    return twiml(
      `<Gather numDigits="1" timeout="10" action="${endpoint("ack", `?attempt=${attempt.id}`)}" method="POST" actionOnEmptyResult="true">` +
        say(
          `Laundromat alert. ${attempt.message.triageLevel}. ${attempt.message.triageReason || ""} Caller: ${attempt.message.caller}. ${details} Press 1 to acknowledge and stop further alerts.`,
        ) +
        "</Gather>",
    );
  }

  if (["recorded", "recording", "transcription"].includes(event)) {
    const id = req.nextUrl.searchParams.get("message") || "";
    const message = await prisma.phoneMessage.findUnique({ where: { id } });
    if (!message || message.callSid !== callSid)
      return Response.json(
        { message: "Unknown voicemail call." },
        { status: 403 },
      );
    const recordingSid = form.get("RecordingSid") || "";
    if (
      recordingSid &&
      (!recordingPattern.test(recordingSid) ||
        (message.recordingSid && message.recordingSid !== recordingSid))
    ) {
      return Response.json({ message: "Recording mismatch." }, { status: 403 });
    }
    if (event === "transcription") {
      if (
        form.get("TranscriptionStatus") === "completed" &&
        recordingPattern.test(recordingSid)
      ) {
        const transcript = (form.get("TranscriptionText") || "").trim().slice(0, 10000);
        if (transcript) await prisma.phoneMessage.updateMany({
          where: { id, transcript: null },
          data: { transcript },
        });
      }
      return new Response(null, { status: 204 });
    }
    if (recordingPattern.test(recordingSid)) {
      const duration = Number(form.get("RecordingDuration"));
      await prisma.phoneMessage.update({
        where: { id },
        data: {
          recordingSid,
          ...(Number.isFinite(duration) && duration >= 0
            ? { duration: Math.min(Math.floor(duration), 120) }
            : {}),
        },
      });
    }
    // Do not reschedule here: callbacks can be retried after acknowledgment.
    // Urgent alerts were durably scheduled when the caller pressed 9.
    return event === "recorded" ? end() : new Response(null, { status: 204 });
  }

  const config = await prisma.phoneConfig.findUnique({ where: { id: "main" } });
  if (!config?.enabled) return unavailable();
  if (form.get("To") !== process.env.TWILIO_PHONE_NUMBER)
    return Response.json(
      { message: "Wrong receiving number." },
      { status: 403 },
    );
  if (event === "incoming") return menu(config.greeting, config.greetingAudioUrl);
  if (event !== "menu")
    return Response.json({ message: "Unknown phone event." }, { status: 404 });
  const digit = form.get("Digits");
  if (digit === "1")
    return twiml(
      say(config.information) +
        `<Redirect method="POST">${endpoint("incoming")}</Redirect>`,
    );
  // A keypad selection is required: automated calls cannot fill the inbox.
  if (digit !== "2" && digit !== "9")
    return twiml(say("No valid selection received. Please call again and choose a menu option.") + "<Hangup/>");
  const urgent = digit === "9";
  const message = await prisma.phoneMessage.upsert({
    where: { callSid },
    update: {},
    create: {
      callSid,
      caller: (form.get("From") || "Unknown").slice(0, 100),
      urgent,
      // Gives the caller time to record. A hangup still generates an urgent alert.
      nextAttemptAt: urgent ? new Date(Date.now() + 60000) : null,
    },
  });
  // A retried menu request must never reopen an acknowledged/resolved incident.
  if (message.status !== "OPEN" || message.recordingSid) return end();
  return twiml(
    say(
      "After the tone, leave your name, callback number, and what happened. Messages are reviewed for urgency. For immediate danger, call 9 1 1.",
    ) +
      `<Record maxLength="120" timeout="5" finishOnKey="#" playBeep="true" action="${endpoint("recorded", `?message=${message.id}`)}" method="POST" recordingStatusCallback="${endpoint("recording", `?message=${message.id}`)}" recordingStatusCallbackMethod="POST" recordingStatusCallbackEvent="completed" transcribe="true" transcribeCallback="${endpoint("transcription", `?message=${message.id}`)}"/>` +
      "<Hangup/>",
  );
}
