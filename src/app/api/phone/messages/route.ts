import { prisma } from "@/lib/prisma";
import { denied, phoneUser } from "@/lib/phone/access";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await phoneUser();
  if (!user) return denied();
  const query = new URL(request.url).searchParams;
  const cursor = query.get("cursor");
  const filter = query.get("filter") || "active";
  if (!["active", "all", "urgent", "resolved"].includes(filter))
    return Response.json({ message: "Invalid inbox filter." }, { status: 400 });
  const statusFilter =
    filter === "all"
      ? {}
      : filter === "resolved"
        ? { status: "RESOLVED" }
        : {
            status: { not: "RESOLVED" },
            ...(filter === "urgent" ? { urgent: true } : {}),
          };
  const history = query.get("history")?.trim() || "";
  if (history.length > 120)
    return Response.json({ message: "Search must be 120 characters or fewer." }, { status: 400 });
  let where: import("@prisma/client").Prisma.PhoneMessageWhereInput = statusFilter;
  if (history) {
    if (/^[+()0-9.\s-]+$/.test(history)) {
      const digits = history.replace(/\D/g, "");
      const international = history.startsWith("+") ? digits : digits.length === 10 ? "1" + digits : digits;
      if (!/^[1-9]\d{6,14}$/.test(international))
        return Response.json({ message: "Enter a complete phone number." }, { status: 400 });
      const numbers = ["+" + international, international];
      if (/^1\d{10}$/.test(international)) numbers.push(international.slice(1));
      where = { AND: [statusFilter, { caller: { in: numbers } }] };
    } else {
      const name = { contains: history.replace(/[\\%_]/g, "\\$&"), mode: "insensitive" as const };
      const matches = await prisma.phoneMessage.findMany({
        where: { customerName: name }, distinct: ["caller"], select: { caller: true },
      });
      const numbers = matches.map(row => row.caller).filter(number => /^\+?[1-9]\d{6,14}$/.test(number));
      where = { AND: [statusFilter, { OR: [
        { customerName: name }, { customerName: null, caller: { in: numbers } },
      ] }] };
    }
  }
  if (history) {
    const [rows, openUrgent] = await Promise.all([
      prisma.phoneMessage.findMany({
        where, take: 51,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, caller: true, customerName: true, createdAt: true,
          notes: { orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { id: true, body: true, createdAt: true, authorName: true } } },
      }),
      prisma.phoneMessage.count({ where: { urgent: true, status: "OPEN" } }),
    ]);
    return Response.json({ messages: rows.slice(0, 50), openUrgent, nextCursor: rows.length > 50 ? rows[49].id : null });
  }
  const [rows, openUrgent] = await Promise.all([
    prisma.phoneMessage.findMany({
      where,
      take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { notes: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, authorName: true, body: true, createdAt: true } }, attempts: { orderBy: { sequence: "asc" } }, reads: { where: { userId: user.id }, select: { readAt: true } } },
    }),
    prisma.phoneMessage.count({ where: { urgent: true, status: "OPEN" } }),
  ]);
  const messages = rows.slice(0, 50).map(({ reads, ...message }) => ({ ...message, unread: reads.length === 0 }));
  return Response.json({
    messages,
    openUrgent,
    nextCursor: rows.length > 50 ? messages[messages.length - 1].id : null,
  });
}
