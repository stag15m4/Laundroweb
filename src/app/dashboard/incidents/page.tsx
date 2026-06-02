"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";
import { Plus, AlertTriangle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

type Incident = {
  id: string;
  date: string;
  description: string;
  actionTaken: string | null;
  followUp: string | null;
  resolved: boolean;
  reportedBy: { name: string } | null;
};

const emptyForm = { date: format(new Date(), "yyyy-MM-dd"), description: "", actionTaken: "", followUp: "" };

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Incident | null>(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    fetch("/api/incidents").then((r) => r.json()).then(setIncidents);
  }, []);

  const open_ = incidents.filter((i) => !i.resolved).length;
  const resolved_ = incidents.filter((i) => i.resolved).length;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const incident = await res.json();
      setIncidents((prev) => [incident, ...prev]);
      setOpen(false);
      setForm(emptyForm);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    const res = await fetch(`/api/incidents/${editTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionTaken: form.actionTaken, followUp: form.followUp, resolved: editTarget.resolved }),
    });
    if (res.ok) {
      const updated = await res.json();
      setIncidents((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setEditTarget(null);
    }
  }

  async function toggleResolved(incident: Incident) {
    const res = await fetch(`/api/incidents/${incident.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved: !incident.resolved, actionTaken: incident.actionTaken, followUp: incident.followUp }),
    });
    if (res.ok) {
      const updated = await res.json();
      setIncidents((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    }
  }

  return (
    <div>
      <Header title="Incidents" description="Log customer incidents, machine issues, and liability events">
        <Button onClick={() => { setForm(emptyForm); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Report Incident
        </Button>
      </Header>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Report Incident</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} required placeholder="What happened? Include location, who was involved, etc." rows={4} />
            </div>
            <div className="space-y-1.5">
              <Label>Action Taken</Label>
              <Textarea value={form.actionTaken} onChange={(e) => setForm((f) => ({ ...f, actionTaken: e.target.value }))} placeholder="What was done in response?" rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Follow-up Needed</Label>
              <Input value={form.followUp} onChange={(e) => setForm((f) => ({ ...f, followUp: e.target.value }))} placeholder="Any follow-up actions?" />
            </div>
            <Button type="submit" className="w-full">Submit Report</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(v) => !v && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update Incident</DialogTitle></DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Action Taken</Label>
              <Textarea value={form.actionTaken} onChange={(e) => setForm((f) => ({ ...f, actionTaken: e.target.value }))} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Follow-up</Label>
              <Input value={form.followUp} onChange={(e) => setForm((f) => ({ ...f, followUp: e.target.value }))} />
            </div>
            <Button type="submit" className="w-full">Save</Button>
          </form>
        </DialogContent>
      </Dialog>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">Total Incidents</p>
              <p className="text-2xl font-bold mt-1">{incidents.length}</p>
            </CardContent>
          </Card>
          <Card className="border-red-200">
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">Open</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{open_}</p>
            </CardContent>
          </Card>
          <Card className="border-green-200">
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">Resolved</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{resolved_}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Incident Log
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {incidents.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">No incidents recorded.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {incidents.map((i) => (
                  <div key={i.id} className={`p-5 ${i.resolved ? "opacity-60" : ""}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-gray-400">{formatDate(i.date)}</span>
                          {i.reportedBy && <span className="text-xs text-gray-400">by {i.reportedBy.name}</span>}
                          <Badge variant={i.resolved ? "success" : "destructive"}>
                            {i.resolved ? "Resolved" : "Open"}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium text-gray-900">{i.description}</p>
                        {i.actionTaken && (
                          <p className="text-xs text-gray-500 mt-1">Action: {i.actionTaken}</p>
                        )}
                        {i.followUp && (
                          <p className="text-xs text-blue-600 mt-1">Follow-up: {i.followUp}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setForm({ date: i.date, description: i.description, actionTaken: i.actionTaken ?? "", followUp: i.followUp ?? "" }); setEditTarget(i); }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant={i.resolved ? "outline" : "success"}
                          size="sm"
                          onClick={() => toggleResolved(i)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          {i.resolved ? "Reopen" : "Resolve"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
