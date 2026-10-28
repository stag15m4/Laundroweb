"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Wallet, Trash2 } from "lucide-react";
import { format } from "date-fns";

type Summary = { cashOnHand: number; vendingTotal: number; changerTotal: number; depositTotal: number };
type Deposit = { id: string; date: string; amount: string; depositedBy: string | null; notes: string | null };

// A bare "yyyy-MM-dd" has no time part, so Date parses it as UTC midnight --
// rendered back in a viewer's local timezone (as History does via
// formatDate), that can display as the day before for anyone west of UTC.
// Appending a local (no "Z") time-of-day instead makes Date resolve it as
// local midnight, which round-trips to the same calendar day everywhere.
function localDateToIso(dateOnly: string): string {
  return new Date(`${dateOnly}T00:00:00`).toISOString();
}

export function CashOnHandCard({ isOwner, refreshToken }: { isOwner: boolean; refreshToken?: number }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [deposits, setDeposits] = useState<Deposit[]>([]);

  const [depositOpen, setDepositOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [depositedBy, setDepositedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function refreshSummary() {
    fetch("/api/cash/summary").then((r) => r.json()).then(setSummary);
  }
  function refreshDeposits() {
    fetch("/api/cash/deposits").then((r) => r.json()).then((d) => Array.isArray(d) && setDeposits(d));
  }

  // refreshToken changes whenever the Revenue page saves a collection or
  // adds/edits/deletes an entry -- none of which this component would
  // otherwise know happened, since nothing here causes those actions.
  useEffect(() => {
    refreshSummary();
  }, [refreshToken]);

  function openDeposit() {
    setAmount(summary ? summary.cashOnHand.toFixed(2) : "");
    setDate(format(new Date(), "yyyy-MM-dd"));
    setDepositedBy("");
    setNotes("");
    setError("");
    setDepositOpen(true);
  }

  function openHistory() {
    refreshDeposits();
    setHistoryOpen(true);
  }

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch("/api/cash/deposits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number(amount),
        date: localDateToIso(date),
        depositedBy: depositedBy || null,
        notes: notes || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not save this deposit.");
      return;
    }
    setDepositOpen(false);
    refreshSummary();
    if (historyOpen) refreshDeposits();
  }

  async function handleDeleteDeposit(id: string) {
    if (!confirm("Delete this deposit record? The amount goes back into Cash on Hand.")) return;
    await fetch(`/api/cash/deposits/${id}`, { method: "DELETE" });
    refreshSummary();
    refreshDeposits();
  }

  if (!summary) return null;

  return (
    <Card>
      <CardContent className="p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm text-gray-500 flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5" />
            Cash on Hand <span className="text-gray-400">(vending + coin changer)</span>
          </p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(summary.cashOnHand)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openHistory}>
            History
          </Button>
          {isOwner && (
            <Button size="sm" onClick={openDeposit} disabled={summary.cashOnHand <= 0}>
              Deposit
            </Button>
          )}
        </div>
      </CardContent>

      <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deposit Cash</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleDeposit} className="space-y-4">
            <p className="text-sm text-gray-500">
              Cash on Hand: <span className="font-semibold text-gray-900">{formatCurrency(summary.cashOnHand)}</span>
            </p>
            <div className="space-y-1.5">
              <Label>Amount Deposited ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={summary.cashOnHand}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
              <p className="text-xs text-gray-400">
                Defaults to the full balance. Lower it to hold some back as a float for making
                change -- the difference just stays as Cash on Hand.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Deposited By</Label>
              <Input value={depositedBy} onChange={(e) => setDepositedBy(e.target.value)} placeholder="Name" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Saving…" : "Save Deposit"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[85vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Deposit History</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 space-y-3 pr-1">
            {deposits.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No deposits yet.</p>
            ) : (
              deposits.map((d) => (
                <div key={d.id} className="flex items-start justify-between border-b border-gray-50 pb-2">
                  <div>
                    <p className="text-sm font-semibold text-green-600">{formatCurrency(d.amount)}</p>
                    <p className="text-xs text-gray-400">
                      {formatDate(d.date)}
                      {d.depositedBy ? ` · ${d.depositedBy}` : ""}
                    </p>
                    {d.notes && <p className="text-xs text-gray-400 mt-0.5">{d.notes}</p>}
                  </div>
                  {isOwner && (
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteDeposit(d.id)}>
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
