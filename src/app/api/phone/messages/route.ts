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
  const where =
    filter === "all"
      ? {}
      : filter === "resolved"
        ? { status: "RESOLVED" }
        : {
            status: { not: "RESOLVED" },
            ...(filter === "urgent" ? { urgent: true } : {}),
          };
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
