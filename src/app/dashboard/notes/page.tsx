"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";
import { Plus, Pin, Trash2, BookOpen } from "lucide-react";

type Note = {
  id: string;
  content: string;
  category: string;
  isPinned: boolean;
  createdAt: string;
  author: { name: string } | null;
};

const categories = ["general", "shift", "staff", "maintenance", "customer", "reminder"];

const categoryColors: Record<string, string> = {
  general: "bg-gray-100 text-gray-700",
  shift: "bg-blue-100 text-blue-700",
  staff: "bg-purple-100 text-purple-700",
  maintenance: "bg-orange-100 text-orange-700",
  customer: "bg-green-100 text-green-700",
  reminder: "bg-yellow-100 text-yellow-800",
};

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ content: "", category: "general" });
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetch("/api/notes").then((r) => r.json()).then(setNotes);
  }, []);

  const filtered = filter === "all" ? notes : notes.filter((n) => n.category === filter);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const note = await res.json();
      setNotes((prev) => [note, ...prev]);
      setOpen(false);
      setForm({ content: "", category: "general" });
    }
  }

  async function togglePin(note: Note) {
    const res = await fetch(`/api/notes/${note.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: note.content, category: note.category, isPinned: !note.isPinned }),
    });
    if (res.ok) {
      const updated = await res.json();
      setNotes((prev) => {
        const newNotes = prev.map((n) => (n.id === updated.id ? updated : n));
        return [...newNotes.filter((n) => n.isPinned), ...newNotes.filter((n) => !n.isPinned)];
      });
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this note?")) return;
    await fetch(`/api/notes/${id}`, { method: "DELETE" });
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <div>
      <Header title="Notes" description="Shift logs, reminders, and staff communications">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Filter" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Note
        </Button>
      </Header>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Note</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{categories.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                required
                rows={5}
                placeholder="Write your note here..."
              />
            </div>
            <Button type="submit" className="w-full">Save Note</Button>
          </form>
        </DialogContent>
      </Dialog>

      <div className="p-6">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="h-8 w-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400">No notes yet. Add one above.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((n) => (
              <Card key={n.id} className={n.isPinned ? "border-yellow-300 shadow-md" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${categoryColors[n.category] ?? "bg-gray-100 text-gray-700"}`}>
                      {n.category}
                    </span>
                    <div className="flex gap-1">
                      <button onClick={() => togglePin(n)} title={n.isPinned ? "Unpin" : "Pin"}>
                        <Pin className={`h-3.5 w-3.5 ${n.isPinned ? "text-yellow-500 fill-yellow-400" : "text-gray-300"}`} />
                      </button>
                      <button onClick={() => handleDelete(n.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-gray-300 hover:text-red-400" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{n.content}</p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-gray-400">{formatDate(n.createdAt)}</span>
                    {n.author && <span className="text-xs text-gray-400">{n.author.name}</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
