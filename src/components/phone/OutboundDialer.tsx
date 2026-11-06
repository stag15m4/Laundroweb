"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
type Call = { id: string; destination: string; operatorNumber: string; status: string; error: string | null; createdAt: string };
type Data = { ready: boolean; number: string | null; contacts: { name: string; number: string }[]; calls: Call[] };
const active = ["REQUESTING", "RINGING", "AWAITING_CONFIRMATION", "CONNECTING", "DELIVERY_UNCERTAIN"];
const label = (status: string) => ({ REQUESTING: "Requesting call", RINGING: "Calling your phone", AWAITING_CONFIRMATION: "Answer and press 1", CONNECTING: "Customer call connecting / in progress", DELIVERY_UNCERTAIN: "Delivery uncertain — check your phone", COMPLETED: "Call ended", REJECTED: "Call rejected", CANCELED: "Canceled", DECLINED: "Not confirmed", NO_ANSWER: "No answer", BUSY: "Busy", FAILED: "Failed" }[status] ?? status);
export function OutboundDialer({ destination, onClose }: { destination: string | null; onClose: () => void }) {
  const [number, setNumber] = useState("");
  const [operator, setOperator] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const requestKey = useRef("");
  const refresh = useCallback(async () => {
    const response = await fetch("/api/phone/outbound", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || "Could not load call history.");
    setData(body); setOperator(previous => body.contacts.some((c: { number: string }) => c.number === previous) ? previous : body.contacts[0]?.number ?? "");
  }, []);
  useEffect(() => {
    if (destination === null) return;
    setNumber(destination); setError(""); setNotice(""); setSubmitted(false); requestKey.current = crypto.randomUUID();
    void refresh().catch(e => setError(e.message));
    const interval = setInterval(() => { if (document.visibilityState !== "hidden") void refresh().catch(e => setError(e.message)); }, 5000);
    return () => clearInterval(interval);
  }, [destination, refresh]);
  function changeNumber(value: string) { setNumber(value); requestKey.current = crypto.randomUUID(); setNotice(""); setSubmitted(false); }
  async function send(method: "POST" | "PATCH", body: object) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/phone/outbound", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not complete the request.");
      setNotice(result.message);
      if (method === "POST") setSubmitted(true);
      await refresh();
      // Keep the request key until the user edits/reopens the dialer, so a
      // repeated tap after a lost response is always the same durable call.
    } catch (e) { setError((e as Error).message); void refresh().catch(() => {}); }
    finally { setBusy(false); }
  }
  const pending = data?.calls.some(c => active.includes(c.status) && Date.now() - new Date(c.createdAt).getTime() < 3600000);
  return <Dialog open={destination !== null} onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Call from Clinton Laundry Works</DialogTitle></DialogHeader>
    <p className="text-sm text-gray-600">We call your phone first. Answer and press 1 to connect. The customer sees {data?.number ?? "the CLW number"}. Your personal number stays private.</p>
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); void send("POST", { destination: number, operatorNumber: operator, requestKey: requestKey.current }); }}>
      <div><Label htmlFor="callback-phone">Your callback phone</Label><select id="callback-phone" className="mt-1 w-full rounded-md border p-2" value={operator} disabled={busy} onChange={e => { setOperator(e.target.value); setSubmitted(false); requestKey.current = crypto.randomUUID(); }}>
        {!data?.contacts.length && <option value="">Add an on-call contact in Setup</option>}{data?.contacts.map(c => <option key={c.number} value={c.number}>{c.name} — {c.number}</option>)}
      </select></div>
      <div><Label htmlFor="customer-phone">Customer number</Label><Input id="customer-phone" type="tel" inputMode="tel" autoComplete="off" placeholder="910-555-1234" required value={number} disabled={busy} onChange={e => changeNumber(e.target.value)} /></div>
      <details><summary className="cursor-pointer text-sm text-blue-600">Dial pad</summary><div className="mt-2 grid grid-cols-3 gap-2">{"123456789".split("").concat(["+", "0", "⌫"]).map(d => <Button key={d} type="button" variant="outline" disabled={busy} onClick={() => changeNumber(d === "⌫" ? number.slice(0, -1) : number.length < 40 ? number + d : number)}>{d}</Button>)}</div></details>
      <p className="text-xs text-gray-500">US/Canada numbers only. Both connected call legs use Twilio minutes. Calls end after 30 minutes and are not recorded. Manual callbacks are available outside on-call hours.</p>
      <Button type="submit" className="w-full" disabled={busy || !data?.ready || !operator || !number.trim() || !!pending || submitted}>{busy ? "Working…" : "Call my phone, then connect"}</Button>
      {submitted && !pending && <Button type="button" variant="outline" className="w-full" onClick={() => { requestKey.current = crypto.randomUUID(); setSubmitted(false); setNotice(""); }}>Prepare another call</Button>}
      {data && !data.ready && <p className="text-sm text-amber-800">Enable the phone line and configure Twilio in Setup.</p>}
      {pending && <p className="text-sm text-gray-600">A call is already in progress. Hang up or cancel it before starting another.</p>}
    </form>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}{notice && <p role="status" className="text-sm text-blue-800">{notice}</p>}
    <details className="border-t pt-3" open={!!pending}><summary className="cursor-pointer text-sm font-medium">Recent outbound calls</summary><div className="space-y-3 pt-2">{data?.calls.length === 0 && <p className="text-sm text-gray-500">No calls placed yet.</p>}{data?.calls.map(call => <div key={call.id} className="rounded border p-2 text-sm"><p className="font-medium">{call.destination}</p><p>{label(call.status)}</p><p className="text-xs text-gray-500">{new Date(call.createdAt).toLocaleString()} · via {call.operatorNumber}</p>{call.error && <p className="text-red-700">{call.error}</p>}{active.includes(call.status) && <Button type="button" size="sm" variant="outline" className="mt-2" disabled={busy} onClick={() => void send("PATCH", { id: call.id })}>Cancel call</Button>}</div>)}</div></details>
  </DialogContent></Dialog>;
}
