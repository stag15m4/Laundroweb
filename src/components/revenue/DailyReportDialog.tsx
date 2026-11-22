"use client";

import { useState } from "react";
import { format, subDays } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DailyReportDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(format(subDays(new Date(), 1), "yyyy-MM-dd"));
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
        body: JSON.stringify({ day, coin, card, confirmed }),
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
      if (next) { setCoin(""); setCard(""); setConfirmed(false); setError(""); }
    }}>
      <DialogTrigger asChild><Button variant="outline">Daily Income Report</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>FasCard Daily Income Report</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <p className="text-sm text-gray-500">Use the single-day column of a completed day's Income Totals Report, not the cumulative column. Coin is for reference only; weigh all machines as usual.</p>
          <div><Label htmlFor="report-day">Business date</Label><Input id="report-day" type="date" required value={day} onChange={(e) => { setDay(e.target.value); setConfirmed(false); }} /></div>
          <div><Label htmlFor="report-coin">Machine Starts – Coin ($)</Label><Input id="report-coin" type="number" min="0" step="0.01" required value={coin} onChange={(e) => { setCoin(e.target.value); setConfirmed(false); }} /></div>
          <div><Label htmlFor="report-card">Machine Starts – Credit Card ($)</Label><Input id="report-card" type="number" min="0" step="0.01" required value={card} onChange={(e) => { setCard(e.target.value); setConfirmed(false); }} /></div>
          <p className="text-sm text-gray-500">Only the card amount is posted as revenue. Add-value transactions are excluded.</p>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> I checked that this day's card revenue was not already recorded, including in an earlier collection.</label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button className="w-full" disabled={saving || !confirmed}>{saving ? "Saving…" : "Record Daily Report"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
