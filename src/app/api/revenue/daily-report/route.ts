import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isBusinessDate, periodsOverlap, reportPeriodFromId } from "@/lib/fascardReportPeriods";

// Dates are inclusive and the immutable IDs preserve coverage even if an
// owner edits the ledger notes. Report coin is reference only.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const start = body?.start ?? body?.day;
  const end = body?.end ?? body?.day;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (!isBusinessDate(start) || !isBusinessDate(end) || start > end || end >= today) {
    return NextResponse.json({ error: "Choose a valid date range of completed business days." }, { status: 400 });
  }
  const validMoney = (value: unknown): value is string =>
    typeof value === "string" && /^\d{1,8}(\.\d{1,2})?$/.test(value);
  if (!validMoney(body.coin) || !validMoney(body.card) || body.confirmed !== true) {
    return NextResponse.json({ error: "Enter both period totals and confirm card revenue has not already been recorded." }, { status: 400 });
  }
  try {
    const entry = await prisma.$transaction(async (tx) => {
      const previous = await tx.revenueEntry.findMany({
        where: { OR: [{ id: { startsWith: "fascard-daily-" } }, { id: { startsWith: "fascard-period-" } }] },
        select: { id: true },
      });
      for (const row of previous) {
        const period = reportPeriodFromId(row.id);
        if (period && periodsOverlap(period, { start, end })) {
          return { conflict: period } as const;
        }
      }
      return { entry: await tx.revenueEntry.create({ data: {
        id: `fascard-period-${start}_${end}`,
        date: new Date(end + "T12:00:00.000Z"),
        amount: body.card,
        source: "CARD",
        notes: `FasCard income report for ${start} through ${end} (inclusive). Reader coin: $${Number(body.coin).toFixed(2)} (reference only; included in physical coin collection). Machine-start card: $${Number(body.card).toFixed(2)}. Washer/dryer breakdown not available.`,
        collectedBy: session.user?.name ?? null,
      } }) } as const;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if ("conflict" in entry && entry.conflict) {
      return NextResponse.json({ error: `This report overlaps an existing report for ${entry.conflict.start} through ${entry.conflict.end}.` }, { status: 409 });
    }
    return NextResponse.json(entry.entry, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A report for this period already exists. Review the existing entry before making a correction." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Another report was saved concurrently. Please try again." }, { status: 409 });
    }
    throw error;
  }
}
