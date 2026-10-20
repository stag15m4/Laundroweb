import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { escalationTarget, parseContacts } from "./core";
import { placeAlertCall, providerReady } from "./provider";

// Database leases survive deployments and prevent multiple app processes from
// placing the same scheduled attempt. Every attempt is committed before dialing.
export async function processPhoneAlerts() {
  if (process.env.PHONE_WORKER_ENABLED !== "true" || !providerReady()) return;
  const config = await prisma.phoneConfig.upsert({
    where: { id: "main" },
    create: { id: "main", workerLastSeenAt: new Date() },
    update: { workerLastSeenAt: new Date() },
  });
  if (!config?.enabled) return;
  const contacts = parseContacts(config.contacts);
  if (!contacts.length) return;
  const now = new Date();
  const due = await prisma.phoneMessage.findMany({
    where: {
      urgent: true,
      status: "OPEN",
      escalationEnded: false,
      nextAttemptAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    take: 10,
    orderBy: { nextAttemptAt: "asc" },
  });
  for (const message of due) {
    const leaseToken = randomUUID();
    const claim = await prisma.phoneMessage.updateMany({
      where: {
        id: message.id,
        status: "OPEN",
        escalationEnded: false,
        nextAttemptAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      data: { leaseToken, leaseUntil: new Date(Date.now() + 60000) },
    });
    if (!claim.count) continue;
    try {
      if (message.attemptCount >= config.maxAttempts) {
        await prisma.phoneMessage.updateMany({
          where: { id: message.id, leaseToken },
          data: { escalationEnded: true, nextAttemptAt: null },
        });
        continue;
      }
      const contact = escalationTarget(contacts, message.attemptCount)!;
      const attempt = await prisma.$transaction(async (tx) => {
        const advanced = await tx.phoneMessage.updateMany({
          where: { id: message.id, leaseToken, status: "OPEN" },
          data: {
            attemptCount: { increment: 1 },
            nextAttemptAt: new Date(Date.now() + config.retrySeconds * 1000),
          },
        });
        if (!advanced.count) return null;
        return tx.phoneAttempt.create({
          data: {
            messageId: message.id,
            sequence: message.attemptCount + 1,
            destination: contact.number,
            contactName: contact.name,
          },
        });
      });
      if (!attempt) continue;
      // Acknowledge/resolve may race with scheduling. Avoid dialing if it has.
      const current = await prisma.phoneMessage.findUnique({
        where: { id: message.id },
      });
      if (current?.status !== "OPEN") {
        await prisma.phoneAttempt.update({
          where: { id: attempt.id },
          data: { status: "CANCELED" },
        });
        continue;
      }
      try {
        const callSid = await placeAlertCall(contact.number, attempt.id);
        await prisma.phoneAttempt.update({
          where: { id: attempt.id },
          data: { callSid },
        });
      } catch (error) {
        // A network timeout may mean Twilio accepted the call. Do not immediately
        // retry this attempt: the next bounded attempt waits the full interval.
        await prisma.phoneAttempt.update({
          where: { id: attempt.id },
          data: {
            status: "DELIVERY_UNCERTAIN",
            error:
              error instanceof Error
                ? error.message
                : "Call could not be confirmed.",
          },
        });
      }
    } finally {
      await prisma.phoneMessage.updateMany({
        where: { id: message.id, leaseToken },
        data: { leaseUntil: null, leaseToken: null },
      });
    }
  }
}

const state = globalThis as unknown as {
  phoneWorker?: ReturnType<typeof setInterval>;
  phoneWorkerBusy?: boolean;
};
export function startPhoneWorker() {
  if (state.phoneWorker || process.env.PHONE_WORKER_ENABLED !== "true") return;
  const tick = async () => {
    if (state.phoneWorkerBusy) return;
    state.phoneWorkerBusy = true;
    try {
      await processPhoneAlerts();
    } catch (error) {
      console.error(
        "Phone escalation worker failed",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      state.phoneWorkerBusy = false;
    }
  };
  state.phoneWorker = setInterval(tick, 5000);
  state.phoneWorker.unref();
  void tick();
}
