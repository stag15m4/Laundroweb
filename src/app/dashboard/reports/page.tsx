"use client";

import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { PageTabs } from "@/components/layout/PageTabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  RefreshCw,
  Zap,
} from "lucide-react";
import { format } from "date-fns";
import {
  PeriodType,
  DateRange,
  getPeriodRange,
  shiftAnchor,
  formatPeriodLabel,
  getComparisonOptions,
  getChartBuckets,
  inRange,
  formatRangeLabel,
} from "@/lib/report-periods";

type RevenueEntry = { date: string; amount: string; source: string; collectionId: string | null };
type UtilityBill = { type: string; billingPeriodEnd: string; cost: string; usageAmount: string };
type Expense = { date: string; amount: string; category: string };
type CashDeposit = { date: string; amount: string };
type ChangerLog = { date: string; amount: string };

type Turns = {
  month: string;
  turnsPerDay: number | null;
  band: "low" | "building" | "healthy" | "at-capacity" | null;
  thresholds: { weak: number; healthy: number; atCapacity: number };
  totalWasherCount: number;
  days: number;
  daysInMonth: number;
  partialMonth: boolean;
  measured: { washerCount: number; turns: number | null; error: string | null };
  estimated: {
    washerCount: number;
    washerRevenue: number;
    ambiguousRevenue: number;
    totalRevenue: number;
    unattributedRevenue: number;
    assumedVend: number | null;
    pricedWashers: number;
    estimatedTurns: number | null;
  };
  unavailableReason: string | null;
};

const BAND_COPY: Record<string, { label: string; tone: string }> = {
  low: { label: "Below a busy store", tone: "text-amber-600" },
  building: { label: "Building", tone: "text-amber-600" },
  healthy: { label: "Healthy", tone: "text-green-600" },
  "at-capacity": { label: "At capacity — consider adding machines", tone: "text-blue-600" },
};

