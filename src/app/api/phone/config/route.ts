import { prisma } from "@/lib/prisma";
import { denied, phoneUser } from "@/lib/phone/access";
import { parseContacts } from "@/lib/phone/core";
import { providerReady } from "@/lib/phone/provider";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!(await phoneUser(true))) return denied();
  const config = await prisma.phoneConfig.findUnique({ where: { id: "main" } });
  return Response.json({
    config: config ?? {
      enabled: false,
      greeting: "Thank you for calling the laundromat.",
      information:
        "Please leave a general message for hours, location, or payment questions.",
      contacts: [],
      retrySeconds: 120,
      maxAttempts: 6,
    },
    workerHealthy:
      !!config?.workerLastSeenAt &&
      Date.now() - config.workerLastSeenAt.getTime() < 30000,
    providerReady: providerReady(),
    workerEnabled: process.env.PHONE_WORKER_ENABLED === "true",
    number: process.env.TWILIO_PHONE_NUMBER || null,
  });
}
export async function PUT(request: Request) {
  if (!(await phoneUser(true))) return denied();
  try {
    const body = await request.json();
    const contacts = parseContacts(body.contacts);
    if (
      typeof body.enabled !== "boolean" ||
      typeof body.greeting !== "string" ||
      !body.greeting.trim() ||
      body.greeting.length > 500 ||
      typeof body.information !== "string" ||
      !body.information.trim() ||
      body.information.length > 2000 ||
      !Number.isInteger(body.retrySeconds) ||
      body.retrySeconds < 120 ||
      body.retrySeconds > 900 ||
      !Number.isInteger(body.maxAttempts) ||
      body.maxAttempts < 1 ||
      body.maxAttempts > 10
    )
      throw new Error(
        "Use a greeting, information message, a retry interval of 120–900 seconds, and 1–10 attempts.",
      );
    if (contacts.some((c) => c.number === process.env.TWILIO_PHONE_NUMBER))
      throw new Error(
        "An on-call contact cannot be the incoming telephone number.",
      );
    if (
      body.enabled &&
      (!contacts.length ||
        !providerReady() ||
        process.env.PHONE_WORKER_ENABLED !== "true")
    )
      throw new Error(
        "Configure Twilio, the escalation worker, and at least one contact before enabling the line.",
      );
    const data = {
      enabled: body.enabled,
      greeting: body.greeting.trim(),
      information: body.information.trim(),
      contacts,
      retrySeconds: body.retrySeconds,
      maxAttempts: body.maxAttempts,
    };
    const config = await prisma.phoneConfig.upsert({
      where: { id: "main" },
      create: { id: "main", ...data },
      update: data,
    });
    return Response.json({ config });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error ? error.message : "Invalid phone settings.",
      },
      { status: 400 },
    );
  }
}
