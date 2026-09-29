"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Camera as CameraIcon, ExternalLink, Pencil, Trash2, Plus, ChevronDown, Video } from "lucide-react";

type Camera = {
  id: string;
  name: string;
  url: string;
  notes: string | null;
};

const emptyForm = { name: "", url: "", notes: "" };

export default function CamerasPage() {
  const { data: session } = useSession();
  const isOwner = (session?.user as { role?: string } | undefined)?.role === "OWNER";

  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Camera | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/cameras")
      .then((r) => r.json())
      .then((data) => {
        setCameras(data);
        setLoaded(true);
      });
  }, []);

  function openAdd() {
    setEditTarget(null);
    setForm(emptyForm);
    setFormError("");
    setOpen(true);
  }

  function openEdit(cam: Camera) {
    setEditTarget(cam);
    setForm({ name: cam.name, url: cam.url, notes: cam.notes ?? "" });
    setFormError("");
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      const res = await fetch(editTarget ? `/api/cameras/${editTarget.id}` : "/api/cameras", {
        method: editTarget ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormError(data.error ?? "Could not save this camera.");
        return;
      }
      const saved = await res.json();
      setCameras((prev) =>
        editTarget ? prev.map((c) => (c.id === saved.id ? saved : c)) : [...prev, saved]
      );
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this camera link?")) return;
    await fetch(`/api/cameras/${id}`, { method: "DELETE" });
    setCameras((prev) => prev.filter((c) => c.id !== id));
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <Header title="Cameras" description="Quick links to your UniFi Protect live views">
        {isOwner && (
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Add Camera
          </Button>
        )}
      </Header>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Camera" : "Add Camera"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Front Door, Register, Back Lot…"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Link</Label>
              <Input
                type="url"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://…"
                required
              />
              <p className="text-xs text-gray-400">
                Best option: in UniFi Protect, open the camera → Settings → Share
                Livestream, and paste that link here. It works for anyone who has
                it, with no Ubiquiti login required. The full Protect dashboard
                link also works for the Open button — it just asks whoever
                clicks it to sign in first.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Where this camera is aimed, anything worth remembering…"
              />
            </div>
            {formError && (
              <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{formError}</p>
            )}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Saving…" : editTarget ? "Save Changes" : "Add Camera"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <div className="p-6 space-y-4">
        {loaded && cameras.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CameraIcon className="h-12 w-12 text-gray-200 mb-4" />
            <p className="text-gray-400 text-sm max-w-sm">
              {isOwner
                ? "No cameras added yet. In UniFi Protect, open a camera → Settings → Share Livestream to get a link, then add it here."
                : "No cameras have been added yet."}
            </p>
          </div>
        ) : (
          cameras.map((cam) => (
            <Card key={cam.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <CameraIcon className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{cam.name}</p>
                      {cam.notes && <p className="text-sm text-gray-500 mt-0.5">{cam.notes}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <a href={cam.url} target="_blank" rel="noopener noreferrer">
                      <Button size="sm">
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        Open
                      </Button>
                    </a>
                    {isOwner && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(cam)} title="Edit">
                          <Pencil className="h-4 w-4 text-gray-400" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(cam.id)} title="Remove">
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => toggleExpanded(cam.id)}
                  className="mt-3 flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600"
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${expanded.has(cam.id) ? "rotate-180" : ""}`}
                  />
                  {expanded.has(cam.id) ? "Hide inline view" : "Try viewing it here"}
                </button>

                {expanded.has(cam.id) && (
                  <div className="mt-3">
                    <div className="relative rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                      <iframe
                        src={cam.url}
                        className="w-full"
                        style={{ height: "360px" }}
                        title={cam.name}
                        // These links are ones the store owner deliberately entered
                        // (their own security system), not arbitrary third-party
                        // content, so the usual concern about allow-scripts plus
                        // allow-same-origin letting a page escape its sandbox
                        // doesn't apply here the way it would for untrusted input.
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                      />
                    </div>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
                      <Video className="h-3 w-3 flex-shrink-0" />
                      Some UniFi links refuse to load inside another page for
                      security reasons. If this stays blank or loops back to a
                      login screen, use Open above instead — that always works.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
