"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Phone, Mail, Pencil, Trash2, Users } from "lucide-react";

type Contact = {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  role: string;
  notes: string | null;
};

const emptyForm = { name: "", company: "", phone: "", email: "", role: "", notes: "" };

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Contact | null>(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    fetch("/api/contacts").then((r) => r.json()).then(setContacts);
  }, []);

  function openAdd() {
    setEditTarget(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(c: Contact) {
    setEditTarget(c);
    setForm({ name: c.name, company: c.company ?? "", phone: c.phone ?? "", email: c.email ?? "", role: c.role, notes: c.notes ?? "" });
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editTarget) {
      const res = await fetch(`/api/contacts/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const updated = await res.json();
        setContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      }
    } else {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const created = await res.json();
        setContacts((prev) => [...prev, created]);
      }
    }
    setOpen(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this contact?")) return;
    await fetch(`/api/contacts/${id}`, { method: "DELETE" });
    setContacts((prev) => prev.filter((c) => c.id !== id));
  }

  const byRole = contacts.reduce((acc, c) => {
    if (!acc[c.role]) acc[c.role] = [];
    acc[c.role].push(c);
    return acc;
  }, {} as Record<string, Contact[]>);

  return (
    <div>
      <Header title="Contacts" description="Vendors, repair techs, plumbers, and service providers">
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Add Contact
        </Button>
      </Header>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editTarget ? "Edit Contact" : "Add Contact"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Company</Label>
                <Input value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Role / Trade</Label>
                <Input value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} placeholder="Plumber, Equipment Tech, etc." required />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
            </div>
            <Button type="submit" className="w-full">{editTarget ? "Save" : "Add Contact"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <div className="p-6 space-y-6">
        {Object.keys(byRole).length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">No contacts yet. Add your first vendor or service contact.</p>
        ) : (
          Object.entries(byRole).map(([role, contacts]) => (
            <div key={role}>
              <h2 className="font-semibold text-sm text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Users className="h-3.5 w-3.5" />
                {role}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {contacts.map((c) => (
                  <Card key={c.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-sm">{c.name}</p>
                          {c.company && <p className="text-xs text-gray-400">{c.company}</p>}
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {c.phone && (
                          <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline">
                            <Phone className="h-3 w-3" />
                            {c.phone}
                          </a>
                        )}
                        {c.email && (
                          <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline">
                            <Mail className="h-3 w-3" />
                            {c.email}
                          </a>
                        )}
                        {c.notes && <p className="text-xs text-gray-400 mt-2 italic">{c.notes}</p>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
