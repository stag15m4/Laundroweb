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

export function CollectQuartersDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const [washerWeight, setWasherWeight] = useState<Weight>(emptyWeight);
  const [dryerWeight, setDryerWeight] = useState<Weight>(emptyWeight);
  const [changerCash, setChangerCash] = useState("");
  const [collectedBy, setCollectedBy] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedSummary, setSavedSummary] = useState<{ washerTotal: number; dryerTotal: number } | null>(null);

  async function fetchPreview(start: string, end: string) {
    if (!start || !end) return;
    setPreviewLoading(true);
    setPreviewError("");
    try {
      const res = await fetch(`/api/revenue/collect/preview?start=${start}&end=${end}`);
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
    setWasherWeight(emptyWeight);
    setDryerWeight(emptyWeight);
    setChangerCash("");
    setCollectedBy("");

    let start = format(subDays(new Date(), 7), "yyyy-MM-dd");
    try {
      const res = await fetch("/api/settings?key=revenue.lastCollectionEnd");
      const data = await res.json();
      if (data?.value) start = data.value;
    } catch {
      // Fall back to the 7-day default below.
    }
    const end = format(new Date(), "yyyy-MM-dd");
    setPeriodStart(start);
    setPeriodEnd(end);
    fetchPreview(start, end);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/revenue/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodStart,
          periodEnd,
          washerCoinWeight: washerWeight.value ? { value: Number(washerWeight.value), unit: washerWeight.unit } : null,
          dryerCoinWeight: dryerWeight.value ? { value: Number(dryerWeight.value), unit: dryerWeight.unit } : null,
          changerCash: changerCash ? Number(changerCash) : null,
          collectedBy: collectedBy || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Failed to save this collection.");
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
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  onBlur={() => fetchPreview(periodStart, periodEnd)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Period end</Label>
                <Input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  onBlur={() => fetchPreview(periodStart, periodEnd)}
                />
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Start defaults to the end of your last saved collection, so there's no gap or
              overlap in what FasCard is asked for.
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

            <Button className="w-full" onClick={handleSave} disabled={saving || nothingToSave}>
              {saving ? "Saving…" : "Save Collection"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
