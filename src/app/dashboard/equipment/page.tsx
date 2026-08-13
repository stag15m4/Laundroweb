"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  WashingMachine,
  Wind,
  ShoppingCart,
  Wrench,
  Thermometer,
  AirVent,
  Building2,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  X,
  Plus,
  FileDown,
  Settings,
  MapPin,
  AlertTriangle,
  BookOpen,
  Upload,
  Trash2,
  Copy,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type Machine = {
  id: string;
  name: string;
  type: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  location: string | null;
  installDate: string | null;
  warrantyExpiry: string | null;
  status: string;
  notes: string | null;
  cycleCount: number;
  keyCode: string | null;
  floorZone: string | null;
  floorOrder: number | null;
  _count: { maintenanceLogs: number };
};

type ManualDoc = {
  id: string;
  name: string;
  machineType: string | null;
  machineId: string | null;
  fileName: string;
  fileSize: number;
  updatedAt: string;
};

type PartInventory = {
  id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  minimumStock: number;
  costPerUnit: string | null;
};

type PartUsed = {
  id: string;
  partId: string;
  quantityUsed: number;
  part: { id: string; name: string; unit: string; costPerUnit: string | null };
};

type MaintenanceLog = {
  id: string;
  machineId: string | null;
  date: string;
  type: string;
  description: string;
  cost: string | null;
  technician: string | null;
  vendor: string | null;
  nextDueDate: string | null;
  status: string;
  partsUsed?: PartUsed[];
};

// ── Constants ──────────────────────────────────────────────────────────────────

const ZONES = [
  { code: "L", label: "Left Side" },
  { code: "R", label: "Right Side" },
  { code: "F", label: "Front" },
  { code: "B", label: "Back" },
  { code: "OUT", label: "Outside" },
];

const LOG_TYPES = [
  "General Service",
  "Repair",
  "Belt Replacement",
  "Filter Change",
  "Cleaning",
  "Inspection",
  "Preventive Maintenance",
  "Vent Cleaning",
  "Other",
];

const typeIcon: Record<string, React.ElementType> = {
  WASHER: WashingMachine,
  DRYER: Wind,
  VENDING: ShoppingCart,
  WATER_HEATER: Thermometer,
  AIR_CONDITIONER: AirVent,
  OTHER: Wrench,
};

const typeColor: Record<string, string> = {
  WASHER: "text-blue-500",
  DRYER: "text-orange-500",
  VENDING: "text-purple-500",
  WATER_HEATER: "text-red-400",
  AIR_CONDITIONER: "text-cyan-500",
  OTHER: "text-gray-400",
};

