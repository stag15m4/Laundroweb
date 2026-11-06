import { prisma } from "../prisma";

export function parsePhoneMessageDetails(customerName: unknown, note: unknown) {
  if (typeof customerName !== "string" || customerName.length > 120 || typeof note !== "string" || note.length > 5000)
    throw new Error("Use a customer name of up to 120 characters and a note of up to 5,000 characters.");
  return { customerName: customerName.trim() || null, note: note.trim() };
}

export async function savePhoneMessageDetails(messageId: string, author: { id: string; name: string }, customerName: unknown, note: unknown) {
  const details = parsePhoneMessageDetails(customerName, note);
  return prisma.$transaction(async tx => {
    await tx.phoneMessage.update({ where: { id: messageId }, data: { customerName: details.customerName } });
    if (details.note) await tx.phoneMessageNote.create({ data: { messageId, authorId: author.id, authorName: author.name, body: details.note } });
    await tx.phoneMessageRead.upsert({ where: { messageId_userId: { messageId, userId: author.id } },
      create: { messageId, userId: author.id }, update: {} });
  });
}
