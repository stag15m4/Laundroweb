"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Wrench, Building2, Calendar } from "lucide-react";
import { format } from "date-fns";

type MaintenanceLog = {
  id: string;
  machineId: string | null;
  machine: { id: string; name: string; type: string } | null;
  date: string;
  type: string;
  description: string;
  cost: string | null;
  technician: string | null;
  vendor: string | null;
  nextDueDate: string | null;
  status: string;
};

type Machine = { id: string; name: string; type: string };

const statusVariants: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  COMPLETED: "success",
  IN_PROGRESS: "warning",
  SCHEDULED: "secondary",
  OVERDUE: "destructive",
};

const maintenanceTypes = [
  "Dryer Vent Cleaning", "Belt Replacement", "Drum Bearing", "Door Seal", "Pump Repair",
  "Control Board", "Heating Element", "Motor Service", "Coin Mechanism", "General Service",
  "HVAC Service", "Pest Control", "Plumbing", "Electrical", "Roof/Building", "Other",
];

const emptyForm = {
  machineId: "", date: format(new Date(), "yyyy-MM-dd"), type: "",
  description: "", cost: "", technician: "", vendor: "", nextDueDate: "", status: "COMPLETED",
};

export default function MaintenancePage() {
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    fetch("/api/maintenance").then((r) => r.json()).then(setLogs);
    fetch("/api/equipment").then((r) => r.json()).then(setMachines);
  }, []);

  const upcoming = logs.filter((l) => l.nextDueDate && new Date(l.nextDueDate) > new Date()).slice(0, 5);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/maintenance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const log = await res.json();
      setLogs((prev) => [log, ...prev]);
      setOpen(false);
      setForm(emptyForm);
    }
  }

  async function toggleStatus(log: MaintenanceLog) {
    const next = log.status === "COMPLETED" ? "SCHEDULED" : "COMPLETED";
    const res = await fetch(`/api/maintenance/${log.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) {
      const updated = await res.json();
      setLogs((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    }
  }

  return (
    <div>
      <Header title="Maintenance" description="Machine and building maintenance logs">
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Log Service
        </Button>
      </Header>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Log Maintenance</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Machine (leave blank for building)</Label>
              <Select value={form.machineId} onValueChange={(v) => setForm((f) => ({ ...f, machineId: v }))}>
                <SelectTrigger><SelectValue placeholder="Building / General" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Building / General</SelectItem>
                  {machines.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name} ({m.type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {maintenanceTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} required placeholder="What was done or needs to be done?" />
            </div>
            <div className="space-y-1.5">
              <Label>Cost ($)</Label>
              <Input type="number" step="0.01" value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Technician / Company</Label>
              <Input value={form.technician} onChange={(e) => setForm((f) => ({ ...f, technician: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Vendor</Label>
              <Input value={form.vendor} onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Next Due Date</Label>
              <Input type="date" value={form.nextDueDate} onChange={(e) => setForm((f) => ({ ...f, nextDueDate: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Button type="submit" className="w-full">Save Log</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="p-6 space-y-6">
        {upcoming.length > 0 && (
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-blue-800">
                <Calendar className="h-4 w-4" />
                Upcoming Service
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {upcoming.map((l) => (
                  <div key={l.id} className="flex items-center justify-between text-sm">
                    <span className="text-blue-900">{l.machine?.name ?? "Building"} — {l.type}</span>
                    <span className="text-blue-700 font-medium">{formatDate(l.nextDueDate)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Maintenance History
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {logs.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">No maintenance logs yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500 text-xs">
                    <th className="text-left px-6 py-3">Date</th>
                    <th className="text-left px-6 py-3">Machine / Area</th>
                    <th className="text-left px-6 py-3">Type</th>
                    <th className="text-left px-6 py-3">Description</th>
                    <th className="text-left px-6 py-3">Cost</th>
                    <th className="text-left px-6 py-3">Technician</th>
                    <th className="text-left px-6 py-3">Next Due</th>
                    <th className="text-left px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-6 py-3 whitespace-nowrap">{formatDate(l.date)}</td>
                      <td className="px-6 py-3">
                        <span className="flex items-center gap-1">
                          {l.machine ? <Wrench className="h-3 w-3 text-blue-400" /> : <Building2 className="h-3 w-3 text-gray-400" />}
                          {l.machine?.name ?? "Building"}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-gray-600">{l.type}</td>
                      <td className="px-6 py-3 text-gray-500 max-w-xs truncate">{l.description}</td>
                      <td className="px-6 py-3">{l.cost ? formatCurrency(l.cost) : "—"}</td>
                      <td className="px-6 py-3 text-gray-500">{l.technician ?? "—"}</td>
                      <td className="px-6 py-3 text-gray-500">{l.nextDueDate ? formatDate(l.nextDueDate) : "—"}</td>
                      <td className="px-6 py-3">
                        <button onClick={() => toggleStatus(l)}>
                          <Badge variant={statusVariants[l.status]}>{l.status.replace("_", " ")}</Badge>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
