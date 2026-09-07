"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { PageTabs } from "@/components/layout/PageTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileDown, Pencil } from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────────

const EQUIPMENT_TABS = [
  { label: "Machines", href: "/dashboard/equipment" },
  { label: "Parts", href: "/dashboard/parts" },
  { label: "Maintenance", href: "/dashboard/maintenance" },
  { label: "Pricing", href: "/dashboard/pricing" },
];

const WASHER_CODES = [
  { code: "ATS1", label: "Hot" },
  { code: "ATS2", label: "Warm" },
  { code: "ATS3", label: "Cold" },
  { code: "ATS4", label: "Blankets Cold" },
  { code: "ATS5", label: "Delicate Warm" },
  { code: "ATS6", label: "Delicate Cold" },
  { code: "CnP1", label: "Extra Wash" },
  { code: "CnP2", label: "Extra Rinse" },
];

const DRYER_CODES = [
  { code: "ATSH", label: "Price", placeholder: "e.g. 0.25", prefix: "$" },
  { code: "CYC", label: "Cycle Time", placeholder: "e.g. 45", suffix: "min" },
];

// ── Types ──────────────────────────────────────────────────────────────────────

type Machine = { id: string; name: string; type: string; model: string | null };

type PricingRecord = {
  machineType: string;
  modelNumber: string;
  ats1: string | null; ats2: string | null; ats3: string | null;
  ats4: string | null; ats5: string | null; ats6: string | null;
  cnp1: string | null; cnp2: string | null;
  atsh: string | null; cyc: string | null;
};

type ModelGroup = {
  type: string;
  modelNumber: string;
  machines: Machine[];
  pricing: PricingRecord | null;
};

type PriceMap = Record<string, string>;

// ── Helpers ────────────────────────────────────────────────────────────────────

function recordToPriceMap(p: PricingRecord | null, type: string): PriceMap {
  if (!p) return {};
  if (type === "WASHER") {
    return {
      ATS1: p.ats1 ?? "", ATS2: p.ats2 ?? "", ATS3: p.ats3 ?? "",
      ATS4: p.ats4 ?? "", ATS5: p.ats5 ?? "", ATS6: p.ats6 ?? "",
      CnP1: p.cnp1 ?? "", CnP2: p.cnp2 ?? "",
    };
  }
  return { ATSH: p.atsh ?? "", CYC: p.cyc ?? "" };
}

function formatPrice(val: string | null, code: string): string {
  if (!val) return "—";
  if (code === "CYC") return `${val} min`;
  return `$${val}`;
}

