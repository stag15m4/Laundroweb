"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TRAFFIC_LEVELS } from "@/lib/traffic-activity";

type Alarm = { name: string; lastReceivedAt: string; level: typeof TRAFFIC_LEVELS[number] };
type Activity = { configured: boolean; alarms: Alarm[] };
const storageKey = "laundroweb-entrance-alarm";
export function TrafficActivityMeter() {
  const [data, setData] = useState<Activity | null>(null);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    try { setSelected(localStorage.getItem(storageKey) ?? ""); } catch { /* Storage may be disabled. */ }
    let active = true;
    async function refresh() {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch("/api/cameras/activity", { cache: "no-store" });
        if (!response.ok) throw new Error();
        const body: Activity = await response.json();
        if (active) { setData(body); setError(false); }
      } catch { if (active) setError(true); }
    }
    void refresh();
    const interval = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { active = false; clearInterval(interval); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  const alarm = data?.alarms.find(a => a.name === selected);
  const level = !error && data?.configured ? alarm?.level : undefined;
  return <Card><CardContent className="p-5 space-y-3">
    <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">How busy is it?</h2><span className="text-xl font-bold">{level ?? (error ? "Unavailable" : !data ? "Loading…" : "Setup needed")}</span></div>
    <div className="grid grid-cols-4 gap-2" aria-label={level ? `Entrance activity: ${level}` : "Entrance activity unavailable"}>
      {TRAFFIC_LEVELS.map((label, index) => <div key={label} className="text-center text-xs"><div className={`mb-1 h-3 rounded-full ${level && index <= TRAFFIC_LEVELS.indexOf(level) ? ["bg-slate-400", "bg-blue-400", "bg-amber-400", "bg-orange-500"][index] : "bg-gray-100"}`} /><span className={label === level ? "font-bold text-gray-900" : "text-gray-500"}>{label}</span></div>)}
    </div>
    <p className="text-xs text-gray-500">Entrance activity over the past hour. Repeat trips contribute; this does not show how many people are inside. Bands are provisional.</p>
    {level === "Dead" && <p className="text-xs text-gray-500">No recent entrance signals. A disarmed alarm or interrupted connection can also look quiet.</p>}
    {error && <p role="alert" className="text-sm text-red-600">Could not refresh activity. Previous readings are hidden until the connection recovers.</p>}
    <details open={!!data && !alarm} className="text-sm"><summary className="cursor-pointer text-blue-600">Entrance alarm settings</summary>
      <label className="mt-2 block">Choose only the entrance crossing alarm
        <select className="mt-1 w-full rounded border p-2" value={selected} onChange={e => { setSelected(e.target.value); try { localStorage.setItem(storageKey, e.target.value); } catch { /* Keep selection for this visit. */ } }}>
          <option value="">Select an alarm…</option>
          {selected && !alarm && <option value={selected}>{selected} — no recent data</option>}
          {data?.alarms.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
        </select>
      </label>
      <p className="mt-2 text-xs text-gray-500">Saved on this browser. Known-face and other security alarms are excluded by choosing a separate entrance alarm.</p>
      {alarm && <p className="mt-1 text-xs text-gray-500">Last signal: {new Date(alarm.lastReceivedAt).toLocaleString("en-US", { timeZone: "America/New_York" })} Eastern.</p>}
      {data && !data.configured && <p className="mt-2">Protect receiver is not configured.</p>}
      {data?.alarms.length === 0 && <p className="mt-2">No alarm data in the past seven days. Check that the entrance alarm is armed and sending webhooks.</p>}
    </details>
  </CardContent></Card>;
}
