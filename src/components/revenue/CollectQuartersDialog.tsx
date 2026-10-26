"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { Coins, RefreshCw } from "lucide-react";
import { format, subDays } from "date-fns";

// datetime-local wants "yyyy-MM-ddTHH:mm:ss" in the viewer's own local time
// -- no timezone suffix, so the browser interprets (and round-trips) it as
// whatever "local" means on the machine actually doing the collecting.
// Seconds matter here: the default start is carried over to the second from
// the previous collection's end, and truncating them on format would quietly
// round it to the start of that minute, re-asking FasCard about time already
// covered (dropping the seconds entirely, not just displaying them rounded).
const DATETIME_LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm:ss";

type CategoryTotals = {
  cash: number;
  card: number;
  machines: { id: string; name: string; fascardMachNo: number; cash: number; card: number }[];
};

type PreviewResult = {
  configured: boolean;
  error: string | null;
  washer: CategoryTotals;
  dryer: CategoryTotals;
};

type Weight = { value: string; unit: "g" | "oz" };

const emptyWeight: Weight = { value: "", unit: "g" };

function weightDollars(weight: Weight): number {
  const value = Number(weight.value);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return weight.unit === "g" ? value / 22.68 : value / 0.8;
}

// A datetime-local value has no timezone -- it means whatever "local" is on
// the device filling it in. Sent as-is, the server would parse it in ITS
// own local time instead (likely UTC in production), silently shifting the
// window by however many hours apart the two are. Resolving it to a real
// instant here, in the browser that knows what "local" actually means,
// keeps the two in agreement regardless of where the server runs.
function toIso(datetimeLocal: string): string | null {
  if (!datetimeLocal) return null;
  const d = new Date(datetimeLocal);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function CollectQuartersDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState(format(new Date(), DATETIME_LOCAL_FORMAT));
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const [washerWeight, setWasherWeight] = useState<Weight>(emptyWeight);
  const [dryerWeight, setDryerWeight] = useState<Weight>(emptyWeight);
  const [changerCash, setChangerCash] = useState("");
  const [collectedBy, setCollectedBy] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [overlapWarning, setOverlapWarning] = useState<string | null>(null);
  const [savedSummary, setSavedSummary] = useState<{ washerTotal: number; dryerTotal: number } | null>(null);

  async function fetchPreview(start: string, end: string) {
    const startIso = toIso(start);
    const endIso = toIso(end);
    if (!startIso || !endIso) return;
    setPreviewLoading(true);
    setPreviewError("");
    try {
      const res = await fetch(
        `/api/revenue/collect/preview?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setPreviewError(data.error ?? "Failed to load FasCard preview.");
        setPreview(null);
      } else {
        setPreview(data);
      }
    } catch {
      setPreviewError("Failed to load FasCard preview.");
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;

    setSavedSummary(null);
    setSaveError("");
    setOverlapWarning(null);
    setWasherWeight(emptyWeight);
    setDryerWeight(emptyWeight);
    setChangerCash("");
    setCollectedBy("");

    // The next period logically begins the instant the last one ended.
    // FasCard windows (and the overlap check below) are already half-open --
    // [start, end) -- so the previous period never actually included its own
    // end instant. The next one should start exactly there, not a second
    // later: advancing past it would leave that instant uncovered by either
    // period, silently dropping anything that landed in the gap. Falls back
    // to 7 days ago if there's no prior collection (first-ever run) or the
    // saved cursor can't be parsed.
    let start = subDays(new Date(), 7);
    try {
      const res = await fetch("/api/settings?key=revenue.lastCollectionEnd");
      const data = await res.json();
      if (data?.value) {
        const lastEnd = new Date(data.value);
        if (!Number.isNaN(lastEnd.getTime())) start = lastEnd;
      }
    } catch {
      // Fall back to the 7-day default above.
    }
    const startStr = format(start, DATETIME_LOCAL_FORMAT);
    const endStr = format(new Date(), DATETIME_LOCAL_FORMAT);
    setPeriodStart(startStr);
    setPeriodEnd(endStr);
    fetchPreview(startStr, endStr);
  }

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
      const res = await fetch("/api/revenue/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodStart: periodStartIso,
          periodEnd: periodEndIso,
          washerCoinWeight: washerWeight.value ? { value: Number(washerWeight.value), unit: washerWeight.unit } : null,
          dryerCoinWeight: dryerWeight.value ? { value: Number(dryerWeight.value), unit: dryerWeight.unit } : null,
          changerCash: changerCash ? Number(changerCash) : null,
          collectedBy: collectedBy || null,
          confirmOverlap,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "period_overlap") {
          // Re-render the instant in the viewer's own timezone rather than
          // trusting the server's message text -- the server doesn't know
          // what "local" means for whoever's reading this.
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
      setSavedSummary(data.summary);
      onSaved();
    } catch {
      setSaveError("Failed to save this collection.");
    } finally {
      setSaving(false);
    }
  }

  const washerFascard = (preview?.washer.cash ?? 0) + (preview?.washer.card ?? 0);
  const dryerFascard = (preview?.dryer.cash ?? 0) + (preview?.dryer.card ?? 0);
  const washerTotal = washerFascard + weightDollars(washerWeight);
  const dryerTotal = dryerFascard + weightDollars(dryerWeight);
  const nothingToSave = washerTotal <= 0 && dryerTotal <= 0 && !changerCash;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Coins className="h-4 w-4 mr-2" />
          Collect Quarters
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Collect Quarters — Washers &amp; Dryers</DialogTitle>
        </DialogHeader>

        {savedSummary ? (
          <div className="space-y-4">
            <p className="text-sm text-green-700 bg-green-50 rounded-md px-3 py-3">
              Saved. Washers: {formatCurrency(savedSummary.washerTotal)} · Dryers:{" "}
              {formatCurrency(savedSummary.dryerTotal)}
            </p>
            <Button className="w-full" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Period start</Label>
                <Input
                  type="datetime-local"
                  step="1"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  onBlur={() => fetchPreview(periodStart, periodEnd)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Period end</Label>
                <Input
                  type="datetime-local"
                  step="1"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  onBlur={() => fetchPreview(periodStart, periodEnd)}
                />
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Start defaults to exactly when your last saved collection ended, so periods never
              gap or overlap. Adjust it yourself if a collection was made while the app was
              unavailable.
            </p>

            <div className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">FasCard (reader-equipped machines)</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fetchPreview(periodStart, periodEnd)}
                  disabled={previewLoading}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${previewLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
              {previewError && <p className="text-sm text-red-600 mt-1">{previewError}</p>}
              {preview && !preview.configured && (
                <p className="text-sm text-gray-500 mt-1">
                  FasCard isn&rsquo;t configured -- only weighed coin will be recorded.
                </p>
              )}
              {preview?.configured && !preview.error && (
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <dt className="text-gray-500">Washers (cash + card)</dt>
                  <dd className="text-right font-medium">{formatCurrency(washerFascard)}</dd>
                  <dt className="text-gray-500">Dryers (cash + card)</dt>
                  <dd className="text-right font-medium">{formatCurrency(dryerFascard)}</dd>
                </dl>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Washer coin weight</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="0"
                    value={washerWeight.value}
                    onChange={(e) => setWasherWeight((w) => ({ ...w, value: e.target.value }))}
                  />
                  <Select
                    value={washerWeight.unit}
                    onValueChange={(v) => setWasherWeight((w) => ({ ...w, unit: v as "g" | "oz" }))}
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
                <Label>Dryer coin weight</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="0"
                    value={dryerWeight.value}
                    onChange={(e) => setDryerWeight((w) => ({ ...w, value: e.target.value }))}
                  />
                  <Select
                    value={dryerWeight.unit}
                    onValueChange={(v) => setDryerWeight((w) => ({ ...w, unit: v as "g" | "oz" }))}
                  >
                    <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="g">g</SelectItem>
                      <SelectItem value="oz">oz</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Weigh only the non-FasCard machines -- reader-equipped washers and dryers are
              already covered above. 1 quarter = 5.670 g / 0.2 oz, so $1 = 22.68 g = 0.8 oz.
            </p>

            <div className="space-y-1.5">
              <Label>
                Cash removed from the coin changer{" "}
                <span className="text-gray-400 font-normal">(for your records -- not revenue)</span>
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={changerCash}
                onChange={(e) => setChangerCash(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Collected By</Label>
              <Input value={collectedBy} onChange={(e) => setCollectedBy(e.target.value)} placeholder="Name" />
            </div>

            <div className="rounded-lg bg-slate-50 p-3 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Washer total</p>
                <p className="text-lg font-bold">{formatCurrency(washerTotal)}</p>
              </div>
              <div>
                <p className="text-gray-500">Dryer total</p>
                <p className="text-lg font-bold">{formatCurrency(dryerTotal)}</p>
              </div>
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
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={() => handleSave(true)}
                    disabled={saving}
                  >
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