function buildPdfHtml(groups: ModelGroup[]): string {
  const allCards: string[] = [];

  for (const group of groups) {
    const codes = group.type === "WASHER" ? WASHER_CODES : DRYER_CODES;
    const p = group.pricing;

    for (const machine of group.machines) {
      const rows = codes.map(({ code, label }) => {
        const key = code.toLowerCase().replace("cnp", "cnp");
        const rawVal = p ? (p as Record<string, string | null>)[key.replace(/([A-Z])/g, (m) => m.toLowerCase())] : null;
        // Look up value by lowercased key
        const dbKey = code.toLowerCase();
        const val = p ? (p as Record<string, string | null>)[dbKey] : null;
        const display = val ? (code === "CYC" ? `${val} min` : `$${val}`) : "—";
        return `<tr>
          <td style="width:18px;text-align:center;">☐</td>
          <td style="font-weight:600;white-space:nowrap;">${code}</td>
          <td>${label}</td>
          <td style="text-align:right;font-weight:700;">${display}</td>
        </tr>`;
      });

      const typeLabel = group.type === "WASHER" ? "Washer" : "Dryer";
      allCards.push(`
        <div class="card">
          <div class="card-head">
            <span class="machine-name">${machine.name}</span>
            <span class="machine-type">${typeLabel}</span>
          </div>
          <div class="model-num">${group.modelNumber}</div>
          <table>
            <thead>
              <tr>
                <th style="width:18px;"></th>
                <th>Code</th>
                <th>Mode</th>
                <th style="text-align:right;">Value</th>
              </tr>
            </thead>
            <tbody>${rows.join("")}</tbody>
          </table>
        </div>`);
    }
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Machine Pricing</title>
<style>
  @page { size: letter; margin: 0.4in; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: monospace; font-size: 9pt; background: #fff; }
  .print-btn { margin-bottom: 12px; padding: 6px 14px; cursor: pointer; font-size: 11pt; }
  @media print { .print-btn { display: none; } }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.25in; }
  .card {
    border: 1.5px solid #333;
    border-radius: 4px;
    padding: 8px 10px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .card-head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #888; padding-bottom: 4px; margin-bottom: 3px; }
  .machine-name { font-size: 12pt; font-weight: 700; }
  .machine-type { font-size: 8pt; color: #555; }
  .model-num { font-size: 7pt; color: #777; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 7.5pt; border-bottom: 1px solid #bbb; padding: 2px 3px; font-weight: 600; color: #444; }
  td { padding: 2.5px 3px; font-size: 8.5pt; vertical-align: middle; }
  tbody tr:nth-child(even) { background: #f5f5f5; }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">🖨 Print</button>
<div class="grid">${allCards.join("")}</div>
</body>
</html>`;
}

// ── ModelGroupCard ─────────────────────────────────────────────────────────────

function ModelGroupCard({
  group,
  isOwner,
  onEdit,
}: {
  group: ModelGroup;
  isOwner: boolean;
  onEdit: (g: ModelGroup) => void;
}) {
  const codes = group.type === "WASHER" ? WASHER_CODES : DRYER_CODES;
  const hasAny = codes.some(({ code }) => {
    const dbKey = code.toLowerCase();
    return group.pricing && (group.pricing as Record<string, string | null>)[dbKey];
  });

  return (
    <div className="border border-gray-200 rounded-lg bg-white p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="font-semibold text-gray-900 text-sm">{group.modelNumber}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {group.machines.length} machine{group.machines.length !== 1 ? "s" : ""}: {group.machines.map((m) => m.name).join(", ")}
          </p>
        </div>
        {isOwner && (
          <Button size="sm" variant="outline" onClick={() => onEdit(group)} className="gap-1.5 flex-shrink-0">
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        )}
      </div>

      {hasAny ? (
        <div className="grid gap-x-6 gap-y-0.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
          {codes.map(({ code, label }) => {
            const dbKey = code.toLowerCase();
            const val = group.pricing ? (group.pricing as Record<string, string | null>)[dbKey] : null;
            return (
              <div key={code} className="flex items-center justify-between py-0.5">
                <span className="text-xs text-gray-500">
                  <span className="font-mono font-semibold text-gray-700">{code}</span> {label}
                </span>
                <span className="text-xs font-semibold text-gray-900 ml-2">
                  {formatPrice(val, code)}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-gray-400 italic">No pricing set yet</p>
      )}
    </div>
  );
}

// ── PricingPage ────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const { data: session } = useSession();
  const isOwner = (session?.user as { role?: string })?.role === "OWNER";

  const [groups, setGroups] = useState<ModelGroup[]>([]);
  const [editGroup, setEditGroup] = useState<ModelGroup | null>(null);
  const [priceMap, setPriceMap] = useState<PriceMap>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/pricing")
      .then((r) => r.json())
      .then(({ machines, pricing }: { machines: Machine[]; pricing: PricingRecord[] }) => {
        const pricingByKey = new Map(
          pricing.map((p) => [`${p.machineType}:${p.modelNumber}`, p])
        );

        const groupMap = new Map<string, ModelGroup>();
        for (const m of machines) {
          const model = m.model ?? "Unknown Model";
          const key = `${m.type}:${model}`;
          if (!groupMap.has(key)) {
            groupMap.set(key, {
              type: m.type,
              modelNumber: model,
              machines: [],
              pricing: pricingByKey.get(key) ?? null,
            });
          }
          groupMap.get(key)!.machines.push(m);
        }

        setGroups(Array.from(groupMap.values()));
      });
  }, []);

  function openEdit(group: ModelGroup) {
    setPriceMap(recordToPriceMap(group.pricing, group.type));
    setEditGroup(group);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editGroup) return;
    setSaving(true);

    const body: Record<string, string> = {
      machineType: editGroup.type,
      modelNumber: editGroup.modelNumber,
    };
    const codes = editGroup.type === "WASHER" ? WASHER_CODES : DRYER_CODES;
    for (const { code } of codes) {
      const dbKey = code.toLowerCase();
      body[dbKey] = priceMap[code] ?? "";
    }

    const res = await fetch("/api/pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const updated: PricingRecord = await res.json();
      setGroups((prev) =>
        prev.map((g) =>
          g.type === editGroup.type && g.modelNumber === editGroup.modelNumber
            ? { ...g, pricing: updated }
            : g
        )
      );
      setEditGroup(null);
    }
    setSaving(false);
  }

  function handleExportPdf() {
    const html = buildPdfHtml(groups);
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  }

  const washers = groups.filter((g) => g.type === "WASHER");
  const dryers = groups.filter((g) => g.type === "DRYER");
  const editCodes = editGroup?.type === "WASHER" ? WASHER_CODES : DRYER_CODES;

  return (
    <div>
      <Header title="Pricing" description="Cycle prices and dryer codes by machine model">
        <Button variant="outline" onClick={handleExportPdf} disabled={groups.length === 0}>
          <FileDown className="h-4 w-4 mr-2" />
          Export PDF
        </Button>
      </Header>

      <PageTabs tabs={EQUIPMENT_TABS} />

      <div className="p-6 space-y-8 max-w-4xl">
        {/* Washers */}
        {washers.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-blue-600">Washers</h3>
            {washers.map((g) => (
              <ModelGroupCard key={g.modelNumber} group={g} isOwner={isOwner} onEdit={openEdit} />
            ))}
          </div>
        )}

        {/* Dryers */}
        {dryers.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-orange-600">Dryers</h3>
            {dryers.map((g) => (
              <ModelGroupCard key={g.modelNumber} group={g} isOwner={isOwner} onEdit={openEdit} />
            ))}
          </div>
        )}

        {groups.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-16">
            No washers or dryers found. Add machines in the Machines tab first.
          </p>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editGroup} onOpenChange={(o) => { if (!o) setEditGroup(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editGroup?.type === "WASHER" ? "Washer" : "Dryer"} Pricing —{" "}
              <span className="font-mono text-sm font-normal text-gray-500">{editGroup?.modelNumber}</span>
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-500 -mt-2">
            Applies to: {editGroup?.machines.map((m) => m.name).join(", ")}
          </p>

          <form onSubmit={handleSave} className="space-y-3 mt-2">
            {editCodes.map(({ code, label, ...rest }) => {
              const placeholder = (rest as { placeholder?: string }).placeholder ?? "e.g. 2.50";
              const prefix = (rest as { prefix?: string }).prefix;
              const suffix = (rest as { suffix?: string }).suffix;
              return (
                <div key={code} className="flex items-center gap-3">
                  <Label className="w-40 flex-shrink-0 text-xs">
                    <span className="font-mono font-semibold text-gray-800">{code}</span>
                    <span className="text-gray-500 ml-1.5">{label}</span>
                  </Label>
                  <div className="relative flex-1">
                    {prefix && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{prefix}</span>
                    )}
                    <Input
                      value={priceMap[code] ?? ""}
                      onChange={(e) => setPriceMap((p) => ({ ...p, [code]: e.target.value }))}
                      placeholder={placeholder}
                      className={prefix ? "pl-7" : ""}
                    />
                    {suffix && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{suffix}</span>
                    )}
                  </div>
                </div>
              );
            })}

            <Button type="submit" className="w-full mt-2" disabled={saving}>
              {saving ? "Saving…" : `Save for all ${editGroup?.machines.length} machine${editGroup?.machines.length !== 1 ? "s" : ""}`}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
