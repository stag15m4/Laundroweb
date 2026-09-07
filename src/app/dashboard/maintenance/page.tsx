"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { PageTabs } from "@/components/layout/PageTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, CheckCircle2, Clock, AlertTriangle, Wrench, X, Copy } from "lucide-react";
import { formatDate } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type MachineSummary = { id: string; name: string; type: string };

type Schedule = {
  id: string;
  title: string;
  description: string | null;
  machineId: string | null;
  machine: MachineSummary | null;
  machineType: string | null;
  isBuilding: boolean;
  frequencyDays: number;
  lastCompletedAt: string | null;
  nextDueAt: string | null;
  notes: string | null;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const FREQUENCIES = [
  { label: "Weekly", days: 7 },
  { label: "Bi-weekly", days: 14 },
  { label: "Monthly", days: 30 },
  { label: "Quarterly", days: 90 },
  { label: "Semi-annual", days: 180 },
  { label: "Annual", days: 365 },
];

const TYPE_LABELS: Record<string, string> = {
  WASHER: "All Washers",
  DRYER: "All Dryers",
  VENDING: "All Vending",
  WATER_HEATER: "All Water Heaters",
  AIR_CONDITIONER: "All AC Units",
  OTHER: "Other Equipment",
};

const emptyForm = {
  title: "",
  description: "",
  scope: "building" as "building" | "type" | "machine",
  machineId: "",
  machineType: "WASHER",
  frequencyDays: "30",
  notes: "",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

function freqLabel(days: number): string {
  return FREQUENCIES.find((f) => f.days === days)?.label ?? `Every ${days}d`;
}

function scopeLabel(s: Schedule): string {
  if (s.isBuilding) return "Building / Facility";
  if (s.machine) return s.machine.name;
  if (s.machineType) return TYPE_LABELS[s.machineType] ?? s.machineType;
  return "—";
}

// ── ScheduleCard ───────────────────────────────────────────────────────────────

function ScheduleCard({
  schedule,
  isOwner,
  onComplete,
  onDelete,
  onCopy,
}: {
  schedule: Schedule;
  isOwner: boolean;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onCopy: (s: Schedule) => void;
}) {
  const [completing, setCompleting] = useState(false);
  const days = daysUntil(schedule.nextDueAt);
  const overdue = days !== null && days < 0;
  const dueSoon = days !== null && days >= 0 && days <= 7;

  async function handleComplete() {
    setCompleting(true);
    await onComplete(schedule.id);
    setCompleting(false);
  }

  return (
    <div className={`flex items-start gap-4 p-4 rounded-lg border bg-white ${overdue ? "border-red-200" : dueSoon ? "border-yellow-200" : "border-gray-200"}`}>
      <div className={`mt-0.5 flex-shrink-0 ${overdue ? "text-red-500" : dueSoon ? "text-yellow-500" : "text-gray-300"}`}>
        {overdue ? <AlertTriangle className="h-5 w-5" /> : dueSoon ? <Clock className="h-5 w-5" /> : <Wrench className="h-5 w-5" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <p className="font-semibold text-gray-900 text-sm">{schedule.title}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {scopeLabel(schedule)} · {freqLabel(schedule.frequencyDays)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {overdue && (
              <Badge variant="destructive" className="text-xs">
                {Math.abs(days!)}d overdue
              </Badge>
            )}
            {dueSoon && !overdue && (
              <Badge variant="warning" className="text-xs">
                Due in {days}d
              </Badge>
            )}
            {!overdue && !dueSoon && days !== null && (
              <span className="text-xs text-gray-400">Due {formatDate(schedule.nextDueAt!)}</span>
            )}
          </div>
        </div>

        {schedule.description && (
          <p className="text-xs text-gray-600 mt-1">{schedule.description}</p>
        )}

        <div className="flex items-center gap-3 mt-2">
          {schedule.lastCompletedAt && (
            <span className="text-xs text-gray-400">
              Last done: {formatDate(schedule.lastCompletedAt)}
            </span>
          )}
          {!schedule.lastCompletedAt && (
            <span className="text-xs text-gray-400 italic">Never completed</span>
          )}
        </div>
      </div>

      {isOwner && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button
            size="sm"
            variant={overdue || dueSoon ? "default" : "outline"}
            disabled={completing}
            onClick={handleComplete}
            className="gap-1.5"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {completing ? "Saving…" : "Done"}
          </Button>
          <button
            onClick={() => onCopy(schedule)}
            className="p-1.5 text-gray-300 hover:text-blue-400 transition-colors"
            title="Copy task"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(schedule.id)}
            className="p-1.5 text-gray-300 hover:text-red-400 transition-colors"
            title="Remove task"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── MaintenancePage ────────────────────────────────────────────────────────────

export default function MaintenancePage() {
  const { data: session } = useSession();
  const isOwner = (session?.user as { role?: string })?.role === "OWNER";

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [machines, setMachines] = useState<MachineSummary[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState("Add Maintenance Task");
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    fetch("/api/maintenance/schedule").then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) setSchedules(d);
    });
    fetch("/api/equipment").then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) setMachines(d.filter((m: MachineSummary & { status: string }) => m.status !== "RETIRED"));
    });
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {
      title: form.title,
      description: form.description || null,
      frequencyDays: Number(form.frequencyDays),
      notes: form.notes || null,
      isBuilding: form.scope === "building",
      machineType: form.scope === "type" ? form.machineType : null,
      machineId: form.scope === "machine" ? form.machineId : null,
    };
    const res = await fetch("/api/maintenance/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const created = await res.json();
      setSchedules((prev) => [...prev, created].sort((a, b) =>
        new Date(a.nextDueAt ?? "9999").getTime() - new Date(b.nextDueAt ?? "9999").getTime()
      ));
      setAddOpen(false);
      setForm(emptyForm);
      setDialogTitle("Add Maintenance Task");
    }
  }

  async function handleComplete(id: string) {
    const res = await fetch(`/api/maintenance/schedule/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _action: "complete" }),
    });
    if (res.ok) {
      const updated = await res.json();
      setSchedules((prev) =>
        prev.map((s) => (s.id === id ? updated : s))
            .sort((a, b) => new Date(a.nextDueAt ?? "9999").getTime() - new Date(b.nextDueAt ?? "9999").getTime())
      );
    }
  }

  function handleCopy(s: Schedule) {
    const scope = s.machineId ? "machine" : s.machineType ? "type" : "building";
    setForm({
      title: s.title,
      description: s.description ?? "",
      scope,
      machineId: s.machineId ?? "",
      machineType: s.machineType ?? "WASHER",
      frequencyDays: String(s.frequencyDays),
      notes: s.notes ?? "",
    });
    setDialogTitle("Copy Task");
    setAddOpen(true);
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/maintenance/schedule/${id}`, { method: "DELETE" });
    if (res.ok) setSchedules((prev) => prev.filter((s) => s.id !== id));
  }

  const overdue = schedules.filter((s) => daysUntil(s.nextDueAt) !== null && daysUntil(s.nextDueAt)! < 0);
  const dueSoon = schedules.filter((s) => { const d = daysUntil(s.nextDueAt); return d !== null && d >= 0 && d <= 14; });
  const upcoming = schedules.filter((s) => { const d = daysUntil(s.nextDueAt); return d === null || d > 14; });

  function Section({ title, items, accent }: { title: string; items: Schedule[]; accent?: string }) {
    if (items.length === 0) return null;
    return (
      <div className="space-y-2">
        <h3 className={`text-xs font-bold uppercase tracking-widest ${accent ?? "text-gray-500"}`}>{title}</h3>
        {items.map((s) => (
          <ScheduleCard key={s.id} schedule={s} isOwner={isOwner} onComplete={handleComplete} onDelete={handleDelete} onCopy={handleCopy} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <Header title="Maintenance Schedule" description="Recurring preventive maintenance tasks">
        {isOwner && (
          <Button onClick={() => { setForm(emptyForm); setDialogTitle("Add Maintenance Task"); setAddOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Add Task
          </Button>
        )}
      </Header>

      <PageTabs tabs={[
        { label: "Machines", href: "/dashboard/equipment" },
        { label: "Parts", href: "/dashboard/parts" },
        { label: "Maintenance", href: "/dashboard/maintenance" },
        { label: "Pricing", href: "/dashboard/pricing" },
      ]} />

      <div className="p-6 space-y-8 max-w-3xl">
        {schedules.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-16">
            No maintenance tasks yet.{isOwner ? " Click Add Task to get started." : ""}
          </p>
        )}

        <Section title={`Overdue — ${overdue.length}`} items={overdue} accent="text-red-600" />
        <Section title={`Due in the next 2 weeks — ${dueSoon.length}`} items={dueSoon} accent="text-yellow-600" />
        <Section title="Upcoming" items={upcoming} accent="text-gray-500" />
      </div>

      {/* Add task dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setForm(emptyForm); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{dialogTitle}</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Task</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Door gasket cleaning"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Any notes or instructions"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Applies to</Label>
                <Select value={form.scope} onValueChange={(v: "building" | "type" | "machine") => setForm((f) => ({ ...f, scope: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="building">Building / Facility</SelectItem>
                    <SelectItem value="type">All machines of a type</SelectItem>
                    <SelectItem value="machine">Specific machine</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Frequency</Label>
                <Select value={form.frequencyDays} onValueChange={(v) => setForm((f) => ({ ...f, frequencyDays: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => (
                      <SelectItem key={f.days} value={String(f.days)}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.scope === "type" && (
              <div className="space-y-1.5">
                <Label>Machine type</Label>
                <Select value={form.machineType} onValueChange={(v) => setForm((f) => ({ ...f, machineType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.scope === "machine" && (
              <div className="space-y-1.5">
                <Label>Machine</Label>
                <Select value={form.machineId} onValueChange={(v) => setForm((f) => ({ ...f, machineId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select a machine…" /></SelectTrigger>
                  <SelectContent>
                    {machines.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button type="submit" className="w-full">Add Task</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
