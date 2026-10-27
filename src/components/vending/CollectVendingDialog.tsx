"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { Coins } from "lucide-react";
import { format, subDays } from "date-fns";

// Same format/precision reasoning as CollectQuartersDialog: datetime-local
// carries no timezone (so it means whatever "local" is on this device), and
// needs seconds so the default start -- carried exactly from the last
// collection's end -- never gets silently rounded down to the minute.
const DATETIME_LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm:ss";

type VendingMachine = { id: string; name: string };
type Weight = { value: string; unit: "g" | "oz" };

const emptyWeight: Weight = { value: "", unit: "g" };

function weightDollars(weight: Weight): number {
  const value = Number(weight.value);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return weight.unit === "g" ? value / 22.68 : value / 0.8;
}

function toIso(datetimeLocal: string): string | null {
  if (!datetimeLocal) return null;
  const d = new Date(datetimeLocal);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function CollectVendingDialog({ machines, onSaved }: { machines: VendingMachine[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState(format(new Date(), DATETIME_LOCAL_FORMAT));
  const [weights, setWeights] = useState<Record<string, Weight>>({});
  const [cashAmounts, setCashAmounts] = useState<Record<string, string>>({});
  const [collectedBy, setCollectedBy] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [overlapWarning, setOverlapWarning] = useState<string | null>(null);
  const [savedSummary, setSavedSummary] = useState<{ machineName: string; amount: number }[] | null>(null);

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;

    setSavedSummary(null);
    setSaveError("");
    setOverlapWarning(null);
    setWeights({});
    setCashAmounts({});
    setCollectedBy("");

    // Same reasoning as the washer/dryer tool: the next period starts
    // exactly when the last one ended (the cursor's own instant is already
    // excluded from the previous period), not a second later.
    let start = subDays(new Date(), 7);
    try {
      const res = await fetch("/api/settings?key=vending.lastCollectionEnd");
      const data = await res.json();
      if (data?.value) {
        const lastEnd = new Date(data.value);
        if (!Number.isNaN(lastEnd.getTime())) start = lastEnd;
      }
    } catch {
      // Fall back to the 7-day default above.
    }
    setPeriodStart(format(start, DATETIME_LOCAL_FORMAT));
    setPeriodEnd(format(new Date(), DATETIME_LOCAL_FORMAT));
  }

  function weightFor(machineId: string): Weight {
    return weights[machineId] ?? emptyWeight;
  }

  function setWeightFor(machineId: string, weight: Weight) {
    setWeights((prev) => ({ ...prev, [machineId]: weight }));
  }

  function amountFor(machineId: string): number {
    return weightDollars(weightFor(machineId)) + (Number(cashAmounts[machineId]) || 0);
  }

  const totalAmount = machines.reduce((sum, m) => sum + amountFor(m.id), 0);
  const nothingToSave = totalAmount <= 0;

  async function handleSave(confirmOverlap = false) {
    const periodStartIso = toIso(periodStart);
    const periodEndIso = toIso(periodEnd);
    if (!periodStartIso || !periodEndIso) {
      setSaveError("Period start and end must be valid dates/times.");
      return;
    }
    setSaving(true);
    setSaveError("");
    setOverlapWarning(null);
    try {
      const res = await fetch("/api/vending/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodStart: periodStartIso,
          periodEnd: periodEndIso,
          machines: machines.map((m) => {
            const w = weightFor(m.id);
            const cash = cashAmounts[m.id];
            return {
              machineId: m.id,
              weight: w.value ? { value: Number(w.value), unit: w.unit } : null,
              cashAmount: cash ? Number(cash) : null,
            };
          }),
          collectedBy: collectedBy || null,
          confirmOverlap,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "period_overlap") {
          const lastEnd = data.lastCollectionEnd ? new Date(data.lastCollectionEnd) : null;
          const when = lastEnd && !Number.isNaN(lastEnd.getTime()) ? lastEnd.toLocaleString() : "your last saved collection";
          setOverlapWarning(`This period starts before your last saved collection ended (${when}).`);
        } else if (data.error === "concurrent_save") {
          setSaveError(data.message);
        } else {
          setSaveError(data.message ?? data.error ?? "Failed to save this collection.");
        }
        return;
      }
      setSavedSummary(data.summary.filter((s: { amount: number }) => s.amount > 0));
      onSaved();
    } catch {
      setSaveError("Failed to save this collection.");
    } finally {
      setSaving(false);
    }
  }

  if (machines.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Coins className="h-4 w-4 mr-2" />
          Collect Vending Revenue
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Collect Vending Revenue</DialogTitle>
        </DialogHeader>

        {savedSummary ? (
          <div className="space-y-4">
            <div className="text-sm text-green-700 bg-green-50 rounded-md px-3 py-3 space-y-1">
              <p className="font-medium">Saved.</p>
              {savedSummary.map((s) => (
                <p key={s.machineName}>
                  {s.machineName}: {formatCurrency(s.amount)}
                </p>
              ))}
            </div>
            <Button className="w-full" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 space-y-4 pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Period start</Label>
                <Input
                  type="datetime-local"
                  step="1"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Period end</Label>
                <Input
                  type="datetime-local"
                  step="1"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Start defaults to exactly when your last saved vending collection ended, so periods
              never gap or overlap. Adjust it yourself if a collection was made while the app was
              unavailable.
            </p>

            {machines.map((m) => (
              <div key={m.id} className="rounded-lg border border-gray-200 p-3 space-y-3">
                <p className="text-sm font-medium text-gray-700">{m.name}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Coin weight</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="0"
                        value={weightFor(m.id).value}
                        onChange={(e) => setWeightFor(m.id, { ...weightFor(m.id), value: e.target.value })}
                      />
                      <Select
                        value={weightFor(m.id).unit}
                        onValueChange={(v) => setWeightFor(m.id, { ...weightFor(m.id), unit: v as "g" | "oz" })}
                      >
                        <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="g">g</SelectItem>
                          <SelectItem value="oz">oz</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Counted cash / bills</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={cashAmounts[m.id] ?? ""}
                      onChange={(e) => setCashAmounts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-400 text-right">{formatCurrency(amountFor(m.id))}</p>
              </div>
            ))}
            <p className="text-xs text-gray-400">
              Weigh the quarters (1 quarter = 5.670 g / 0.2 oz, so $1 = 22.68 g = 0.8 oz) and count
              any bills separately -- a scale can't weigh those apart from coin.
            </p>

            <div className="space-y-1.5">
              <Label>Collected By</Label>
              <Input value={collectedBy} onChange={(e) => setCollectedBy(e.target.value)} placeholder="Name" />
            </div>

            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-gray-500 text-sm">Total</p>
              <p className="text-lg font-bold">{formatCurrency(totalAmount)}</p>
            </div>

            {saveError && <p className="text-sm text-red-600">{saveError}</p>}

            {overlapWarning ? (
              <div className="space-y-2 rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-900">
                <p>{overlapWarning} Saving anyway will record this period's revenue a second time.</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setOverlapWarning(null)}
                    disabled={saving}
                  >
                    Go back
                  </Button>
                  <Button type="button" className="flex-1" onClick={() => handleSave(true)} disabled={saving}>
                    {saving ? "Saving…" : "Save Anyway"}
                  </Button>
                </div>
              </div>
            ) : (
              <Button className="w-full" onClick={() => handleSave(false)} disabled={saving || nothingToSave}>
                {saving ? "Saving…" : "Save Collection"}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
