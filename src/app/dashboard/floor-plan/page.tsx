"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  WashingMachine, Wind, ShoppingCart, Wrench, Eye, EyeOff,
  ChevronUp, ChevronDown, X, MapPin,
} from "lucide-react";

type Machine = {
  id: string;
  name: string;
  type: string;
  brand: string | null;
  serialNumber: string | null;
  status: string;
  keyCode: string | null;
  floorZone: string | null;
  floorOrder: number | null;
};

const ZONES = [
  { code: "L", label: "Left Side" },
  { code: "R", label: "Right Side" },
  { code: "F", label: "Front" },
  { code: "B", label: "Back" },
  { code: "OUT", label: "Outside" },
];

const typeIcon: Record<string, React.ElementType> = {
  WASHER: WashingMachine,
  DRYER: Wind,
  VENDING: ShoppingCart,
  OTHER: Wrench,
};

const typeColor: Record<string, string> = {
  WASHER: "text-blue-500",
  DRYER: "text-orange-500",
  VENDING: "text-purple-500",
  OTHER: "text-gray-400",
};

const statusBorder: Record<string, string> = {
  OPERATIONAL: "border-l-green-400",
  OUT_OF_ORDER: "border-l-red-400",
  NEEDS_SERVICE: "border-l-yellow-400",
  RETIRED: "border-l-gray-300",
};

const statusDot: Record<string, string> = {
  OPERATIONAL: "bg-green-400",
  OUT_OF_ORDER: "bg-red-400",
  NEEDS_SERVICE: "bg-yellow-400",
  RETIRED: "bg-gray-300",
};