const typeLabel: Record<string, string> = {
  WASHER: "Washer",
  DRYER: "Dryer",
  VENDING: "Vending Machine",
  WATER_HEATER: "Water Heater",
  AIR_CONDITIONER: "Air Conditioner",
  OTHER: "Other",
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

const statusColors: Record<string, "success" | "destructive" | "warning" | "secondary"> = {
  OPERATIONAL: "success",
  OUT_OF_ORDER: "destructive",
  NEEDS_SERVICE: "warning",
  RETIRED: "secondary",
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const emptyLogForm = () => ({
  type: "General Service",
  description: "",
  date: todayStr(),
  cost: "",
  technician: "",
  vendor: "",
  nextDueDate: "",
});

const emptyMachineForm = {
  name: "",
  type: "WASHER",
  brand: "",
  model: "",
  serialNumber: "",
  location: "",
  installDate: "",
  warrantyExpiry: "",
  status: "OPERATIONAL",
  notes: "",
  keyCode: "",
};

// ── KeyCode ────────────────────────────────────────────────────────────────────

function KeyCode({ value }: { value: string | null }) {
  const [show, setShow] = useState(false);
  if (!value) return null;
  return (
    <span className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
      <span className="font-mono">{show ? value : "••••"}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShow((v) => !v);
        }}
      >
        {show ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
      </button>
    </span>
  );
}

// ── FloorMachineCard ───────────────────────────────────────────────────────────

function FloorMachineCard({
  machine,
  onSelect,
  onMoveUp,
  onMoveDown,
  onZoneChange,
  onUnplace,
  isFirst,
  isLast,
  isOwner,
}: {
  machine: Machine;
  onSelect: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onZoneChange?: (zone: string) => void;
  onUnplace?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  isOwner: boolean;
}) {
  const Icon = typeIcon[machine.type] ?? Wrench;
  const iconColor = typeColor[machine.type] ?? "text-gray-400";
  const border = statusBorder[machine.status] ?? "border-l-gray-200";
  const dot = statusDot[machine.status] ?? "bg-gray-200";

  return (
    <div
      className={`relative bg-white rounded-lg border border-gray-200 border-l-4 ${border} p-2.5 shadow-sm group cursor-pointer hover:shadow-md transition-shadow`}
      onClick={onSelect}
    >
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
        <div
          className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${dot}`}
          title={machine.status.replace(/_/g, " ")}
        />
      </div>

      {isOwner && (
        <div className="mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp?.();
            }}
            disabled={isFirst}
            className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30"
            title="Move up"
          >
            <ChevronUp className="h-3 w-3 text-gray-500" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown?.();
            }}
            disabled={isLast}
            className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30"
            title="Move down"
          >
            <ChevronDown className="h-3 w-3 text-gray-500" />
          </button>
          <div className="flex-1" />
          <Select
            onValueChange={(z) => {
              onZoneChange?.(z);
            }}
          >
            <SelectTrigger
              className="h-5 text-xs px-1.5 w-20 border-gray-200"
              onClick={(e) => e.stopPropagation()}
            >
              <SelectValue placeholder="Move…" />
            </SelectTrigger>
            <SelectContent>
              {ZONES.filter((z) => z.code !== machine.floorZone).map((z) => (
                <SelectItem key={z.code} value={z.code} className="text-xs">
                  {z.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUnplace?.();
            }}
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

// ── MachineDetailModal ─────────────────────────────────────────────────────────

function MachineDetailModal({
  machine,
  open,
  onClose,
  onMachineUpdated,
  onMachineCloned,
  onPartsChanged,
  onManualsChanged,
  isOwner,
  parts,
  manuals,
}: {
  machine: Machine | null | undefined;
  open: boolean;
  onClose: () => void;
  onMachineUpdated: (m: Machine) => void;
  onMachineCloned: (m: Machine) => void;
  onPartsChanged: (partId: string, delta: number) => void;
  onManualsChanged: (manual: ManualDoc | null, deletedId?: string) => void;
  isOwner: boolean;
  parts: PartInventory[];
  manuals: ManualDoc[];
}) {
  const [mode, setMode] = useState<"maintenance" | "setup">("maintenance");
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [logForm, setLogForm] = useState(emptyLogForm());
  const [partsUsed, setPartsUsed] = useState<{ partId: string; quantityUsed: number }[]>([]);
  const [addPartId, setAddPartId] = useState("");
  const [addPartQty, setAddPartQty] = useState("1");
  const [setupForm, setSetupForm] = useState(emptyMachineForm);
  const [saving, setSaving] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [uploadingManual, setUploadingManual] = useState(false);

  const machineKey = machine === null ? "building" : machine?.id;

  useEffect(() => {
    if (!open) return;
    setMode("maintenance");
    setShowForm(false);
    setShowMore(false);
    setCollapsed(true);
    setPartsUsed([]);
    setAddPartId("");
    setAddPartQty("1");
    if (!machineKey) return;
    setLogsLoading(true);
    fetch(`/api/maintenance?machineId=${machineKey}`)
      .then((r) => r.json())
      .then((data) => {
        setLogs(Array.isArray(data) ? data : []);
        setLogsLoading(false);
      });
  }, [open, machineKey]);

  useEffect(() => {
    if (machine) {
      setSetupForm({
        name: machine.name,
        type: machine.type,
        brand: machine.brand ?? "",
        model: machine.model ?? "",
        serialNumber: machine.serialNumber ?? "",
        location: machine.location ?? "",
        installDate: machine.installDate ? machine.installDate.slice(0, 10) : "",
        warrantyExpiry: machine.warrantyExpiry ? machine.warrantyExpiry.slice(0, 10) : "",
        status: machine.status,
        notes: machine.notes ?? "",
        keyCode: machine.keyCode ?? "",
      });
    }
  }, [machine]);

  const isBuilding = machine === null;
  const title = isBuilding ? "Building / Facility" : machine?.name ?? "";
  const Icon = isBuilding ? Building2 : (typeIcon[machine?.type ?? ""] ?? Wrench);
  const iconColor = isBuilding ? "text-gray-600" : (typeColor[machine?.type ?? ""] ?? "text-gray-400");
  const dot = isBuilding ? "bg-gray-400" : (statusDot[machine?.status ?? ""] ?? "bg-gray-200");

  async function submitLog(e: React.FormEvent) {
    e.preventDefault();
    const machineId = isBuilding ? null : (machine?.id ?? null);
    const res = await fetch("/api/maintenance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        machineId,
        date: logForm.date,
        type: logForm.type,
        description: logForm.description,
        cost: logForm.cost || null,
        technician: logForm.technician || null,
        vendor: logForm.vendor || null,
        nextDueDate: logForm.nextDueDate || null,
        status: "COMPLETED",
        parts: partsUsed,
      }),
    });
    if (res.ok) {
      const log = await res.json();
      setLogs((prev) => [log, ...prev]);
      // Update local parts inventory counts
      for (const { partId, quantityUsed } of partsUsed) {
        onPartsChanged(partId, -quantityUsed);
      }
      setLogForm(emptyLogForm());
      setPartsUsed([]);
      setAddPartId("");
      setAddPartQty("1");
      setShowForm(false);
      setShowMore(false);
    }
  }

  async function toggleLogStatus(log: MaintenanceLog) {
    const newStatus = log.status === "COMPLETED" ? "SCHEDULED" : "COMPLETED";
    const res = await fetch(`/api/maintenance/${log.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      const updated = await res.json();
      setLogs((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    }
  }

  async function deleteLog(id: string) {
    const res = await fetch(`/api/maintenance/${id}`, { method: "DELETE" });
    if (res.ok) setLogs((prev) => prev.filter((l) => l.id !== id));
  }

  async function saveSetup(e: React.FormEvent) {
    e.preventDefault();
    if (!machine) return;
    setSaving(true);
    const res = await fetch(`/api/equipment/${machine.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(setupForm),
    });
    if (res.ok) {
      const updated = await res.json();
      onMachineUpdated({ ...machine, ...updated, _count: machine._count });
    }
    setSaving(false);
  }

  async function cloneMachine() {
    if (!machine) return;
    setCloning(true);
    const res = await fetch("/api/equipment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${machine.name} (Copy)`,
        type: machine.type,
        brand: machine.brand ?? "",
        model: machine.model ?? "",
        serialNumber: "",   // unique per physical unit — fill in after cloning
        location: machine.location ?? "",
        installDate: "",
        warrantyExpiry: "",
        status: "OPERATIONAL",
        notes: machine.notes ?? "",
        keyCode: machine.keyCode ?? "",
      }),
    });
    if (res.ok) {
      const created = await res.json();
      onMachineCloned({ ...created, _count: { maintenanceLogs: 0 } });
    }
    setCloning(false);
  }

  const visibleLogs = collapsed ? logs.slice(0, 5) : logs;

  // Manual for this machine: machine-specific first, then type-level
  const isBuilding2 = machine === null;
  const manual = isBuilding2
    ? manuals.find((m) => m.machineType === "BUILDING")
    : machine
    ? (manuals.find((m) => m.machineId === machine.id) ??
       manuals.find((m) => m.machineType === machine.type))
    : undefined;

  async function uploadManual(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !machine && !isBuilding2) return;
    setUploadingManual(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("name", file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " "));
    if (isBuilding2) {
      fd.append("machineType", "BUILDING");
    } else if (machine!.type === "OTHER") {
      // machine-specific for OTHER types
      fd.append("machineId", machine!.id);
    } else {
      fd.append("machineType", machine!.type);
    }
    const res = await fetch("/api/manuals", { method: "POST", body: fd });
    if (res.ok) {
      const created = await res.json();
      onManualsChanged(created);
    }
    setUploadingManual(false);
    e.target.value = "";
  }

  async function deleteManual() {
    if (!manual) return;
    const res = await fetch(`/api/manuals/${manual.id}`, { method: "DELETE" });
    if (res.ok) onManualsChanged(null, manual.id);
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle asChild>
            <div className="flex items-center gap-3 flex-wrap">
              <Icon className={`h-5 w-5 flex-shrink-0 ${iconColor}`} />
              <span className="font-bold text-base">{title}</span>
              {!isBuilding && machine && (
                <>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                  <Badge variant={statusColors[machine.status]}>
                    {machine.status.replace(/_/g, " ")}
                  </Badge>
                </>
              )}
              {!isBuilding && machine && isOwner && (
                <Button
                  type="button"
                  variant={mode === "setup" ? "default" : "ghost"}
                  size="icon"
                  className="ml-auto h-7 w-7"
                  onClick={() => setMode((m) => (m === "setup" ? "maintenance" : "setup"))}
                  title="Machine setup"
                >
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 space-y-4 pr-1 pt-1">
          {mode === "maintenance" ? (
            <>
              {/* Action row: Log Service + Manual */}
              {!showForm && (
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => setShowForm(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Log Service
                  </Button>
                  {manual && (
                    <Button size="sm" variant="outline" onClick={() => setViewerOpen(true)}>
                      <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                      {manual.name}
                    </Button>
                  )}
                </div>
              )}

              {/* Quick log form */}
              {showForm && (
                <form
                  onSubmit={submitLog}
                  className="border rounded-lg p-4 bg-gray-50 space-y-3"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Type</Label>
                      <Select
                        value={logForm.type}
                        onValueChange={(v) => setLogForm((f) => ({ ...f, type: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LOG_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Date</Label>
                      <Input
                        type="date"
                        value={logForm.date}
                        onChange={(e) => setLogForm((f) => ({ ...f, date: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Description</Label>
                    <Input
                      value={logForm.description}
                      onChange={(e) => setLogForm((f) => ({ ...f, description: e.target.value }))}
                      placeholder="What was done?"
                      required
                    />
                  </div>
                  {!showMore ? (
                    <button
                      type="button"
                      onClick={() => setShowMore(true)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      + More details (cost, parts, technician, vendor, next due)
                    </button>
                  ) : (() => {
                    const partsCost = partsUsed.reduce((sum, { partId, quantityUsed }) => {
                      const p = parts.find((x) => x.id === partId);
                      return sum + (p?.costPerUnit ? Number(p.costPerUnit) * quantityUsed : 0);
                    }, 0);
                    const availableParts = parts.filter(
                      (p) => !partsUsed.some((u) => u.partId === p.id)
                    );
                    return (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label>Cost ($)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={logForm.cost}
                              onChange={(e) => setLogForm((f) => ({ ...f, cost: e.target.value }))}
                              placeholder="0.00"
                            />
                            {partsCost > 0 && !logForm.cost && (
                              <button
                                type="button"
                                onClick={() => setLogForm((f) => ({ ...f, cost: partsCost.toFixed(2) }))}
                                className="text-xs text-blue-600 hover:underline"
                              >
                                Use parts cost ({formatCurrency(partsCost)})
                              </button>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            <Label>Next Due Date</Label>
                            <Input
                              type="date"
                              value={logForm.nextDueDate}
                              onChange={(e) =>
                                setLogForm((f) => ({ ...f, nextDueDate: e.target.value }))
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Technician</Label>
                            <Input
                              value={logForm.technician}
                              onChange={(e) =>
                                setLogForm((f) => ({ ...f, technician: e.target.value }))
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Vendor / Company</Label>
                            <Input
                              value={logForm.vendor}
                              onChange={(e) =>
                                setLogForm((f) => ({ ...f, vendor: e.target.value }))
                              }
                            />
                          </div>
                        </div>
                        {/* Parts used */}
                        {parts.length > 0 && (
                          <div className="space-y-2">
                            <Label>Parts Used</Label>
                            {partsUsed.map(({ partId, quantityUsed }) => {
                              const p = parts.find((x) => x.id === partId);
                              if (!p) return null;
                              return (
                                <div key={partId} className="flex items-center gap-2 text-sm">
                                  <span className="flex-1">
                                    {p.name} × {quantityUsed} {p.unit}
                                    {p.costPerUnit && (
                                      <span className="text-gray-400 ml-1.5">
                                        ({formatCurrency(Number(p.costPerUnit) * quantityUsed)})
                                      </span>
                                    )}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPartsUsed((prev) =>
                                        prev.filter((u) => u.partId !== partId)
                                      )
                                    }
                                    className="text-gray-400 hover:text-red-500"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              );
                            })}
                            {availableParts.length > 0 && (
                              <div className="flex items-center gap-2">
                                <Select
                                  value={addPartId}
                                  onValueChange={setAddPartId}
                                >
                                  <SelectTrigger className="flex-1 h-8 text-xs">
                                    <SelectValue placeholder="Select part…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availableParts.map((p) => (
                                      <SelectItem key={p.id} value={p.id} className="text-xs">
                                        {p.name} ({p.quantity} {p.unit} on hand)
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Input
                                  type="number"
                                  min="1"
                                  value={addPartQty}
                                  onChange={(e) => setAddPartQty(e.target.value)}
                                  className="w-16 h-8 text-xs"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2"
                                  disabled={!addPartId}
                                  onClick={() => {
                                    if (!addPartId) return;
                                    setPartsUsed((prev) => [
                                      ...prev,
                                      { partId: addPartId, quantityUsed: Math.max(1, Number(addPartQty)) },
                                    ]);
                                    setAddPartId("");
                                    setAddPartQty("1");
                                  }}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <div className="flex items-center gap-2">
                    <Button type="submit" size="sm">
                      Save Log
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowForm(false);
                        setShowMore(false);
                        setLogForm(emptyLogForm());
                        setPartsUsed([]);
                        setAddPartId("");
                        setAddPartQty("1");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}

              {/* Log list */}
              {logsLoading ? (
                <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
              ) : logs.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No service logs yet.</p>
              ) : (
                <div className="space-y-2">
                  {visibleLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 border rounded-lg p-3 bg-white hover:bg-gray-50"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="text-xs font-semibold text-gray-900">{log.type}</span>
                          <span className="text-xs text-gray-400">{formatDate(log.date)}</span>
                          {log.cost && (
                            <span className="text-xs text-green-700 font-medium">
                              {formatCurrency(Number(log.cost))}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700">{log.description}</p>
                        {log.partsUsed && log.partsUsed.length > 0 && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            Parts:{" "}
                            {log.partsUsed.map((u, i) => (
                              <span key={u.id}>
                                {i > 0 && ", "}
                                {u.part.name} ×{u.quantityUsed}
                              </span>
                            ))}
                            {(() => {
                              const total = log.partsUsed.reduce(
                                (s, u) =>
                                  s + (u.part.costPerUnit ? Number(u.part.costPerUnit) * u.quantityUsed : 0),
                                0
                              );
                              return total > 0 ? (
                                <span className="text-gray-400 ml-1">({formatCurrency(total)})</span>
                              ) : null;
                            })()}
                          </p>
                        )}
                        {(log.technician || log.vendor) && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {[log.technician, log.vendor].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        {log.nextDueDate && (
                          <p
                            className={`text-xs mt-0.5 font-medium ${
                              new Date(log.nextDueDate) < new Date()
                                ? "text-red-500"
                                : "text-blue-600"
                            }`}
                          >
                            Next due: {formatDate(log.nextDueDate)}
                            {new Date(log.nextDueDate) < new Date() && " (overdue)"}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => toggleLogStatus(log)}
                          className={`text-xs px-2 py-0.5 rounded-full border font-medium transition-colors ${
                            log.status === "COMPLETED"
                              ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                              : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                          }`}
                        >
                          {log.status === "COMPLETED"
                            ? "Done"
                            : log.status === "SCHEDULED"
                            ? "Scheduled"
                            : log.status}
                        </button>
                        {isOwner && (
                          <button
                            onClick={() => deleteLog(log.id)}
                            className="p-1 text-gray-300 hover:text-red-400 transition-colors"
                            title="Delete log"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {logs.length > 5 && (
                    <button
                      onClick={() => setCollapsed((c) => !c)}
                      className="text-xs text-blue-600 hover:underline w-full text-center py-1"
                    >
                      {collapsed
                        ? `Show ${logs.length - 5} older log${logs.length - 5 !== 1 ? "s" : ""}`
                        : "Show less"}
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            // Setup mode — owner only, non-building machines
            machine && (
              <form onSubmit={saveSetup} className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="s-name">Unit</Label>
                  <Input
                    id="s-name"
                    value={setupForm.name}
                    onChange={(e) => setSetupForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select
                    value={setupForm.type}
                    onValueChange={(v) => setSetupForm((f) => ({ ...f, type: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WASHER">Washer</SelectItem>
                      <SelectItem value="DRYER">Dryer</SelectItem>
                      <SelectItem value="VENDING">Vending Machine</SelectItem>
                      <SelectItem value="WATER_HEATER">Water Heater</SelectItem>
                      <SelectItem value="AIR_CONDITIONER">Air Conditioner</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-brand">Brand</Label>
                  <Input
                    id="s-brand"
                    value={setupForm.brand}
                    onChange={(e) => setSetupForm((f) => ({ ...f, brand: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-model">Model</Label>
                  <Input
                    id="s-model"
                    value={setupForm.model}
                    onChange={(e) => setSetupForm((f) => ({ ...f, model: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-serial">Serial Number</Label>
                  <Input
                    id="s-serial"
                    value={setupForm.serialNumber}
                    onChange={(e) => setSetupForm((f) => ({ ...f, serialNumber: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-keycode">Key Code</Label>
                  <Input
                    id="s-keycode"
                    value={setupForm.keyCode}
                    onChange={(e) => setSetupForm((f) => ({ ...f, keyCode: e.target.value }))}
                    placeholder="Coin box or panel access code"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-location">Location</Label>
                  <Input
                    id="s-location"
                    value={setupForm.location}
                    onChange={(e) => setSetupForm((f) => ({ ...f, location: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select
                    value={setupForm.status}
                    onValueChange={(v) => setSetupForm((f) => ({ ...f, status: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OPERATIONAL">Operational</SelectItem>
                      <SelectItem value="NEEDS_SERVICE">Needs Service</SelectItem>
                      <SelectItem value="OUT_OF_ORDER">Out of Order</SelectItem>
                      <SelectItem value="RETIRED">Retired</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-install">Install Date</Label>
                  <Input
                    id="s-install"
                    type="date"
                    value={setupForm.installDate}
                    onChange={(e) => setSetupForm((f) => ({ ...f, installDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-warranty">Warranty Expiry</Label>
                  <Input
                    id="s-warranty"
                    type="date"
                    value={setupForm.warrantyExpiry}
                    onChange={(e) =>
                      setSetupForm((f) => ({ ...f, warrantyExpiry: e.target.value }))
                    }
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="s-notes">Notes</Label>
                  <Input
                    id="s-notes"
                    value={setupForm.notes}
                    onChange={(e) => setSetupForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
                <div className="col-span-2 flex gap-2 flex-wrap">
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving…" : "Save Changes"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={cloning}
                    onClick={cloneMachine}
                    title="Duplicate this machine (copies type, brand, model — clears serial # and dates)"
                  >
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                    {cloning ? "Duplicating…" : "Duplicate Machine"}
                  </Button>
                </div>
              </form>
            )
          )}

          {/* Manual section — visible in both modes */}
          {mode === "setup" && isOwner && (machine || isBuilding2) && (
            <div className="border-t pt-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Maintenance Manual
              </p>
              {manual ? (
                <div className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50">
                  <BookOpen className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{manual.name}</p>
                    <p className="text-xs text-gray-400">
                      {manual.fileName} · {(manual.fileSize / 1024 / 1024).toFixed(1)} MB
                      {machine?.type !== "OTHER" && (
                        <span className="ml-1 text-blue-600">
                          (applies to all {machine?.type?.toLowerCase() ?? "building"}s)
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setViewerOpen(true)}
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                    </Button>
                    <label
                      className="cursor-pointer inline-flex items-center justify-center rounded-md p-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors"
                      title="Replace manual"
                    >
                      <input
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={uploadManual}
                        disabled={uploadingManual}
                      />
                      <Upload className="h-3.5 w-3.5" />
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={deleteManual}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <label className="cursor-pointer flex items-center gap-2 p-3 border-2 border-dashed border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={uploadManual}
                    disabled={uploadingManual}
                  />
                  <Upload className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-500">
                    {uploadingManual ? "Uploading…" : "Upload PDF manual"}
                  </span>
                </label>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* PDF viewer dialog */}
    <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
      <DialogContent className="max-w-5xl max-h-[95vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-4 pb-2 flex-shrink-0">
          <DialogTitle>{manual?.name ?? "Manual"}</DialogTitle>
        </DialogHeader>
        {manual && (
          <iframe
            src={`/api/manuals/${manual.id}/file`}
            className="flex-1 w-full min-h-[80vh] border-0"
            title={manual.name}
          />
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}

// ── EquipmentPage ──────────────────────────────────────────────────────────────

export default function EquipmentPage() {
  const { data: session } = useSession();
  const isOwner = (session?.user as { role?: string })?.role === "OWNER";

  const [machines, setMachines] = useState<Machine[]>([]);
  const [parts, setParts] = useState<PartInventory[]>([]);
  const [manuals, setManuals] = useState<ManualDoc[]>([]);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null | undefined>(undefined);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(emptyMachineForm);

  useEffect(() => {
    fetch("/api/equipment").then((r) => r.json()).then(setMachines);
    fetch("/api/parts").then((r) => r.json()).then(setParts);
    fetch("/api/manuals").then((r) => r.json()).then(setManuals);
  }, []);

  function handlePartsChanged(partId: string, delta: number) {
    setParts((prev) =>
      prev.map((p) => (p.id === partId ? { ...p, quantity: p.quantity + delta } : p))
    );
  }

  function handleManualsChanged(manual: ManualDoc | null, deletedId?: string) {
    if (deletedId) {
      setManuals((prev) => prev.filter((m) => m.id !== deletedId));
    } else if (manual) {
      setManuals((prev) => {
        const exists = prev.find((m) => m.id === manual.id);
        return exists
          ? prev.map((m) => (m.id === manual.id ? manual : m))
          : [...prev, manual];
      });
    }
  }

  // ── Floor plan helpers ───────────────────────────────────────────────────────

  const byZone = useCallback(
    (zone: string) =>
      machines
        .filter((m) => m.floorZone === zone && m.status !== "RETIRED")
        .sort((a, b) => (a.floorOrder ?? 999) - (b.floorOrder ?? 999)),
    [machines]
  );

  function assign(machine: Machine, zone: string) {
    const zoneList = byZone(zone);
    const newOrder = zoneList.length;
    setMachines((prev) =>
      prev.map((m) => (m.id === machine.id ? { ...m, floorZone: zone, floorOrder: newOrder } : m))
    );
    fetch("/api/equipment/floor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: machine.id, floorZone: zone, floorOrder: newOrder }),
    });
  }

  function unplace(machine: Machine) {
    setMachines((prev) =>
      prev.map((m) =>
        m.id === machine.id ? { ...m, floorZone: null, floorOrder: null } : m
      )
    );
    fetch("/api/equipment/floor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: machine.id, floorZone: null, floorOrder: null }),
    });
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

  function handleMachineUpdated(updated: Machine) {
    setMachines((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    setSelectedMachine(updated);
  }

  function handleMachineCloned(cloned: Machine) {
    setMachines((prev) => [...prev, cloned]);
    setSelectedMachine(cloned); // switch the open modal to the new clone
  }

  // ── Add machine ──────────────────────────────────────────────────────────────

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/equipment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    });
    if (res.ok) {
      const created = await res.json();
      setMachines((prev) => [...prev, { ...created, _count: { maintenanceLogs: 0 } }]);
      setAddForm(emptyMachineForm);
      setAddOpen(false);
    }
  }

  // ── ZoneColumn ───────────────────────────────────────────────────────────────

  function ZoneColumn({
    zone,
    label,
    side,
  }: {
    zone: string;
    label: string;
    side?: "left" | "right";
  }) {
    const list = byZone(zone);
    return (
      <div className="flex flex-col gap-2">
        <div
          className={`text-xs font-bold uppercase tracking-widest mb-1 ${
            side === "left"
              ? "text-blue-700"
              : side === "right"
              ? "text-orange-700"
              : "text-gray-600"
          }`}
        >
          {label}
        </div>
        <div className="flex flex-col gap-2 min-h-[60px]">
          {list.map((m, i) => (
            <FloorMachineCard
              key={m.id}
              machine={m}
              onSelect={() => setSelectedMachine(m)}
              isFirst={i === 0}
              isLast={i === list.length - 1}
              onMoveUp={() => moveWithin(m, "up")}
              onMoveDown={() => moveWithin(m, "down")}
              onZoneChange={(z) => assign(m, z)}
              onUnplace={() => unplace(m)}
              isOwner={isOwner}
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
  const unplacedMachines = machines.filter((m) => !m.floorZone && m.status !== "RETIRED");
  const outOfOrderCount = machines.filter((m) => m.status === "OUT_OF_ORDER").length;

  async function handleExportPDF() {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });

    const generated = new Date().toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Equipment Inventory Report", 14, 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${generated}`, 14, 26);
    doc.text(`${machines.filter(m => m.status !== "RETIRED").length} active machines`, 14, 32);
    doc.setTextColor(0);

    const statusLabel: Record<string, string> = {
      OPERATIONAL: "Operational",
      OUT_OF_ORDER: "Out of Order",
      NEEDS_SERVICE: "Needs Service",
      RETIRED: "Retired",
    };

    const sorted = [...machines].sort((a, b) =>
      (typeLabel[a.type] ?? a.type).localeCompare(typeLabel[b.type] ?? b.type) ||
      a.name.localeCompare(b.name)
    );

    const rows = sorted.map((m) => [
      m.name,
      typeLabel[m.type] ?? m.type,
      m.brand ?? "—",
      m.model ?? "—",
      m.serialNumber ?? "—",
      statusLabel[m.status] ?? m.status,
      [m.floorZone, m.location].filter(Boolean).join(" · ") || "—",
      m.installDate ? new Date(m.installDate).toLocaleDateString("en-US") : "—",
      m.warrantyExpiry ? new Date(m.warrantyExpiry).toLocaleDateString("en-US") : "—",
      m.cycleCount > 0 ? m.cycleCount.toLocaleString() : "—",
      m.keyCode ?? "—",
      m.notes ? (m.notes.length > 50 ? m.notes.slice(0, 47) + "…" : m.notes) : "—",
    ]);

    autoTable(doc, {
      head: [["Unit", "Type", "Brand", "Model", "Serial #", "Status", "Location", "Installed", "Warranty", "Cycles", "Key", "Notes"]],
      body: rows,
      startY: 38,
      styles: { fontSize: 7.5, cellPadding: 2.5, overflow: "linebreak" },
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: "bold", fontSize: 7.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { fontStyle: "bold", minCellWidth: 22 },
        4: { font: "courier", fontSize: 6.5, minCellWidth: 28 },
        11: { minCellWidth: 35, cellWidth: "wrap" },
      },
    });

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      const w = doc.internal.pageSize.getWidth();
      const h = doc.internal.pageSize.getHeight();
      doc.text(`Page ${i} of ${pageCount}`, w - 14, h - 8, { align: "right" });
    }

    doc.save(`equipment-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <div>
      <Header title="Equipment" description="Floor plan, maintenance logs, and machine details">
        <Button variant="outline" onClick={handleExportPDF} disabled={machines.length === 0}>
          <FileDown className="h-4 w-4 mr-2" />
          Export PDF
        </Button>
        {isOwner && (
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Machine
          </Button>
        )}
      </Header>

      {/* Add machine dialog */}
      {isOwner && (
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add Machine</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="a-name">Unit</Label>
                <Input
                  id="a-name"
                  value={addForm.name}
                  onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Washer 1"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={addForm.type}
                  onValueChange={(v) => setAddForm((f) => ({ ...f, type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WASHER">Washer</SelectItem>
                    <SelectItem value="DRYER">Dryer</SelectItem>
                    <SelectItem value="VENDING">Vending Machine</SelectItem>
                    <SelectItem value="WATER_HEATER">Water Heater</SelectItem>
                    <SelectItem value="AIR_CONDITIONER">Air Conditioner</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-brand">Brand</Label>
                <Input
                  id="a-brand"
                  value={addForm.brand}
                  onChange={(e) => setAddForm((f) => ({ ...f, brand: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-model">Model</Label>
                <Input
                  id="a-model"
                  value={addForm.model}
                  onChange={(e) => setAddForm((f) => ({ ...f, model: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-serial">Serial Number</Label>
                <Input
                  id="a-serial"
                  value={addForm.serialNumber}
                  onChange={(e) => setAddForm((f) => ({ ...f, serialNumber: e.target.value }))}
                  placeholder="e.g. W-001"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-keycode">Key Code</Label>
                <Input
                  id="a-keycode"
                  value={addForm.keyCode}
                  onChange={(e) => setAddForm((f) => ({ ...f, keyCode: e.target.value }))}
                  placeholder="Coin box or panel access code"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-location">Location</Label>
                <Input
                  id="a-location"
                  value={addForm.location}
                  onChange={(e) => setAddForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="e.g. Row A, Position 1"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={addForm.status}
                  onValueChange={(v) => setAddForm((f) => ({ ...f, status: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPERATIONAL">Operational</SelectItem>
                    <SelectItem value="NEEDS_SERVICE">Needs Service</SelectItem>
                    <SelectItem value="OUT_OF_ORDER">Out of Order</SelectItem>
                    <SelectItem value="RETIRED">Retired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-install">Install Date</Label>
                <Input
                  id="a-install"
                  type="date"
                  value={addForm.installDate}
                  onChange={(e) => setAddForm((f) => ({ ...f, installDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-warranty">Warranty Expiry</Label>
                <Input
                  id="a-warranty"
                  type="date"
                  value={addForm.warrantyExpiry}
                  onChange={(e) => setAddForm((f) => ({ ...f, warrantyExpiry: e.target.value }))}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="a-notes">Notes</Label>
                <Input
                  id="a-notes"
                  value={addForm.notes}
                  onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div className="col-span-2">
                <Button type="submit" className="w-full">
                  Add Machine
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      <div className="p-6 space-y-4">
        {/* Out of order alert */}
        {outOfOrderCount > 0 && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {outOfOrderCount} machine{outOfOrderCount !== 1 ? "s" : ""} currently out of order.
          </div>
        )}

        {/* Front zone */}
        <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 bg-gray-50">
          <div className="text-center text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
            ▼ ENTRANCE / FRONT OF STORE ▼
          </div>
          {frontList.length > 0 ? (
            <div className="flex flex-wrap gap-2 justify-center">
              {frontList.map((m, i) => (
                <div key={m.id} className="w-40">
                  <FloorMachineCard
                    machine={m}
                    onSelect={() => setSelectedMachine(m)}
                    isFirst={i === 0}
                    isLast={i === frontList.length - 1}
                    onMoveUp={() => moveWithin(m, "up")}
                    onMoveDown={() => moveWithin(m, "down")}
                    onZoneChange={(z) => assign(m, z)}
                    onUnplace={() => unplace(m)}
                    isOwner={isOwner}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-xs text-gray-300">
              No machines assigned to Front zone
            </p>
          )}
        </div>

        {/* Main store body */}
        <div className="border-2 border-gray-800 rounded-xl overflow-hidden bg-gray-50">
          <div className="grid grid-cols-[1fr_60px_1fr] bg-gray-800 text-white text-xs font-bold uppercase tracking-widest">
            <div className="px-4 py-2 text-blue-300">← Left Side (Washers)</div>
            <div className="px-2 py-2 text-center text-gray-500">AISLE</div>
            <div className="px-4 py-2 text-right text-orange-300">Right Side (Dryers) →</div>
          </div>
          <div className="grid grid-cols-[1fr_60px_1fr]">
            <div className="p-4 border-r border-gray-200">
              <ZoneColumn zone="L" label="Left" side="left" />
            </div>
            <div className="bg-gray-100 flex items-center justify-center">
              <span className="text-gray-300 text-xs font-medium [writing-mode:vertical-rl] rotate-180 tracking-widest uppercase">
                Aisle
              </span>
            </div>
            <div className="p-4 border-l border-gray-200">
              <ZoneColumn zone="R" label="Right" side="right" />
            </div>
          </div>
          {backList.length > 0 && (
            <div className="border-t border-gray-200 bg-gray-100 p-3">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2 text-center">
                Back of Store
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {backList.map((m, i) => (
                  <div key={m.id} className="w-40">
                    <FloorMachineCard
                      machine={m}
                      onSelect={() => setSelectedMachine(m)}
                      isFirst={i === 0}
                      isLast={i === backList.length - 1}
                      onMoveUp={() => moveWithin(m, "up")}
                      onMoveDown={() => moveWithin(m, "down")}
                      onZoneChange={(z) => assign(m, z)}
                      onUnplace={() => unplace(m)}
                      isOwner={isOwner}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
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
                  <FloorMachineCard
                    machine={m}
                    onSelect={() => setSelectedMachine(m)}
                    isFirst={i === 0}
                    isLast={i === outsideList.length - 1}
                    onMoveUp={() => moveWithin(m, "up")}
                    onMoveDown={() => moveWithin(m, "down")}
                    onZoneChange={(z) => assign(m, z)}
                    onUnplace={() => unplace(m)}
                    isOwner={isOwner}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-xs text-green-300">
              No equipment assigned to Outside zone
            </p>
          )}
        </div>

        {/* Other Equipment */}
        <div>
          <h2 className="font-semibold text-sm text-gray-500 uppercase tracking-wide mb-3">
            Other Equipment
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {/* Building / Facility card */}
            <Card
              className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-gray-400"
              onClick={() => setSelectedMachine(null)}
            >
              <CardContent className="p-3 flex items-center gap-3">
                <Building2 className="h-5 w-5 text-gray-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Building / Facility</p>
                  <p className="text-xs text-gray-400">General building maintenance</p>
                </div>
              </CardContent>
            </Card>

            {/* Unplaced machines */}
            {unplacedMachines.map((m) => {
              const Icon = typeIcon[m.type] ?? Wrench;
              const iconColor = typeColor[m.type] ?? "text-gray-400";
              const dot = statusDot[m.status] ?? "bg-gray-200";
              return (
                <Card
                  key={m.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedMachine(m)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${iconColor}`} />
                        <div>
                          <p className="text-sm font-semibold">{m.name}</p>
                          {m.brand && (
                            <p className="text-xs text-gray-400">
                              {m.brand} {m.model}
                            </p>
                          )}
                        </div>
                      </div>
                      <span
                        className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${dot}`}
                        title={m.status.replace(/_/g, " ")}
                      />
                    </div>
                    {m.serialNumber && (
                      <p className="text-xs text-gray-400 font-mono mb-2">
                        S/N: {m.serialNumber}
                      </p>
                    )}
                    {isOwner && (
                      <Select onValueChange={(z) => assign(m, z)}>
                        <SelectTrigger
                          className="h-6 text-xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
                          <SelectValue placeholder="Assign to floor…" />
                        </SelectTrigger>
                        <SelectContent>
                          {ZONES.map((z) => (
                            <SelectItem key={z.code} value={z.code} className="text-xs">
                              {z.code} — {z.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-6 text-xs text-gray-400 pt-2 flex-wrap">
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
          <span className="ml-4 text-gray-300">
            Click any machine to view details.
            {isOwner && " Hover floor plan cards to manage zones."}
          </span>
        </div>
      </div>

      <MachineDetailModal
        machine={selectedMachine}
        open={selectedMachine !== undefined}
        onClose={() => setSelectedMachine(undefined)}
        onMachineUpdated={handleMachineUpdated}
        onMachineCloned={handleMachineCloned}
        onPartsChanged={handlePartsChanged}
        onManualsChanged={handleManualsChanged}
        isOwner={isOwner}
        parts={parts}
        manuals={manuals}
      />
    </div>
  );
}
