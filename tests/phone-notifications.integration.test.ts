import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

test("phone unread counts are per-user and read receipts do not acknowledge alerts", { skip: !process.env.PHONE_TEST_DATABASE_URL }, async () => {
  const savedUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = process.env.PHONE_TEST_DATABASE_URL;
  const { prisma } = await import("../src/lib/prisma");
  const { getPhoneNotificationSummary, markPhoneMessageRead } = await import("../src/lib/phone/notifications");
  const { savePhoneMessageDetails, parsePhoneMessageDetails } = await import("../src/lib/phone/notes");
  const tag = randomUUID();
  const users: string[] = [];
  const messages: string[] = [];
  try {
    for (const name of ["Owner", "Staff"]) {
      const user = await prisma.user.create({ data: { name, email: `${tag}-${name}@example.invalid`, password: "test-only-unused-hash", role: name === "Owner" ? "OWNER" : "STAFF" } });
      users.push(user.id);
    }
    const create = async (data: Record<string, unknown>) => {
      const message = await prisma.phoneMessage.create({ data: { callSid: "CA" + randomUUID().replaceAll("-", ""), caller: "+19195551234", ...data } });
      messages.push(message.id); return message;
    };
    const baseline = await getPhoneNotificationSummary(users[0]);
    const routine = await create({ recordingSid: "RE" + randomUUID().replaceAll("-", ""), triageLevel: "ROUTINE" });
    const due = new Date(Date.now() + 60000);
    const urgent = await create({ urgent: true, triageLevel: "CRITICAL", nextAttemptAt: due });
    await create({}); // caller is still recording: not a new voicemail yet
    await create({ status: "RESOLVED", recordingSid: "RE" + randomUUID().replaceAll("-", "") });
    assert.equal((await getPhoneNotificationSummary(users[0])).unreadCount, baseline.unreadCount + 2);
    await markPhoneMessageRead(routine.id, users[0]);
    await markPhoneMessageRead(routine.id, users[0]); // idempotent
    assert.equal((await getPhoneNotificationSummary(users[0])).unreadCount, baseline.unreadCount + 1);
    assert.equal((await getPhoneNotificationSummary(users[1])).unreadCount, baseline.unreadCount + 2);
    await markPhoneMessageRead(urgent.id, users[0]);
    const readSummary = await getPhoneNotificationSummary(users[0]);
    assert.equal(readSummary.unreadCount, baseline.unreadCount);
    assert.equal(readSummary.openUrgent, baseline.openUrgent + 1);
    const stillOpen = await prisma.phoneMessage.findUniqueOrThrow({ where: { id: urgent.id } });
    assert.equal(stillOpen.status, "OPEN");
    assert.equal(stillOpen.acknowledgedAt, null);
    assert.equal(stillOpen.nextAttemptAt?.getTime(), due.getTime());
    await prisma.phoneMessage.update({ where: { id: urgent.id }, data: { status: "RESOLVED", nextAttemptAt: null } });
    assert.equal((await getPhoneNotificationSummary(users[1])).unreadCount, baseline.unreadCount + 1);
    const author = { id: users[0], name: "Owner" };
    assert.throws(() => parsePhoneMessageDetails("x".repeat(121), "note"));
    assert.throws(() => parsePhoneMessageDetails("Customer", "x".repeat(5001)));
    await Promise.all([
      savePhoneMessageDetails(routine.id, author, "  Test Customer  ", "Refunded vending purchase."),
      savePhoneMessageDetails(routine.id, author, "Test Customer", "Confirmed vending machine now works."),
    ]);
    const withNotes = await prisma.phoneMessage.findUniqueOrThrow({ where: { id: routine.id }, include: { notes: true } });
    assert.equal(withNotes.customerName, "Test Customer");
    assert.equal(withNotes.notes.length, 2);
    assert.ok(withNotes.notes.every(note => note.authorId === users[0] && note.authorName === "Owner"));
    assert.equal(withNotes.status, "OPEN");
    assert.equal(withNotes.nextAttemptAt, null);
    assert.equal((await getPhoneNotificationSummary(users[1])).unreadCount, baseline.unreadCount + 1);
    // Notes can be added after resolving a call, without reopening it.
    await savePhoneMessageDetails(urgent.id, author, "Customer", "Hose replaced and floor dried.");
    assert.equal((await prisma.phoneMessage.findUniqueOrThrow({ where: { id: urgent.id } })).status, "RESOLVED");
  } finally {
    await prisma.phoneMessage.deleteMany({ where: { id: { in: messages } } });
    assert.equal(await prisma.phoneMessageRead.count({ where: { userId: { in: users } } }), 0);
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
    if (savedUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = savedUrl;
  }
});
