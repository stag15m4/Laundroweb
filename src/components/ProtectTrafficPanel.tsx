"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type TestEvent = {
  id: string;
  alarmName: string;
  reportedAt: string;
  receivedAt: string;
  payload: unknown;
};

const displayTime = (value: string) => new Date(value).toLocaleString("en-US", { timeZone: "America/New_York" });

export function ProtectTrafficPanel() {
  const [data, setData] = useState<{ configured: boolean; events: TestEvent[] } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/cameras/traffic", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Could not load test events.");
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load test events.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    setUrl(`${window.location.origin}/api/integrations/protect`);
    void refresh();
  }, []);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">Foot traffic — testing</h2>
            <p className="text-sm text-gray-500">Verify entrance crossings before enabling daily visitor totals.</p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>{loading ? "Loading…" : "Refresh"}</Button>
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error} Previously loaded events may be out of date.</p>}
        {data && <p className="text-sm">{data.configured ? "Receiver credential configured. A test crossing is needed to verify delivery." : "Setup needed: configure the dedicated Protect receiver token on the server."}</p>}
        <details className="text-sm">
          <summary className="cursor-pointer text-blue-600">Connection settings</summary>
          <div className="mt-2 space-y-2">
            <p>Protect alarm: Line Crossing → FOH Rear-Facing → Custom Webhook → Post.</p>
            <p>Delivery URL: <code className="break-all">{url}</code></p>
            <p>Header: <code>X-Protect-Token</code>, with the dedicated secret configured on the server. The secret is never displayed here.</p>
            <p>Use the entrance line with Person selected. Direction, group handling, retries and alarm suppression still need testing.</p>
          </div>
        </details>
        <p className="text-xs text-gray-500">Latest 20 test events received within 7 days. Times are Eastern. These events are not entry totals or unique visitors; a webhook can combine or repeat detections. Older records are removed on the next accepted delivery.</p>
        {data?.events.length === 0 && <p className="text-sm text-gray-500">No test events received in the last 7 days.</p>}
        {data?.events.map(event => (
          <details key={event.id} className="border-t pt-2 text-sm">
            <summary className="cursor-pointer">{event.alarmName} · received {displayTime(event.receivedAt)}</summary>
            <p className="mt-2 text-xs text-gray-500">Protect timestamp: {displayTime(event.reportedAt)}</p>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-gray-50 p-3 text-xs">{JSON.stringify(event.payload, null, 2)}</pre>
          </details>
        ))}
      </CardContent>
    </Card>
  );
}
