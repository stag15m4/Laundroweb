import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { coinWeightToDollars, fascardCategoryTotals, WeightUnit } from "@/lib/revenueCollection";

type Weight = { value: number; unit: WeightUnit };

function parseWeight(input: unknown): Weight | null {
  if (!input || typeof input !== "object") return null;
  const value = Number((input as { value?: unknown }).value);
  const unit = (input as { unit?: unknown }).unit;
  if (!Number.isFinite(value) || value <= 0) return null;
  if (unit !== "g" && unit !== "oz") return null;
  return { value, unit };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// POST /api/revenue/collect
// Saves a washer/dryer quarter collection: FasCard-reported revenue for
// reader-equipped machines (recomputed here, never trusted from the client)
// plus the operator's weighed-coin totals for everything else, as one or
// more RevenueEntry rows per category. Nothing about the coin changer's
// cash is saved as revenue -- it isn't any -- it's folded into the notes
// purely so there's a record of it.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const periodStart = body.periodStart ? new Date(body.periodStart) : null;
  const periodEnd = body.periodEnd ? new Date(body.periodEnd) : null;
  if (!periodStart || Number.isNaN(periodStart.getTime()) || !periodEnd || Number.isNaN(periodEnd.getTime())) {
    return NextResponse.json({ error: "periodStart and periodEnd must be valid dates" }, { status: 400 });
  }
  if (periodEnd.getTime() <= periodStart.getTime()) {
    return NextResponse.json({ error: "periodEnd must be after periodStart" }, { status: 400 });
  }

  const washerCoinWeight = body.washerCoinWeight != null ? parseWeight(body.washerCoinWeight) : null;
  if (body.washerCoinWeight != null && !washerCoinWeight) {
    return NextResponse.json({ error: "washerCoinWeight must be a positive number with unit 'g' or 'oz'" }, { status: 400 });
  }
  const dryerCoinWeight = body.dryerCoinWeight != null ? parseWeight(body.dryerCoinWeight) : null;
  if (body.dryerCoinWeight != null && !dryerCoinWeight) {
    return NextResponse.json({ error: "dryerCoinWeight must be a positive number with unit 'g' or 'oz'" }, { status: 400 });
  }

  let changerCash: number | null = null;
  if (body.changerCash != null) {
    changerCash = Number(body.changerCash);
    if (!Number.isFinite(changerCash) || changerCash < 0) {
      return NextResponse.json({ error: "changerCash must be a non-negative number" }, { status: 400 });
    }
  }

  const collectedBy = typeof body.collectedBy === "string" && body.collectedBy.trim() ? body.collectedBy.trim() : null;

  const fascard = await fascardCategoryTotals(periodStart, periodEnd);
  if (fascard.error) {
    return NextResponse.json({ error: `FasCard lookup failed: ${fascard.error}` }, { status: 502 });
  }

  const washerCoinDollars = washerCoinWeight ? coinWeightToDollars(washerCoinWeight.value, washerCoinWeight.unit) : 0;
  const dryerCoinDollars = dryerCoinWeight ? coinWeightToDollars(dryerCoinWeight.value, dryerCoinWeight.unit) : 0;

  const periodLabel = `${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)}`;
  const changerNote =
    changerCash != null
      ? ` Cash removed from the coin changer this round: $${changerCash.toFixed(2)} (not counted as revenue -- it's bills already exchanged for quarters, not new money).`
      : "";

  const rows: {
    date: Date;
    amount: number;
    source: "COIN" | "CARD" | "OTHER";
    machineType: "WASHER" | "DRYER";
    notes: string;
    collectedBy: string | null;
  }[] = [];

  if (fascard.washer.cash > 0) {
    rows.push({
      date: periodEnd,
      amount: round2(fascard.washer.cash),
      source: "COIN",
      machineType: "WASHER",
      notes: `FasCard-reported coin vends, reader-equipped washers, ${periodLabel}.`,
      collectedBy,
    });
  }
  if (fascard.washer.card > 0) {
    rows.push({
      date: periodEnd,
      amount: round2(fascard.washer.card),
      source: "CARD",
      machineType: "WASHER",
      notes: `FasCard-reported card vends, reader-equipped washers, ${periodLabel}.`,
      collectedBy,
    });
  }
  if (washerCoinDollars > 0) {
    rows.push({
      date: periodEnd,
      amount: round2(washerCoinDollars),
      source: "COIN",
      machineType: "WASHER",
      notes: `Weighed coin collection, non-FasCard washers, ${periodLabel} (${washerCoinWeight!.value} ${washerCoinWeight!.unit}).`,
      collectedBy,
    });
  }
  if (fascard.dryer.cash > 0) {
    rows.push({
      date: periodEnd,
      amount: round2(fascard.dryer.cash),
      source: "COIN",
      machineType: "DRYER",
      notes: `FasCard-reported coin vends, reader-equipped dryers, ${periodLabel}.`,
      collectedBy,
    });
  }
  if (fascard.dryer.card > 0) {
    rows.push({
      date: periodEnd,
      amount: round2(fascard.dryer.card),
      source: "CARD",
      machineType: "DRYER",
      notes: `FasCard-reported card vends, reader-equipped dryers, ${periodLabel}.`,
      collectedBy,
    });
  }
  if (dryerCoinDollars > 0) {
    rows.push({
      date: periodEnd,
      amount: round2(dryerCoinDollars),
      source: "COIN",
      machineType: "DRYER",
      notes: `Weighed coin collection, non-FasCard dryers, ${periodLabel} (${dryerCoinWeight!.value} ${dryerCoinWeight!.unit}).`,
      collectedBy,
    });
  }

  if (rows.length === 0 && changerCash == null) {
    return NextResponse.json(
      { error: "Nothing to save -- no FasCard revenue, weighed coin, or changer cash was given." },
      { status: 400 }
    );
  }

  // The changer-cash note rides on whichever row ends up first, so it's
  // recorded exactly once regardless of which categories had real revenue.
  // If nothing else was recorded this round, it still needs a row to live
  // on -- a $0 entry whose only purpose is carrying that note forward.
  if (changerCash != null) {
    if (rows.length > 0) {
      rows[0].notes += changerNote;
    } else {
      rows.push({
        date: periodEnd,
        amount: 0,
        source: "OTHER",
        machineType: "WASHER",
        notes: `No washer/dryer revenue recorded for ${periodLabel}.${changerNote}`,
        collectedBy,
      });
    }
  }

  const created = await prisma.$transaction(
    rows.map((row) =>
      prisma.revenueEntry.create({
        data: {
          date: row.date,
          amount: row.amount,
          source: row.source,
          machineType: row.machineType,
          notes: row.notes,
          collectedBy: row.collectedBy,
        },
      })
    )
  );

  await prisma.setting.upsert({
    where: { key: "revenue.lastCollectionEnd" },
    update: { value: periodEnd.toISOString().slice(0, 10) },
    create: { key: "revenue.lastCollectionEnd", value: periodEnd.toISOString().slice(0, 10) },
  });

  return NextResponse.json({
    entries: created,
    summary: {
      washerTotal: round2(fascard.washer.cash + fascard.washer.card + washerCoinDollars),
      dryerTotal: round2(fascard.dryer.cash + fascard.dryer.card + dryerCoinDollars),
    },
  });
}