function KeyCode({ value }: { value: string | null }) {
  const [show, setShow] = useState(false);
  if (!value) return null;
  return (
    <span className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
      <span className="font-mono">{show ? value : "••••"}</span>
      <button onClick={(e) => { e.stopPropagation(); setShow((v) => !v); }}>
        {show ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
      </button>
    </span>
  );
}

function MachineCard({
  machine,
  onMoveUp,
  onMoveDown,
  onZoneChange,
  onUnplace,
  isFirst,
  isLast,
  compact = false,
}: {
  machine: Machine;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onZoneChange?: (zone: string) => void;
  onUnplace?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  compact?: boolean;
}) {
  const Icon = typeIcon[machine.type] ?? Wrench;
  const iconColor = typeColor[machine.type] ?? "text-gray-400";
  const border = statusBorder[machine.status] ?? "border-l-gray-200";
  const dot = statusDot[machine.status] ?? "bg-gray-200";

  return (
    <div className={`relative bg-white rounded-lg border border-gray-200 border-l-4 ${border} p-2.5 shadow-sm group`}>
      <div className="flex items-start justify-between gap-1">
        <div className="flex items-start gap-1.5 min-w-0">
          <Icon className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${iconColor}`} />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-900 truncate">{machine.name}</p>
            {machine.brand && <p className="text-xs text-gray-400 truncate">{machine.brand}</p>}
            {machine.serialNumber && (
              <p className="text-xs text-gray-400 font-mono">{machine.serialNumber}</p>
            )}
            <KeyCode value={machine.keyCode} />
          </div>
        </div>
        <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${dot}`} title={machine.status.replace(/_/g, " ")} />
      </div>

      {!compact && (
        <div className="mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30"
            title="Move up"
          >
            <ChevronUp className="h-3 w-3 text-gray-500" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30"
            title="Move down"
          >
            <ChevronDown className="h-3 w-3 text-gray-500" />
          </button>
          <div className="flex-1" />
          <Select onValueChange={onZoneChange}>
            <SelectTrigger className="h-5 text-xs px-1.5 w-20 border-gray-200">
              <SelectValue placeholder="Move…" />
            </SelectTrigger>
            <SelectContent>
              {ZONES.filter((z) => z.code !== machine.floorZone).map((z) => (
                <SelectItem key={z.code} value={z.code} className="text-xs">{z.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={onUnplace}
            className="p-0.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
            title="Remove from floor plan"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function FloorPlanPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/equipment").then((r) => r.json()).then(setMachines);
  }, []);

  const byZone = (zone: string) =>
    machines
      .filter((m) => m.floorZone === zone && m.status !== "RETIRED")
      .sort((a, b) => (a.floorOrder ?? 999) - (b.floorOrder ?? 999));

  const unplaced = machines.filter((m) => !m.floorZone && m.status !== "RETIRED");

  const save = useCallback(async (id: string, floorZone: string | null, floorOrder: number | null) => {
    setSaving(true);
    await fetch("/api/equipment/floor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, floorZone, floorOrder }),
    });
    setSaving(false);
  }, []);

  function assign(machine: Machine, zone: string) {
    const zoneList = byZone(zone);
    const newOrder = zoneList.length;
    setMachines((prev) =>
      prev.map((m) => (m.id === machine.id ? { ...m, floorZone: zone, floorOrder: newOrder } : m))
    );
    save(machine.id, zone, newOrder);
  }

  function unplace(machine: Machine) {
    setMachines((prev) =>
      prev.map((m) => (m.id === machine.id ? { ...m, floorZone: null, floorOrder: null } : m))
    );
    save(machine.id, null, null);
  }

  function moveWithin(machine: Machine, direction: "up" | "down") {
    const zone = machine.floorZone!;
    const zoneList = byZone(zone);
    const idx = zoneList.findIndex((m) => m.id === machine.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= zoneList.length) return;

    const swapTarget = zoneList[swapIdx];
    const newOrder = swapTarget.floorOrder ?? swapIdx;
    const myOrder = machine.floorOrder ?? idx;

    setMachines((prev) =>
      prev.map((m) => {
        if (m.id === machine.id) return { ...m, floorOrder: newOrder };
        if (m.id === swapTarget.id) return { ...m, floorOrder: myOrder };
        return m;
      })
    );
    fetch("/api/equipment/floor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        _action: "reorder",
        items: [
          { id: machine.id, floorOrder: newOrder },
          { id: swapTarget.id, floorOrder: myOrder },
        ],
      }),
    });
  }

  function ZoneColumn({ zone, label, side }: { zone: string; label: string; side?: "left" | "right" }) {
    const list = byZone(zone);
    return (
      <div className="flex flex-col gap-2">
        <div className={`text-xs font-bold uppercase tracking-widest mb-1 ${side === "left" ? "text-blue-700" : side === "right" ? "text-orange-700" : "text-gray-600"}`}>
          {label}
        </div>
        <div className="flex flex-col gap-2 min-h-[60px]">
          {list.map((m, i) => (
            <MachineCard
              key={m.id}
              machine={m}
              isFirst={i === 0}
              isLast={i === list.length - 1}
              onMoveUp={() => moveWithin(m, "up")}
              onMoveDown={() => moveWithin(m, "down")}
              onZoneChange={(z) => assign(m, z)}
              onUnplace={() => unplace(m)}
            />
          ))}
          {list.length === 0 && (
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-3 text-center text-xs text-gray-300">
              Empty
            </div>
          )}
        </div>
      </div>
    );
  }

  const frontList = byZone("F");
  const backList = byZone("B");
  const outsideList = byZone("OUT");

  return (
    <div>
      <Header
        title="Floor Plan"
        description="Visual layout of your store — top is front entrance"
      >
        {saving && <span className="text-xs text-gray-400">Saving…</span>}
      </Header>

      <div className="p-6 space-y-4">

        {/* Front zone */}
        {(frontList.length > 0 || true) && (
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 bg-gray-50">
            <div className="text-center text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
              ▼ ENTRANCE / FRONT OF STORE ▼
            </div>
            {frontList.length > 0 ? (
              <div className="flex flex-wrap gap-2 justify-center">
                {frontList.map((m, i) => (
                  <div key={m.id} className="w-40">
                    <MachineCard
                      machine={m}
                      isFirst={i === 0}
                      isLast={i === frontList.length - 1}
                      onMoveUp={() => moveWithin(m, "up")}
                      onMoveDown={() => moveWithin(m, "down")}
                      onZoneChange={(z) => assign(m, z)}
                      onUnplace={() => unplace(m)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-xs text-gray-300">No machines assigned to Front zone</p>
            )}
          </div>
        )}

        {/* Main store body */}
        <div className="border-2 border-gray-800 rounded-xl overflow-hidden bg-gray-50">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_60px_1fr] bg-gray-800 text-white text-xs font-bold uppercase tracking-widest">
            <div className="px-4 py-2 text-blue-300">← Left Side (Washers)</div>
            <div className="px-2 py-2 text-center text-gray-500">AISLE</div>
            <div className="px-4 py-2 text-right text-orange-300">Right Side (Dryers) →</div>
          </div>

          {/* L / Aisle / R */}
          <div className="grid grid-cols-[1fr_60px_1fr] gap-0">
            {/* Left column */}
            <div className="p-4 border-r border-gray-200">
              <ZoneColumn zone="L" label="Left" side="left" />
            </div>

            {/* Aisle */}
            <div className="bg-gray-100 flex items-center justify-center">
              <span className="text-gray-300 text-xs font-medium [writing-mode:vertical-rl] rotate-180 tracking-widest uppercase">
                Aisle
              </span>
            </div>

            {/* Right column */}
            <div className="p-4 border-l border-gray-200">
              <ZoneColumn zone="R" label="Right" side="right" />
            </div>
          </div>

          {/* Back zone inside store */}
          {backList.length > 0 && (
            <div className="border-t border-gray-200 bg-gray-100 p-3">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2 text-center">Back of Store</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {backList.map((m, i) => (
                  <div key={m.id} className="w-40">
                    <MachineCard
                      machine={m}
                      isFirst={i === 0}
                      isLast={i === backList.length - 1}
                      onMoveUp={() => moveWithin(m, "up")}
                      onMoveDown={() => moveWithin(m, "down")}
                      onZoneChange={(z) => assign(m, z)}
                      onUnplace={() => unplace(m)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="bg-gray-800 text-gray-500 text-xs text-center py-1.5 font-bold uppercase tracking-widest">
            ▲ Back of Store ▲
          </div>
        </div>

        {/* Outside zone */}
        <div className="border-2 border-dashed border-green-200 rounded-xl p-4 bg-green-50">
          <p className="text-xs font-bold uppercase tracking-widest text-green-700 mb-3 text-center">
            Outside / Exterior (HVAC, etc.)
          </p>
          {outsideList.length > 0 ? (
            <div className="flex flex-wrap gap-2 justify-center">
              {outsideList.map((m, i) => (
                <div key={m.id} className="w-40">
                  <MachineCard
                    machine={m}
                    isFirst={i === 0}
                    isLast={i === outsideList.length - 1}
                    onMoveUp={() => moveWithin(m, "up")}
                    onMoveDown={() => moveWithin(m, "down")}
                    onZoneChange={(z) => assign(m, z)}
                    onUnplace={() => unplace(m)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-xs text-green-300">No equipment assigned to Outside zone</p>
          )}
        </div>

        {/* Unplaced machines */}
        {unplaced.length > 0 && (
          <div className="border border-gray-200 rounded-xl p-4 bg-white">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5" />
              Unplaced — assign a zone to add to floor plan
            </p>
            <div className="flex flex-wrap gap-3">
              {unplaced.map((m) => {
                const Icon = typeIcon[m.type] ?? Wrench;
                const iconColor = typeColor[m.type] ?? "text-gray-400";
                return (
                  <div key={m.id} className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
                    <Icon className={`h-4 w-4 ${iconColor}`} />
                    <div>
                      <p className="text-sm font-medium">{m.name}</p>
                      {m.serialNumber && <p className="text-xs text-gray-400 font-mono">{m.serialNumber}</p>}
                    </div>
                    <Select onValueChange={(z) => assign(m, z)}>
                      <SelectTrigger className="h-7 w-28 text-xs ml-2">
                        <SelectValue placeholder="Assign…" />
                      </SelectTrigger>
                      <SelectContent>
                        {ZONES.map((z) => (
                          <SelectItem key={z.code} value={z.code} className="text-xs">
                            {z.code} — {z.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-6 text-xs text-gray-400 pt-2">
          <span className="font-medium">Status:</span>
          {[
            { label: "Operational", color: "bg-green-400" },
            { label: "Out of Order", color: "bg-red-400" },
            { label: "Needs Service", color: "bg-yellow-400" },
          ].map((s) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${s.color}`} />
              {s.label}
            </span>
          ))}
          <span className="ml-4 text-gray-300">Hover a card to reorder or move zones.</span>
        </div>
      </div>
    </div>
  );
}
