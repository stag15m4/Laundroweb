"use client";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
export type CallNote = { id: string; authorName: string; body: string; createdAt: string };
export function PhoneCallNotes({ messageId, customerName, notes, onSaved }: {
  messageId: string; customerName: string | null; notes: CallNote[]; onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(customerName || "");
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { if (!dirty) setName(customerName || ""); }, [customerName, dirty]);
  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/phone/messages/${messageId}`, { method: "PATCH",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-details", customerName: name, note }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not save call notes.");
      setNote("");
      await onSaved();
      setDirty(false); setNotice("Saved.");
      window.dispatchEvent(new Event("phone-inbox-changed"));
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save call notes."); }
    finally { setBusy(false); }
  }
  return <details className="rounded-lg border border-gray-200 p-3">
    <summary className="cursor-pointer text-sm font-medium text-gray-700">Customer &amp; action notes{notes.length ? ` (${notes.length})` : ""}</summary>
    <div className="mt-3 space-y-3">
      <label className="block space-y-1 text-sm"><span className="font-medium">Customer name</span>
        <Input maxLength={120} value={name} placeholder="Customer name, if known" disabled={busy} onChange={event => { setName(event.target.value); setDirty(true); setNotice(""); }} />
      </label>
      {notes.length > 0 && <ol className="space-y-2" aria-label="Call note history">{notes.map(item => <li key={item.id} className="rounded-lg bg-gray-50 p-3">
        <p className="whitespace-pre-wrap break-words text-sm">{item.body}</p>
        <p className="mt-1 text-xs text-gray-500">{item.authorName} · {new Date(item.createdAt).toLocaleString()}</p>
      </li>)}</ol>}
      <label className="block space-y-1 text-sm"><span className="font-medium">Add an action note</span>
        <Textarea rows={3} maxLength={5000} value={note} placeholder="What was corrected, refunded, or followed up?" disabled={busy} onChange={event => { setNote(event.target.value); setNotice(""); }} />
      </label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
      <Button variant="outline" disabled={busy || (!dirty && !note.trim())} onClick={save}>{busy ? "Saving…" : "Save details / add note"}</Button>
    </div>
  </details>;
}
