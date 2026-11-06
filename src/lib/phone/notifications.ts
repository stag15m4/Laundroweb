import { prisma } from "../prisma";

export async function getPhoneNotificationSummary(userId: string) {
  const unread = {
    status: { not: "RESOLVED" },
    OR: [{ recordingSid: { not: null } }, { urgent: true }],
    reads: { none: { userId } },
  };
  const [unreadCount, openUrgent] = await Promise.all([
    prisma.phoneMessage.count({ where: unread }),
    prisma.phoneMessage.count({ where: { urgent: true, status: "OPEN" } }),
  ]);
  return { unreadCount, openUrgent };
}

export async function markPhoneMessageRead(messageId: string, userId: string) {
  return prisma.phoneMessageRead.upsert({
    where: { messageId_userId: { messageId, userId } },
    create: { messageId, userId }, update: {},
  });
}
