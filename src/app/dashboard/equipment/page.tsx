"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { Plus, Pencil, WashingMachine, Wind, AlertTriangle, ShoppingCart, Wrench, Eye, EyeOff } from "lucide-react";

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
  _count: { maintenanceLogs: number };
};

const statusColors: Record<string, "success" | "destructive" | "warning" | "secondary"> = {
  OPERATIONAL: "success",
  OUT_OF_ORDER: "destructive",
  NEEDS_SERVICE: "warning",
  RETIRED: "secondary",
};

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

const emptyForm = {
  name: "", type: "WASHER", brand: "", model: "", serialNumber: "",
  location: "", installDate: "", warrantyExpiry: "", status: "OPERATIONAL",
  notes: "", keyCode: "",
};

function KeyCodeField({ value }: { value: string | null }) {
  const [visible, setVisible] = useState(false);
  if (!value) return null;
  return (
    <div className="flex items-center gap-1 text-xs text-gray-500">
      <span className="font-medium">Key Code:</span>
      <span className="font-mono">{visible ? value : "••••••"}</span>
      <button onClick={() => setVisible((v) => !v)} className="text-gray-400 hover:text-gray-600">
        {visible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      </button>
    </div>
  );
}

export default function EquipmentPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Machine | null>(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    fetch("/api/equipment").then((r) => r.json()).then(setMachines);
  }, []);

  function openAdd() {
    setEditTarget(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(m: Machine) {
    setEditTarget(m);
    setForm({
      name: m.name,
      type: m.type,
      brand: m.brand ?? "",
      model: m.model ?? "",
      serialNumber: m.serialNumber ?? "",
      location: m.location ?? "",
      installDate: m.installDate ? m.installDate.slice(0, 10) : "",
      warrantyExpiry: m.warrantyExpiry ? m.warrantyExpiry.slice(0, 10) : "",
      status: m.status,
      notes: m.notes ?? "",
      keyCode: m.keyCode ?? "",
    });
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editTarget) {
      const res = await fetch(`/api/equipment/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const updated = await res.json();
        setMachines((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
      }
    } else {
      const res = await fetch("/api/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const created = await res.json();
        setMachines((prev) => [...prev, { ...created, _count: { maintenanceLogs: 0 } }]);
      }
    }
    setOpen(false);
  }

  const grouped: Record<string, Machine[]> = {
    WASHER: machines.filter((m) => m.type === "WASHER" && m.status !== "RETIRED"),
    DRYER: machines.filter((m) => m.type === "DRYER" && m.status !== "RETIRED"),
    VENDING: machines.filter((m) => m.type === "VENDING" && m.status !== "RETIRED"),
    OTHER: machines.filter((m) => m.type === "OTHER" && m.status !== "RETIRED"),
  };

  const typeLabels: Record<string, string> = {
    WASHER: "Washers",
    DRYER: "Dryers",
    VENDING: "Vending Machines",
    OTHER: "Other Equipment",
  };

  function MachineCard({ m }: { m: Machine }) {
    const Icon = typeIcon[m.type] ?? Wrench;
    const iconColor = typeColor[m.type] ?? "text-gray-400";
    return (
      <Card className={m.status === "OUT_OF_ORDER" ? "border-red-200" : m.status === "NEEDS_SERVICE" ? "border-yellow-200" : ""}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <Icon className={`h-5 w-5 ${iconColor}`} />
              <div>
                <p className="font-semibold text-sm">{m.name}</p>
                {m.brand && <p className="text-xs text-gray-400">{m.brand} {m.model}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={statusColors[m.status]}>{m.status.replace("_", " ")}</Badge>
              <Button variant="ghost" size="icon" onClick={() => openEdit(m)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="space-y-1 text-xs text-gray-500">
            {m.serialNumber && <p>S/N: <span className="font-mono text-gray-700">{m.serialNumber}</span></p>}
            {m.location && <p>Location: {m.location}</p>}
            {m.installDate && <p>Installed: {formatDate(m.installDate)}</p>}
            {m.warrantyExpiry && (
              <p className={new Date(m.warrantyExpiry) < new Date() ? "text-red-500" : ""}>
                Warranty: {formatDate(m.warrantyExpiry)}
                {new Date(m.warrantyExpiry) < new Date() && " (expired)"}
              </p>
            )}
            <p>Maintenance logs: {m._count.maintenanceLogs}</p>
            {m.cycleCount > 0 && <p>Cycles: {m.cycleCount.toLocaleString()}</p>}
            <KeyCodeField value={m.keyCode} />
          </div>
          {m.notes && <p className="mt-2 text-xs text-gray-400 italic">{m.notes}</p>}
        </CardContent>
      </Card>
    );
  }

  const FormField = ({ label, id, children }: { label: string; id?: string; children: React.ReactNode }) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );

  return (
    <div>
      <Header title="Equipment" description="Machines, serial numbers, and status">
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Add Machine
        </Button>
      </Header>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Machine" : "Add Machine"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <FormField label="Unit" id="name">
              <Input id="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Washer 1" required />
            </FormField>
            <FormField label="Type">
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="WASHER">Washer</SelectItem>
                  <SelectItem value="DRYER">Dryer</SelectItem>
                  <SelectItem value="VENDING">Vending Machine</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Brand">
              <Input value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} />
            </FormField>
            <FormField label="Model">
              <Input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} />
            </FormField>
            <FormField label="Serial Number">
              <Input value={form.serialNumber} onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))} placeholder="e.g. W-001" />
            </FormField>
            <FormField label="Key Code">
              <Input value={form.keyCode} onChange={(e) => setForm((f) => ({ ...f, keyCode: e.target.value }))} placeholder="Coin box or panel access code" />
            </FormField>
            <FormField label="Location">
              <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="e.g. Row A, Position 1" />
            </FormField>
            <FormField label="Status">
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPERATIONAL">Operational</SelectItem>
                  <SelectItem value="NEEDS_SERVICE">Needs Service</SelectItem>
                  <SelectItem value="OUT_OF_ORDER">Out of Order</SelectItem>
                  <SelectItem value="RETIRED">Retired</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Install Date">
              <Input type="date" value={form.installDate} onChange={(e) => setForm((f) => ({ ...f, installDate: e.target.value }))} />
            </FormField>
            <FormField label="Warranty Expiry">
              <Input type="date" value={form.warrantyExpiry} onChange={(e) => setForm((f) => ({ ...f, warrantyExpiry: e.target.value }))} />
            </FormField>
            <FormField label="Notes">
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </FormField>
            <div className="col-span-2">
              <Button type="submit" className="w-full">{editTarget ? "Save Changes" : "Add Machine"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="p-6 space-y-6">
        {machines.filter((m) => m.status === "OUT_OF_ORDER").length > 0 && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {machines.filter((m) => m.status === "OUT_OF_ORDER").length} machine(s) currently out of order.
          </div>
        )}

        {Object.entries(grouped).map(([type, list]) =>
          list.length > 0 ? (
            <div key={type}>
              <h2 className="font-semibold text-sm text-gray-500 uppercase tracking-wide mb-3">{typeLabels[type]}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {list.map((m) => <MachineCard key={m.id} m={m} />)}
              </div>
            </div>
          ) : null
        )}

        {machines.filter((m) => m.status !== "RETIRED").length === 0 && (
          <p className="text-sm text-gray-400 text-center py-12">No machines yet. Add your first machine above.</p>
        )}
      </div>
    </div>
  );
}
