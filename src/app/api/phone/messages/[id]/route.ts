import { prisma } from "@/lib/prisma";
import { savePhoneMessageDetails } from "@/lib/phone/notes";
import { markPhoneMessageRead } from "@/lib/phone/notifications";
import { denied, phoneUser } from "@/lib/phone/access";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await phoneUser();
  if (!user) return denied();
  const { id } = await context.params;
  let action: unknown;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
    action = body.action;
  } catch {
    return Response.json({ message: "Invalid request." }, { status: 400 });
  }
  if (action !== "acknowledge" && action !== "resolve" && action !== "read" && action !== "save-details")
    return Response.json(
      { message: "Choose read, save-details, acknowledge or resolve." },
      { status: 400 },
    );
  const exists = await prisma.phoneMessage.findUnique({ where: { id } });
  if (!exists)
    return Response.json({ message: "Message not found." }, { status: 404 });
  if (action === "save-details") {
    try {
      await savePhoneMessageDetails(id, user, body.customerName, body.note);
      return Response.json({ message: "Customer details and note saved." });
    } catch (error) {
      const invalid = error instanceof Error && error.message.startsWith("Use a customer name");
      return Response.json({ message: invalid ? (error as Error).message : "Could not save call details. Please try again." }, { status: invalid ? 400 : 500 });
    }
  }
  if (action === "read") {
    await markPhoneMessageRead(id, user.id);
    return Response.json({ message: "Message marked read." });
  }
  await prisma.phoneMessage.updateMany({
    where: {
      id,
      status: action === "acknowledge" ? "OPEN" : { not: "RESOLVED" },
    },
    data:
      action === "acknowledge"
        ? {
            status: "ACKNOWLEDGED",
            acknowledgedAt: new Date(),
            acknowledgedBy: user.name,
            nextAttemptAt: null,
          }
        : {
            status: "RESOLVED",
            resolvedAt: new Date(),
            resolvedBy: user.name,
            nextAttemptAt: null,
          },
  });
  await markPhoneMessageRead(id, user.id);
  return Response.json({
    message:
      action === "acknowledge"
        ? "Alert acknowledged; further calls stopped."
        : "Message resolved; further calls stopped.",
  });
}
