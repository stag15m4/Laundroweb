import { prisma } from "@/lib/prisma";
import { denied, phoneUser } from "@/lib/phone/access";
import { recordingPattern } from "@/lib/phone/core";
import { providerAuth, providerReady } from "@/lib/phone/provider";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await phoneUser())) return denied();
  const { id } = await context.params;
  const message = await prisma.phoneMessage.findUnique({
    where: { id },
    select: { recordingSid: true },
  });
  if (!message?.recordingSid || !recordingPattern.test(message.recordingSid))
    return Response.json(
      { message: "Recording not yet available." },
      { status: 404 },
    );
  if (!providerReady())
    return Response.json(
      { message: "Telephone provider is not configured." },
      { status: 503 },
    );
  // Construct a fixed provider URL from a validated SID. Never fetch a URL from
  // a caller or expose provider credentials / recording URLs to the browser.
  try {
    const audio = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Recordings/${message.recordingSid}.mp3`,
      {
        headers: { Authorization: providerAuth() },
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      },
    );
    if (!audio.ok)
      return Response.json(
        { message: "Recording is unavailable from the telephone provider." },
        { status: 502 },
      );
    return new Response(audio.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { message: "Could not load the recording. Please try again." },
      { status: 502 },
    );
  }
}
