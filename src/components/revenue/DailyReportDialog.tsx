"use client";

import { useState } from "react";
import { addDays, format, subDays } from "date-fns";
import { reportPeriodFromId } from "@/lib/fascardReportPeriods";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DailyReportDialog({ onSaved, reportIds }: { onSaved: () => void; reportIds: string[] }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [end, setEnd] = useState(format(subDays(new Date(), 1), "yyyy-MM-dd"));
  const [coin, setCoin] = useState("");
  const [card, setCard] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/revenue/daily-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start, end, coin, card, confirmed }),
      });
      const result = await res.json();
      if (!res.ok) { setError(result.error ?? "Could not save report."); return; }
      setOpen(false);
      onSaved();
    } catch { setError("Could not save report."); }
    finally { setSaving(false); }
  }
  return (
    <Dialog open={open} onOpenChange={(next) => {
      setOpen(next);
      if (next) {
        const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
        const latestEnd = reportIds.map(reportPeriodFromId).reduce<string | null>((latest, period) =>
          period && (!latest || period.end > latest) ? period.end : latest, null);
        const nextStart = latestEnd
          ? format(addDays(new Date(latestEnd + "T12:00:00"), 1), "yyyy-MM-dd")
          : format(subDays(new Date(), 7), "yyyy-MM-dd");
        setStart(nextStart <= yesterday ? nextStart : yesterday);
        setEnd(yesterday);
        setCoin(""); setCard(""); setConfirmed(false); setError("");
      }
    }}>
      <DialogTrigger asChild><Button variant="outline">Income Report</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>FasCard Income Report</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <p className="text-sm text-gray-500">Enter the totals for the exact date range printed on your report, including both dates. Use completed business days. Coin is for reference only; weigh all machines as usual.</p>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="report-start">From</Label><Input id="report-start" type="date" required value={start} max={end} onChange={(e) => { setStart(e.target.value); setConfirmed(false); }} /></div>
            <div><Label htmlFor="report-end">Through</Label><Input id="report-end" type="date" required value={end} min={start} max={format(subDays(new Date(), 1), "yyyy-MM-dd")} onChange={(e) => { setEnd(e.target.value); setConfirmed(false); }} /></div>
          </div>
          <div><Label htmlFor="report-coin">Machine Starts – Coin ($)</Label><Input id="report-coin" type="number" min="0" step="0.01" required value={coin} onChange={(e) => { setCoin(e.target.value); setConfirmed(false); }} /></div>
          <div><Label htmlFor="report-card">Machine Starts – Credit Card ($)</Label><Input id="report-card" type="number" min="0" step="0.01" required value={card} onChange={(e) => { setCard(e.target.value); setConfirmed(false); }} /></div>
          <p className="text-sm text-gray-500">Only the card amount is posted as revenue. Add-value transactions are excluded.</p>
          {start.slice(0, 7) !== end.slice(0, 7) && <p className="text-sm text-amber-700">This range crosses a month boundary. All card revenue will be posted on the end date. Use separate reports for each month for accurate monthly totals.</p>}
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> I checked that this period's card revenue was not already recorded, including in an earlier collection.</label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button className="w-full" disabled={saving || !confirmed}>{saving ? "Saving…" : "Record Report"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
