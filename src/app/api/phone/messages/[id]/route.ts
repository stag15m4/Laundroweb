import { prisma } from "@/lib/prisma";
import { denied, phoneUser } from "@/lib/phone/access";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await phoneUser();
  if (!user) return denied();
  const { id } = await context.params;
  let action: unknown;
  try {
    action = (await request.json()).action;
  } catch {
    return Response.json({ message: "Invalid request." }, { status: 400 });
  }
  if (action !== "acknowledge" && action !== "resolve")
    return Response.json(
      { message: "Choose acknowledge or resolve." },
      { status: 400 },
    );
  const exists = await prisma.phoneMessage.findUnique({ where: { id } });
  if (!exists)
    return Response.json({ message: "Message not found." }, { status: 404 });
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
  return Response.json({
    message:
      action === "acknowledge"
        ? "Alert acknowledged; further calls stopped."
        : "Message resolved; further calls stopped.",
  });
}
