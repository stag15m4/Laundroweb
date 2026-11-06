"use client";
import { useCallback, useEffect, useState } from "react";
import { PhoneCallNotes, type CallNote } from "@/components/phone/PhoneCallNotes";
import { useSession } from "next-auth/react";
import {
  Phone,
  AlertTriangle,
  Voicemail,
  Settings,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Contact = { name: string; number: string };
type Config = {
  enabled: boolean;
  onCallHoursEnabled: boolean;
  onCallStart: string;
  onCallEnd: string;
  greeting: string;
  greetingAudioUrl: string | null;
  information: string;
  contacts: Contact[];
  retrySeconds: number;
  maxAttempts: number;
};
type Attempt = {
  id: string;
  sequence: number;
  contactName: string;
  status: string;
  error: string | null;
  createdAt: string;
};
type Message = {
  id: string;
  caller: string;
  customerName: string | null;
  notes: CallNote[];
  urgent: boolean;
  unread: boolean;
  triageLevel: string;
  triageReason: string | null;
  triageSource: string | null;
  englishSummary: string | null;
  transcriptLanguage: string | null;
  transcriptionError: string | null;
  status: string;
  recordingSid: string | null;
  transcript: string | null;
  duration: number | null;
  createdAt: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  nextAttemptAt: string | null;
  attemptCount: number;
  escalationEnded: boolean;
  attempts: Attempt[];
};
async function api(url: string, options?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.message || "The request failed. Please try again.");
  return body;
}
const date = (value: string) => new Date(value).toLocaleString();