const PERIOD_TABS: { key: PeriodType; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

function sumInRange(records: { date: string; amount: string | number }[], range: DateRange): number {
  return records.filter((r) => inRange(r.date, range)).reduce((s, r) => s + Number(r.amount), 0);
}

type Metrics = {
  grossRevenue: number;
  coinRevenue: number;
  cardRevenue: number;
  vendingRevenue: number;
  expenses: number;
  utilities: number;
  netProfit: number;
  collections: number;
  deposits: number;
};

function computeMetrics(
  range: DateRange,
  revenue: RevenueEntry[],
  expenses: Expense[],
  utilities: UtilityBill[],
  deposits: CashDeposit[]
): Metrics {
  const inPeriod = revenue.filter((r) => inRange(r.date, range));
  const grossRevenue = inPeriod.reduce((s, r) => s + Number(r.amount), 0);
  const coinRevenue = inPeriod.filter((r) => r.source === "COIN").reduce((s, r) => s + Number(r.amount), 0);
  const cardRevenue = inPeriod.filter((r) => r.source === "CARD").reduce((s, r) => s + Number(r.amount), 0);
  const vendingRevenue = inPeriod.filter((r) => r.source === "VENDING").reduce((s, r) => s + Number(r.amount), 0);
  const expensesTotal = sumInRange(expenses, range);
  const utilitiesTotal = sumInRange(
    utilities.map((u) => ({ date: u.billingPeriodEnd, amount: u.cost })),
    range
  );
  const depositsTotal = sumInRange(deposits, range);

  const collectionIds = new Set(inPeriod.filter((r) => r.collectionId).map((r) => r.collectionId));
  const singles = inPeriod.filter((r) => !r.collectionId).length;

  return {
    grossRevenue,
    coinRevenue,
    cardRevenue,
    vendingRevenue,
    expenses: expensesTotal,
    utilities: utilitiesTotal,
    netProfit: grossRevenue - expensesTotal - utilitiesTotal,
    collections: collectionIds.size + singles,
    deposits: depositsTotal,
  };
}

const METRIC_ROWS: { key: keyof Metrics; label: string; isCount?: boolean }[] = [
  { key: "grossRevenue", label: "Gross Revenue" },
  { key: "netProfit", label: "Net Profit" },
  { key: "coinRevenue", label: "Coin Revenue" },
  { key: "cardRevenue", label: "Card Revenue" },
  { key: "vendingRevenue", label: "Vending Revenue" },
  { key: "expenses", label: "Expenses" },
  { key: "utilities", label: "Utilities" },
  { key: "deposits", label: "Cash Deposited" },
  { key: "collections", label: "Collections", isCount: true },
];

function DeltaBadge({ current, compare }: { current: number; compare: number }) {
  if (compare === 0) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  const pct = ((current - compare) / Math.abs(compare)) * 100;
  const up = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold rounded-md px-1.5 py-0.5 ${
        up ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
      }`}
    >
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%
    </span>
  );
}

export default function ReportsPage() {
  const [revenue, setRevenue] = useState<RevenueEntry[]>([]);
  const [utilities, setUtilities] = useState<UtilityBill[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [deposits, setDeposits] = useState<CashDeposit[]>([]);
  const [changerLogs, setChangerLogs] = useState<ChangerLog[]>([]);
  const [turns, setTurns] = useState<Turns | null>(null);

  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [compareKey, setCompareKey] = useState("prior-month");
  const [customRange, setCustomRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [comparePickerOpen, setComparePickerOpen] = useState(false);
  const [dateJumpOpen, setDateJumpOpen] = useState(false);

  useEffect(() => {
    fetch("/api/kpis/turns").then((r) => r.json()).then(setTurns).catch(() => undefined);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/revenue").then((r) => r.json()),
      fetch("/api/utilities").then((r) => r.json()),
      fetch("/api/expenses").then((r) => r.json()),
      fetch("/api/cash/deposits").then((r) => r.json()),
      fetch("/api/cash/changer-log").then((r) => r.json()),
    ]).then(([rev, util, exp, dep, changer]) => {
      setRevenue(rev);
      setUtilities(util);
      setExpenses(exp);
      if (Array.isArray(dep)) setDeposits(dep);
      if (Array.isArray(changer)) setChangerLogs(changer);
    });
  }, []);

  // Switching period type keeps the same comparison *shape* where it still
  // makes sense (e.g. "prior year" exists for every type); otherwise falls
  // back to that type's first option rather than carrying over a key (say
  // "4-weeks-prior") that type no longer offers.
  const comparisonOptions = useMemo(() => getComparisonOptions(periodType, anchor), [periodType, anchor]);
  useEffect(() => {
    if (compareKey === "custom") return;
    if (!comparisonOptions.some((o) => o.key === compareKey)) {
      setCompareKey(comparisonOptions[0].key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodType]);

  const currentRange = getPeriodRange(periodType, anchor);
  const compareRange: DateRange | null = useMemo(() => {
    if (compareKey === "custom") {
      if (!customRange.start || !customRange.end) return null;
      const start = new Date(`${customRange.start}T00:00:00`);
      const end = new Date(`${customRange.end}T00:00:00`);
      end.setDate(end.getDate() + 1); // the picked end day is inclusive
      return { start, end };
    }
    return comparisonOptions.find((o) => o.key === compareKey)?.range ?? null;
  }, [compareKey, customRange, comparisonOptions]);

  const currentMetrics = computeMetrics(currentRange, revenue, expenses, utilities, deposits);
  const compareMetrics = compareRange
    ? computeMetrics(compareRange, revenue, expenses, utilities, deposits)
    : null;

  const buckets = getChartBuckets(periodType, anchor);
  const chartData = buckets.map((b) => ({
    label: b.label,
    amount: revenue.filter((r) => inRange(r.date, b.range)).reduce((s, r) => s + Number(r.amount), 0),
  }));

  const compareLabel =
    compareKey === "custom" && compareRange
      ? formatRangeLabel(compareRange)
      : comparisonOptions.find((o) => o.key === compareKey)?.label ?? "Compare";

  const periodUtilities = utilities.filter((u) => inRange(u.billingPeriodEnd, currentRange));
  const periodUtilitiesTotal = periodUtilities.reduce((s, u) => s + Number(u.cost), 0);
  const periodExpenses = expenses.filter((e) => inRange(e.date, currentRange));
  const periodExpensesTotal = periodExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const periodChangerCash = sumInRange(changerLogs, currentRange);

  return (
    <div>
      <Header title="Reports" description="Financial summary, period comparisons, and trend analysis" />

      <PageTabs tabs={[
        { label: "Revenue", href: "/dashboard/revenue" },
        { label: "Expenses", href: "/dashboard/expenses" },
        { label: "Utilities", href: "/dashboard/utilities" },
        { label: "Reports", href: "/dashboard/reports" },
      ]} />

      <div className="p-6 space-y-6">
        {/* ── Period selector ──────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-gray-50">
            {PERIOD_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setPeriodType(t.key)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  periodType === t.key ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setAnchor((a) => shiftAnchor(periodType, a, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold min-w-[11rem] text-center">
              {formatPeriodLabel(periodType, anchor)}
            </span>
            <Button variant="outline" size="icon" onClick={() => setAnchor((a) => shiftAnchor(periodType, a, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => setDateJumpOpen(true)}>
              <Calendar className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ── Headline total + chart ──────────────────────────────────── */}
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-gray-500">Gross Revenue</p>
            <p className="text-3xl font-bold mt-1">{formatCurrency(currentMetrics.grossRevenue)}</p>
            {chartData.length > 0 && (
              <ResponsiveContainer width="100%" height={220} className="mt-4">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="amount" fill="#16a34a" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ── Metrics vs. comparison period ───────────────────────────── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Metrics</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setComparePickerOpen(true)}>
              vs. {compareLabel}
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-50">
              {METRIC_ROWS.map((m) => (
                <div key={m.key} className="flex items-center justify-between px-6 py-3">
                  <p className="text-sm text-gray-500">{m.label}</p>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-semibold">
                      {m.isCount ? currentMetrics[m.key] : formatCurrency(currentMetrics[m.key])}
                    </p>
                    {compareMetrics && <DeltaBadge current={currentMetrics[m.key]} compare={compareMetrics[m.key]} />}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Turns per day — unchanged from before ───────────────────── */}
        {turns && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-blue-600" />
                Turns Per Day
                <span className="ml-1 text-xs font-normal text-gray-400">
                  {turns.month} · {turns.measured.washerCount > 0 ? "measured + estimated" : "estimated"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {turns.turnsPerDay === null ? (
                <p className="text-sm text-gray-500">{turns.unavailableReason}</p>
              ) : (
                <div className="grid gap-6 lg:grid-cols-3">
                  <div>
                    <p className="text-4xl font-bold tabular-nums">{turns.turnsPerDay.toFixed(2)}</p>
                    <p className={`mt-1 text-sm font-medium ${BAND_COPY[turns.band ?? "low"].tone}`}>
                      {BAND_COPY[turns.band ?? "low"].label}
                    </p>
                    <div className="mt-3 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${Math.min(100, (turns.turnsPerDay / turns.thresholds.atCapacity) * 100)}%` }}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-xs text-gray-400">
                      <span>0</span>
                      <span>{turns.thresholds.healthy} healthy</span>
                      <span>{turns.thresholds.atCapacity}+ full</span>
                    </div>
                  </div>

                  <div className="lg:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                      How this was worked out
                    </p>
                    <dl className="space-y-1 text-sm">
                      {turns.measured.washerCount > 0 && (
                        <div className="flex justify-between gap-4">
                          <dt className="text-gray-500">
                            Measured — {turns.measured.washerCount} washer
                            {turns.measured.washerCount === 1 ? "" : "s"} with a card reader
                          </dt>
                          <dd className="tabular-nums">{turns.measured.turns?.toFixed(0) ?? "—"}</dd>
                        </div>
                      )}
                      {turns.estimated.washerCount > 0 && (
                        <>
                          <div className="flex justify-between gap-4">
                            <dt className="text-gray-500">Cash-only washer revenue ({turns.estimated.washerCount})</dt>
                            <dd className="tabular-nums">{formatCurrency(turns.estimated.washerRevenue)}</dd>
                          </div>
                          <div className="flex justify-between gap-4">
                            <dt className="text-gray-500">÷ assumed vend</dt>
                            <dd className="tabular-nums">
                              {turns.estimated.assumedVend ? formatCurrency(turns.estimated.assumedVend) : "—"}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-4">
                            <dt className="text-gray-500">= estimated washes</dt>
                            <dd className="tabular-nums">{turns.estimated.estimatedTurns?.toFixed(0) ?? "—"}</dd>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between gap-4 border-t pt-1">
                        <dt className="text-gray-500">
                          ÷ {turns.totalWasherCount} washers × {turns.days} day
                          {turns.days === 1 ? "" : "s"}
                          {turns.partialMonth && " so far"}
                        </dt>
                        <dd className="tabular-nums font-semibold">{turns.turnsPerDay.toFixed(2)}</dd>
                      </div>
                    </dl>

                    {turns.measured.error && (
                      <p className="mt-3 text-xs text-red-700 bg-red-50 rounded-md px-3 py-2">
                        Couldn&apos;t reach FasCard for the measured washers this time ({turns.measured.error}), so
                        they&apos;re counted as 0 turns above until the next refresh.
                      </p>
                    )}
                    {turns.estimated.ambiguousRevenue > 0 && (
                      <p className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-md px-3 py-2">
                        {formatCurrency(turns.estimated.ambiguousRevenue)} of this month&apos;s washer revenue was
                        logged as &quot;All washers&quot; rather than a specific machine. Now that some washers are
                        measured directly, that can&apos;t be split between them and the cash-only ones without
                        double-counting, so it&apos;s left out of the estimate. Log collections per machine on the
                        Revenue page to include it.
                      </p>
                    )}
                    {turns.estimated.unattributedRevenue > 0 && (
                      <p className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-md px-3 py-2">
                        {formatCurrency(turns.estimated.unattributedRevenue)} of this month&apos;s revenue is not
                        marked as washers or dryers, so it is left out. Tag collections on the Revenue page to
                        sharpen this.
                      </p>
                    )}
                    {turns.estimated.washerCount > 0 && turns.estimated.pricedWashers < turns.estimated.washerCount && (
                      <p className="mt-2 text-xs text-amber-700">
                        {turns.estimated.washerCount - turns.estimated.pricedWashers} of{" "}
                        {turns.estimated.washerCount} cash-only washers have no configured price, so the assumed
                        vend comes from the other {turns.estimated.pricedWashers}.
                      </p>
                    )}
                    <p className="mt-2 text-xs text-gray-400">
                      {turns.measured.washerCount > 0
                        ? "Washers with a FasCard reader (Equipment → FasCard Machine #) show real counts. Cash-only washers are still inferred from revenue ÷ the average cycle price."
                        : "Cycles are inferred from money until a machine has a FasCard reader; the vend price is the average cycle price across your washers."}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Breakdowns, scoped to the selected period ───────────────── */}
        <div className="grid grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-500" />
                Utility Cost Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(["ELECTRIC", "WATER", "GAS", "SEWER"] as const).map((type) => {
                const typeBills = periodUtilities.filter((u) => u.type === type);
                const total = typeBills.reduce((s, b) => s + Number(b.cost), 0);
                if (!total) return null;
                const pct = periodUtilitiesTotal > 0 ? ((total / periodUtilitiesTotal) * 100).toFixed(0) : "0";
                return (
                  <div key={type} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{type}</span>
                      <span className="text-xs text-gray-400">{pct}%</span>
                    </div>
                    <span className="text-sm font-semibold">{formatCurrency(total)}</span>
                  </div>
                );
              })}
              {periodChangerCash > 0 && (
                <div className="flex items-center justify-between py-2 border-t border-gray-100 mt-1 pt-3">
                  <span className="text-xs text-gray-400">Coin changer cash this period (not a cost)</span>
                  <span className="text-sm text-gray-500">{formatCurrency(periodChangerCash)}</span>
                </div>
              )}
              {periodUtilitiesTotal === 0 && (
                <p className="text-sm text-gray-400 py-4 text-center">No utility bills in this period.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Expense Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {Object.entries(
                periodExpenses.reduce((acc, e) => {
                  acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount);
                  return acc;
                }, {} as Record<string, number>)
              )
                .sort((a, b) => b[1] - a[1])
                .map(([cat, total]) => {
                  const pct = periodExpensesTotal > 0 ? ((total / periodExpensesTotal) * 100).toFixed(0) : "0";
                  return (
                    <div key={cat} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{cat}</span>
                        <span className="text-xs text-gray-400">{pct}%</span>
                      </div>
                      <span className="text-sm font-semibold">{formatCurrency(total)}</span>
                    </div>
                  );
                })}
              {periodExpensesTotal === 0 && (
                <p className="text-sm text-gray-400 py-4 text-center">No expenses in this period.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Compare picker ────────────────────────────────────────────── */}
      <Dialog open={comparePickerOpen} onOpenChange={setComparePickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Compare</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            {comparisonOptions.map((o) => (
              <button
                key={o.key}
                onClick={() => {
                  setCompareKey(o.key);
                  setComparePickerOpen(false);
                }}
                className={`w-full flex items-center justify-between rounded-lg px-3 py-3 text-left text-sm hover:bg-gray-50 ${
                  compareKey === o.key ? "bg-gray-50 font-semibold" : ""
                }`}
              >
                <span>{o.label}</span>
                <span className="text-gray-400">{format(o.range.start, "MMM d, yyyy")}</span>
              </button>
            ))}
            <button
              onClick={() => setCompareKey("custom")}
              className={`w-full flex items-center justify-between rounded-lg px-3 py-3 text-left text-sm hover:bg-gray-50 ${
                compareKey === "custom" ? "bg-gray-50 font-semibold" : ""
              }`}
            >
              Custom range
            </button>
            {compareKey === "custom" && (
              <div className="grid grid-cols-2 gap-3 px-3 pt-2">
                <div className="space-y-1.5">
                  <Label>Start</Label>
                  <Input
                    type="date"
                    value={customRange.start}
                    onChange={(e) => setCustomRange((r) => ({ ...r, start: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>End</Label>
                  <Input
                    type="date"
                    value={customRange.end}
                    onChange={(e) => setCustomRange((r) => ({ ...r, end: e.target.value }))}
                  />
                </div>
              </div>
            )}
          </div>
          {compareKey === "custom" && (
            <Button className="w-full" onClick={() => setComparePickerOpen(false)} disabled={!customRange.start || !customRange.end}>
              Apply
            </Button>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Jump to date ──────────────────────────────────────────────── */}
      <Dialog open={dateJumpOpen} onOpenChange={setDateJumpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Jump to date</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="date"
              defaultValue={format(anchor, "yyyy-MM-dd")}
              onChange={(e) => {
                if (!e.target.value) return;
                setAnchor(new Date(`${e.target.value}T00:00:00`));
              }}
            />
            <Button className="w-full" onClick={() => setDateJumpOpen(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