export default function PhonePage() {
  const { data: session } = useSession();
  const owner =
    (session?.user as { role?: string } | undefined)?.role === "OWNER";
  const [tab, setTab] = useState<"inbox" | "settings">("inbox");
  const [filter, setFilter] = useState("active");
  const [messages, setMessages] = useState<Message[]>([]);
  const [openUrgent, setOpenUrgent] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [readiness, setReadiness] = useState({
    providerReady: false,
    multilingualReady: false,
    triageAiReady: false,
    workerEnabled: false,
    workerHealthy: false,
    number: null as string | null,
  });
  const [audioErrors, setAudioErrors] = useState<Record<string, boolean>>({});
  const loadInbox = useCallback(async () => {
    try {
      const body = await api(`/api/phone/messages?filter=${filter}`);
      setMessages(body.messages);
      setCursor(body.nextCursor);
      setOpenUrgent(body.openUrgent);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filter]);
  useEffect(() => {
    setLoading(true);
    void loadInbox();
  }, [loadInbox]);
  useEffect(() => {
    // Refresh automatically only while on the first page, so older messages
    // loaded by the operator do not disappear mid-review.
    const timer = setInterval(() => {
      if (messages.length <= 50 && tab === "inbox") void loadInbox();
    }, 15000);
    return () => clearInterval(timer);
  }, [loadInbox, messages.length, tab]);
  useEffect(() => {
    if (!owner) return;
    api("/api/phone/config")
      .then((body) => {
        setConfig(body.config);
        setReadiness(body);
      })
      .catch((e) => setError(e.message));
  }, [owner]);
  async function act(id: string, action: string) {
    setBusy(id);
    setError("");
    setNotice("");
    try {
      const body = await api(`/api/phone/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setNotice(body.message);
      window.dispatchEvent(new Event("phone-inbox-changed"));
      await loadInbox();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function save() {
    setBusy("settings");
    setError("");
    setNotice("");
    try {
      const body = await api("/api/phone/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      setConfig(body.config);
      setNotice("Phone settings saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function more() {
    if (!cursor) return;
    setBusy("more");
    try {
      const body = await api(
        `/api/phone/messages?filter=${filter}&cursor=${encodeURIComponent(cursor)}`,
      );
      setMessages((previous) => [...previous, ...body.messages]);
      setCursor(body.nextCursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Phone className="h-6 w-6" /> Phone inbox
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Customer messages and urgent facility alerts.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={tab === "inbox" ? "default" : "outline"}
            onClick={() => setTab("inbox")}
          >
            <Voicemail className="mr-2 h-4 w-4" />
            Inbox
          </Button>
          {owner && (
            <Button
              variant={tab === "settings" ? "default" : "outline"}
              onClick={() => setTab("settings")}
            >
              <Settings className="mr-2 h-4 w-4" />
              Setup
            </Button>
          )}
        </div>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="rounded-lg bg-green-50 p-3 text-sm text-green-800"
        >
          {notice}
        </div>
      )}
      {openUrgent > 0 && (
        <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>
            <strong>
              {openUrgent} urgent{" "}
              {openUrgent === 1 ? "message needs" : "messages need"}{" "}
              acknowledgment.
            </strong>
            <p className="text-sm">
              Acknowledging stops further alert calls. Mark resolved after the
              issue is handled.
            </p>
          </div>
        </div>
      )}
      {tab === "inbox" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {[
                ["active", "Active"],
                ["urgent", "Urgent"],
                ["resolved", "Resolved"],
                ["all", "All messages"],
              ].map(([value, label]) => (
                <Button
                  key={value}
                  variant={filter === value ? "default" : "outline"}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <Button variant="ghost" onClick={loadInbox}>
              Refresh
            </Button>
          </div>
          {loading ? (
            <p className="py-8 text-gray-500">Loading messages…</p>
          ) : messages.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Voicemail className="mx-auto mb-3 h-9 w-9 text-gray-400" />
                <p className="font-medium">No messages here.</p>
                <p className="mt-1 text-sm text-gray-500">
                  Calls will appear here once the phone line is connected.
                </p>
              </CardContent>
            </Card>
          ) : (
            messages.map((message) => (
              <Card
                key={message.id}
                className={
                  message.urgent && message.status === "OPEN"
                    ? "border-amber-300"
                    : ""
                }
              >
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      {message.customerName && <p className="mb-1 font-semibold text-gray-900">{message.customerName}</p>}
                      <CardTitle className="text-base">
                        {/^\+\d+$/.test(message.caller) ? (
                          <a
                            className="hover:underline"
                            href={`tel:${message.caller}`}
                          >
                            {message.caller}
                          </a>
                        ) : (
                          message.caller
                        )}
                      </CardTitle>
                      <p className="mt-1 text-xs text-gray-500">
                        {date(message.createdAt)}
                        {message.duration != null
                          ? ` · ${message.duration} seconds`
                          : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {message.unread && <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800">New</span>}
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${message.urgent ? "bg-amber-100 text-amber-900" : "bg-blue-50 text-blue-800"}`}
                      >
                        {message.urgent ? "Urgent" : "General"}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-xs">
                        {message.status.toLowerCase()}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {message.recordingSid ? (
                    <>
                      <audio
                        className="w-full"
                        controls
                        onPlay={() => { if (message.unread) void act(message.id, "read"); }}
                        preload="none"
                        src={`/api/phone/messages/${message.id}/audio`}
                        onError={() =>
                          setAudioErrors((previous) => ({
                            ...previous,
                            [message.id]: true,
                          }))
                        }
                      />
                      {audioErrors[message.id] && (
                        <p className="text-sm text-red-700">
                          The recording could not be loaded. Refresh and try
                          again.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">
                      No recording available yet. The caller may have hung up
                      before leaving a message.
                    </p>
                  )}
                  <div className="rounded-lg bg-gray-50 p-3 text-sm">
                    <strong>{message.triageLevel === "PENDING" ? "Awaiting message analysis" : message.triageLevel.toLowerCase()}</strong>
                    {message.triageSource && <span className="text-xs text-gray-500"> · {message.triageSource.toLowerCase()}</span>}
                    {message.triageReason && <p className="mt-1">{message.triageReason}</p>}
                    {(message.triageLevel === "CRITICAL" || message.triageLevel === "REVIEW") && <p className="mt-1 font-medium">Alerts can ring outside on-call hours.</p>}
                  </div>
                  {message.englishSummary && <p className="rounded-lg bg-blue-50 p-3 text-sm"><strong>English summary:</strong> {message.englishSummary}</p>}
                  {message.transcriptLanguage && <p className="text-xs text-gray-500">Detected language: {message.transcriptLanguage}</p>}
                  {message.transcriptionError && <p className="text-sm text-amber-800">{message.transcriptionError} Listen to the recording.</p>}
                  {message.transcript ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {message.transcript}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500">
                      Transcript pending or unavailable. Listen to the recording
                      when available.
                    </p>
                  )}
                  {message.urgent && message.status === "OPEN" && (
                    <p
                      className={`rounded-lg p-3 text-sm ${message.escalationEnded ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}
                    >
                      {message.escalationEnded
                        ? "Retry limit reached. This alert is still unacknowledged and needs attention."
                        : `Awaiting acknowledgment. ${message.attemptCount} alert call(s) attempted.${message.nextAttemptAt ? ` Next attempt due ${date(message.nextAttemptAt)} during on-call hours while the line is enabled.` : ""}`}
                    </p>
                  )}
                  {message.acknowledgedAt && (
                    <p className="text-xs text-gray-500">
                      Acknowledged by {message.acknowledgedBy} ·{" "}
                      {date(message.acknowledgedAt)}
                    </p>
                  )}
                  {message.resolvedAt && (
                    <p className="text-xs text-gray-500">
                      Resolved by {message.resolvedBy} ·{" "}
                      {date(message.resolvedAt)}
                    </p>
                  )}
                  {message.attempts.length > 0 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-gray-600">
                        Alert call history ({message.attempts.length})
                      </summary>
                      <ul className="mt-2 space-y-2">
                        {message.attempts.map((attempt) => (
                          <li
                            key={attempt.id}
                            className="rounded bg-gray-50 p-2 text-xs"
                          >
                            #{attempt.sequence} · {attempt.contactName} ·{" "}
                            {date(attempt.createdAt)} ·{" "}
                            {attempt.status.toLowerCase().replaceAll("_", " ")}
                            {attempt.error && (
                              <span className="block text-red-700">
                                {attempt.error}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <PhoneCallNotes messageId={message.id} customerName={message.customerName} notes={message.notes} onSaved={loadInbox} />
                  {message.unread && <Button variant="ghost" disabled={busy === message.id} onClick={() => act(message.id, "read")}>Mark read</Button>}
                  {message.status !== "RESOLVED" && (
                    <div className="flex flex-wrap gap-2">
                      {message.status === "OPEN" && message.urgent && (
                        <Button
                          disabled={busy === message.id}
                          onClick={() => act(message.id, "acknowledge")}
                        >
                          Acknowledge & stop calls
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        disabled={busy === message.id}
                        onClick={() => act(message.id, "resolve")}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Mark resolved
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
          {cursor && (
            <Button variant="outline" disabled={busy === "more"} onClick={more}>
              Load older messages
            </Button>
          )}
        </>
      )}
      {tab === "settings" && owner && config && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Connect the phone line</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                Telephone provider:{" "}
                <strong>
                  {readiness.providerReady
                    ? "Configured"
                    : "Needs configuration"}
                </strong>{" "}
                · Escalation worker:{" "}
                <strong>
                  {readiness.workerHealthy
                    ? "Running"
                    : readiness.workerEnabled
                      ? "Enabled; waiting for heartbeat"
                      : "Needs configuration"}
                </strong>
              </p>
              <p>Message analysis: <strong>{readiness.triageAiReady ? "AI configured" : "AI needs configuration"}</strong> · Multilingual transcription: <strong>{readiness.multilingualReady ? "Configured; live language tests required" : "Needs OPENAI_API_KEY in Railway"}</strong></p>
              {!readiness.multilingualReady && <p className="rounded-lg bg-amber-50 p-3 text-amber-900">Messages will require human review and may alert after hours until multilingual transcription is configured. Native English-only transcription cannot reliably triage Spanish or Haitian Creole. Test each language with real callers before relying on automatic deferral.</p>}
              {readiness.number && (
                <p>
                  Forward your MagicJack line to{" "}
                  <strong>{readiness.number}</strong> after testing.
                </p>
              )}
              <p className="text-gray-500">
                Calls use this menu: 1 for information, 2 to leave a message, 9 for urgent assistance. All messages are analyzed. Routine requests stay in the inbox; service issues alert during on-call hours; critical hazards and uncertain messages can alert at any hour.
              </p>
              <p className="text-gray-500">
                Turning the line off pauses alert delivery. Existing messages
                stay in the inbox. Configure a provider fallback for app outages
                before forwarding your public number.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Greeting and information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  id="phone-enabled"
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) =>
                    setConfig({ ...config, enabled: e.target.checked })
                  }
                />
                <Label htmlFor="phone-enabled">
                  Enable phone menu and urgent alerts
                </Label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="greeting">Opening greeting</Label>
                <Textarea
                  id="greeting"
                  maxLength={500}
                  value={config.greeting}
                  onChange={(e) =>
                    setConfig({ ...config, greeting: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="greeting-audio">Recorded multilingual menu URL (optional)</Label>
                <Input id="greeting-audio" type="url" placeholder="https://…/greeting.mp3" value={config.greetingAudioUrl || ""}
                  onChange={(e) => setConfig({ ...config, greetingAudioUrl: e.target.value || null })} />
                <p className="text-sm text-gray-500">Replaces the spoken opening menu. Use a public HTTPS audio recording with English, Spanish and Haitian Creole instructions: 1 for information, 2 to leave a message, 9 for an urgent problem. A fluent speaker should verify the Creole recording before use.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="information">
                  Hours, location, and payment information (press 1)
                </Label>
                <Textarea
                  id="information"
                  maxLength={2000}
                  rows={4}
                  value={config.information}
                  onChange={(e) =>
                    setConfig({ ...config, information: e.target.value })
                  }
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">On-call contacts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-500">
                Contacts ring in this order, then repeat until acknowledged or
                the attempt limit is reached. Answer and press 1 to acknowledge.
                Personal voicemail does not acknowledge the alert.
              </p>
              {config.contacts.map((contact, index) => (
                <div key={index} className="flex flex-wrap items-end gap-2">
                  <div className="min-w-40 flex-1 space-y-1">
                    <Label htmlFor={`contact-name-${index}`}>
                      Contact {index + 1}
                    </Label>
                    <Input
                      id={`contact-name-${index}`}
                      placeholder="Name"
                      maxLength={80}
                      value={contact.name}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          contacts: config.contacts.map((c, i) =>
                            i === index ? { ...c, name: e.target.value } : c,
                          ),
                        })
                      }
                    />
                  </div>
                  <div className="min-w-44 flex-1 space-y-1">
                    <Label htmlFor={`contact-number-${index}`}>
                      Telephone number
                    </Label>
                    <Input
                      id={`contact-number-${index}`}
                      type="tel"
                      placeholder="+19195551234"
                      value={contact.number}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          contacts: config.contacts.map((c, i) =>
                            i === index ? { ...c, number: e.target.value } : c,
                          ),
                        })
                      }
                    />
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setConfig({
                        ...config,
                        contacts: config.contacts.filter((_, i) => i !== index),
                      })
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
              {config.contacts.length < 3 && (
                <Button
                  variant="outline"
                  onClick={() =>
                    setConfig({
                      ...config,
                      contacts: [...config.contacts, { name: "", number: "" }],
                    })
                  }
                >
                  Add contact
                </Button>
              )}
              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <input id="on-call-hours" type="checkbox" checked={config.onCallHoursEnabled}
                    onChange={(e) => setConfig({ ...config, onCallHoursEnabled: e.target.checked })} />
                  <Label htmlFor="on-call-hours">Limit alert calls to on-call hours</Label>
                </div>
                <p className="text-sm text-gray-500">Daily, Eastern time (America/New_York), including daylight saving changes. Outside these hours, service alerts wait until the next on-call period. Critical hazards and messages needing human review can still ring through. Routine requests stay in the inbox. Calls already ringing may finish. Uncheck for 24-hour coverage.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="on-call-start">On-call start</Label>
                    <Input id="on-call-start" type="time" value={config.onCallStart}
                      onChange={(e) => setConfig({ ...config, onCallStart: e.target.value })} /></div>
                  <div className="space-y-2"><Label htmlFor="on-call-end">On-call end</Label>
                    <Input id="on-call-end" type="time" value={config.onCallEnd}
                      onChange={(e) => setConfig({ ...config, onCallEnd: e.target.value })} /></div>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="retry">
                    Seconds between attempts (120–900)
                  </Label>
                  <Input
                    id="retry"
                    type="number"
                    min={120}
                    max={900}
                    value={config.retrySeconds}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        retrySeconds: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="attempts">Maximum alert calls (1–10)</Label>
                  <Input
                    id="attempts"
                    type="number"
                    min={1}
                    max={10}
                    value={config.maxAttempts}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        maxAttempts: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <Button disabled={busy === "settings"} onClick={save}>
                {busy === "settings" ? "Saving…" : "Save phone settings"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
