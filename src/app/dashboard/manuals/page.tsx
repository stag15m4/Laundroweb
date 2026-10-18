"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import { Plus, Trash2, Search, Sparkles, BookOpen, RefreshCw, AlertTriangle, Loader2 } from "lucide-react";

type Machine = { id: string; name: string; type: string; brand: string | null; model: string | null };

type Manual = {
  id: string;
  name: string;
  machineType: string | null;
  machineId: string | null;
  fileName: string;
  fileSize: number;
  updatedAt: string;
  indexStatus: "NONE" | "INDEXING" | "READY" | "FAILED";
  indexError: string | null;
  pageCount: number | null;
  indexedPages: number;
  indexedAt: string | null;
  _count: { entries: number };
};

type Entry = {
  id: string;
  kind: string;
  code: string | null;
  title: string;
  models: string | null;
  meaning: string | null;
  details: string;
  pageStart: number;
  pageEnd: number;
  manual: { id: string; name: string };
  match: "code" | "text";
};

type Citation = { manualId: string; manualName: string; page: number; endPage: number; citedText: string };
type AskResponse =
  | { ok: true; segments: { text: string; citations: Citation[] }[]; consulted: { manualId: string; manualName: string; pages: number[] }[] }
  | { ok: false; message: string };

const COVERS = [
  { value: "WASHER", label: "All washers" },
  { value: "DRYER", label: "All dryers" },
  { value: "VENDING", label: "All vending machines" },
  { value: "BUILDING", label: "Building" },
  { value: "GENERAL", label: "General (card readers, change machine, etc.)" },
];

const kindLabel: Record<string, string> = {
  ERROR_CODE: "Error code",
  PROCEDURE: "Procedure",
  SETTING: "Setting",
  SPEC: "Spec",
};

const kindColors: Record<string, string> = {
  ERROR_CODE: "bg-red-100 text-red-700",
  PROCEDURE: "bg-blue-100 text-blue-700",
  SETTING: "bg-purple-100 text-purple-700",
  SPEC: "bg-gray-100 text-gray-700",
};

function pageHref(manualId: string, page: number) {
  return `/api/manuals/${manualId}/file#page=${page}`;
}

function PageLink({ manualId, page, label }: { manualId: string; page: number; label: string }) {
  return (
    <a
      href={pageHref(manualId, page)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
    >
      <BookOpen className="h-3 w-3" />
      {label}
    </a>
  );
}

function coversLabel(m: Manual, machines: Machine[]) {
  if (m.machineId) return machines.find((x) => x.id === m.machineId)?.name ?? "One machine";
  return COVERS.find((c) => c.value === (m.machineType ?? "GENERAL"))?.label ?? m.machineType ?? "General";
}

function ManualsPageInner() {
  const { data: session } = useSession();
  const isOwner = (session?.user as { role?: string })?.role === "OWNER";
  const searchParams = useSearchParams();

  const [machines, setMachines] = useState<Machine[]>([]);
  const [manuals, setManuals] = useState<Manual[]>([]);
  const [aiOn, setAiOn] = useState(true);
  const [machineId, setMachineId] = useState<string>(searchParams.get("machine") ?? "all");

  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [searching, setSearching] = useState(false);
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const [askedQuestion, setAskedQuestion] = useState("");

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [covers, setCovers] = useState("WASHER");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const loadManuals = useCallback(async () => {
    const res = await fetch("/api/manuals");
    if (!res.ok) return;
    setAiOn(res.headers.get("X-Manuals-AI") !== "off");
    setManuals(await res.json());
  }, []);

  useEffect(() => {
    fetch("/api/equipment").then((r) => r.json()).then(setMachines);
    loadManuals();
  }, [loadManuals]);

  // Keep indexing progress live.
  const anyIndexing = manuals.some((m) => m.indexStatus === "INDEXING");
  useEffect(() => {
    if (!anyIndexing) return;
    const t = setInterval(loadManuals, 5000);
    return () => clearInterval(t);
  }, [anyIndexing, loadManuals]);

  // Instant database lookup as you type.
  const lookupSeq = useRef(0);
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setEntries([]);
      return;
    }
    const seq = ++lookupSeq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      const params = new URLSearchParams({ q });
      if (machineId !== "all") params.set("machineId", machineId);
      const res = await fetch(`/api/manuals/lookup?${params}`);
      if (seq !== lookupSeq.current) return;
      setEntries(res.ok ? await res.json() : []);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query, machineId]);

  async function ask(e?: React.FormEvent) {
    e?.preventDefault();
    const question = query.trim();
    if (!question || asking) return;
    setAsking(true);
    setAnswer(null);
    setAskError(null);
    setAskedQuestion(question);
    const res = await fetch("/api/manuals/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, machineId: machineId === "all" ? undefined : machineId }),
    });
    const body = await res.json().catch(() => null);
    if (res.ok && body) setAnswer(body);
    else setAskError(body?.error ?? "Something went wrong. Try again.");
    setAsking(false);
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("file", file);
    if (covers.startsWith("machine:")) fd.set("machineId", covers.slice("machine:".length));
    else if (covers !== "GENERAL") fd.set("machineType", covers);
    const res = await fetch("/api/manuals", { method: "POST", body: fd });
    setUploading(false);
    if (res.ok) {
      setOpen(false);
      setName("");
      setFile(null);
      loadManuals();
    } else {
      const body = await res.json().catch(() => null);
      setUploadError(body?.error ?? "Upload failed");
    }
  }

  async function reindex(id: string) {
    const res = await fetch(`/api/manuals/${id}/index`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.error ?? "Couldn't start indexing.");
    }
    loadManuals();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this manual and everything indexed from it?")) return;
    const res = await fetch(`/api/manuals/${id}`, { method: "DELETE" });
    if (res.ok) setManuals((prev) => prev.filter((m) => m.id !== id));
    else alert("Couldn't delete this manual. Please try again.");
  }

  const selectedMachine = machines.find((m) => m.id === machineId);
  const readyCount = manuals.filter((m) => m.indexStatus === "READY").length;
  const codeMatches = entries.filter((e) => e.match === "code");
  const otherMatches = entries.filter((e) => e.match === "text");

  return (
    <div>
      <Header title="Manuals" description="Look up error codes, programming steps, and settings">
        {isOwner && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Upload Manual
          </Button>
        )}
      </Header>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload Manual</DialogTitle></DialogHeader>
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. Huebsch Washer Programming Manual"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Covers</Label>
              <Select value={covers} onValueChange={setCovers}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COVERS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  {machines
                    .filter((m) => !["WASHER", "DRYER"].includes(m.type))
                    .map((m) => <SelectItem key={m.id} value={`machine:${m.id}`}>Only {m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>PDF</Label>
              <Input type="file" accept=".pdf,application/pdf" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <p className="text-xs text-gray-500">
              After upload, Claude reads the whole manual and indexes every code and procedure. That takes a few minutes for a long manual; you can leave the page.
            </p>
            {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
            <Button type="submit" className="w-full" disabled={uploading}>
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <div className="p-6 space-y-6 max-w-4xl">
        {!aiOn && isOwner && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p>Indexing and questions are off until <code className="font-mono">ANTHROPIC_API_KEY</code> is set in Railway. Manuals can still be uploaded and opened.</p>
          </div>
        )}

        {/* ── Search ─────────────────────────────────────────────── */}
        <form onSubmit={ask} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={machineId} onValueChange={(v) => { setMachineId(v); setAnswer(null); }}>
              <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All equipment</SelectItem>
                {machines.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='Error code like "E35", or a question like "how do I change the dryer cycle time?"'
                className="pl-9 h-11 text-base"
                autoFocus
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!query.trim() || asking || !aiOn || readyCount === 0}>
              {asking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {asking ? "Reading the manual…" : "Ask the manuals"}
            </Button>
            <p className="text-xs text-gray-400">
              Codes show up instantly below. Ask when you need steps or an explanation; the answer cites the page it came from.
            </p>
          </div>
        </form>

        {/* ── AI answer ──────────────────────────────────────────── */}
        {(asking || answer || askError) && (
          <Card className="border-blue-200">
            <CardContent className="p-4 space-y-3">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                {askedQuestion}{selectedMachine ? ` · ${selectedMachine.name}` : ""}
              </p>
              {asking && <p className="text-sm text-gray-500">Finding the right pages and reading them. This usually takes 20–40 seconds.</p>}
              {askError && <p className="text-sm text-red-600">{askError}</p>}
              {answer && !answer.ok && <p className="text-sm text-gray-700">{answer.message}</p>}
              {answer && answer.ok && (
                <>
                  <div className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">
                    {answer.segments.map((s, i) => (
                      <span key={i}>
                        {s.text.replace(/\*\*/g, "")}
                        {s.citations.map((c, j) => (
                          <a
                            key={j}
                            href={pageHref(c.manualId, c.page)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`${c.manualName}: "${c.citedText.trim()}"`}
                            className="ml-0.5 align-super text-[10px] font-semibold text-blue-600 hover:underline"
                          >
                            [p.{c.page}{c.endPage !== c.page ? `–${c.endPage}` : ""}]
                          </a>
                        ))}
                      </span>
                    ))}
                  </div>
                  <div className="border-t pt-2 space-y-1">
                    <p className="text-xs text-gray-400">Pages read:</p>
                    {answer.consulted.map((d) => (
                      <div key={d.manualId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-xs text-gray-600">{d.manualName}</span>
                        {d.pages.map((p) => <PageLink key={p} manualId={d.manualId} page={p} label={`p.${p}`} />)}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Instant lookup results ─────────────────────────────── */}
        {query.trim() && (
          <div className="space-y-3">
            {searching && entries.length === 0 ? (
              <p className="text-sm text-gray-400">Searching…</p>
            ) : entries.length === 0 ? (
              <p className="text-sm text-gray-400">
                No exact match in the index{readyCount === 0 ? " (no manuals are indexed yet)" : ""}. Try &quot;Ask the manuals&quot;.
              </p>
            ) : (
              [
                { title: "Code matches", list: codeMatches },
                { title: codeMatches.length ? "Related" : "Matches", list: otherMatches },
              ]
                .filter((g) => g.list.length)
                .map((g) => (
                  <div key={g.title} className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{g.title}</p>
                    {g.list.map((e) => (
                      <Card key={e.id}>
                        <CardContent className="p-4 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${kindColors[e.kind] ?? "bg-gray-100 text-gray-700"}`}>
                              {kindLabel[e.kind] ?? e.kind}
                            </span>
                            {e.code && <span className="font-mono text-sm font-semibold text-gray-900">{e.code}</span>}
                            <span className="text-sm font-medium text-gray-900">{e.title !== e.code ? e.title : ""}</span>
                          </div>
                          {e.meaning && <p className="text-sm text-gray-800">{e.meaning}</p>}
                          {e.details && <p className="text-sm text-gray-600 whitespace-pre-wrap">{e.details}</p>}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
                            <PageLink
                              manualId={e.manual.id}
                              page={e.pageStart}
                              label={`${e.manual.name}, p.${e.pageStart}${e.pageEnd !== e.pageStart ? `–${e.pageEnd}` : ""}`}
                            />
                            {e.models && <span className="text-xs text-gray-400">Models: {e.models}</span>}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ))
            )}
          </div>
        )}

        {/* ── Library ────────────────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Loaded manuals</p>
          {manuals.length === 0 ? (
            <p className="text-sm text-gray-400">
              No manuals yet.{isOwner && " Upload one above."}
            </p>
          ) : (
            manuals.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-lg border bg-white p-3">
                <BookOpen className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <a
                    href={`/api/manuals/${m.id}/file`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-gray-900 hover:text-blue-600 break-words"
                  >
                    {m.name}
                  </a>
                  <p className="text-xs text-gray-400">
                    {coversLabel(m, machines)}
                    {m.pageCount ? ` · ${m.pageCount} pages` : ""} · {formatDate(m.updatedAt)}
                  </p>
                  {m.indexStatus === "INDEXING" && (
                    <p className="text-xs text-blue-600 flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Indexing{m.pageCount ? ` ${m.indexedPages} of ${m.pageCount} pages` : "…"}
                    </p>
                  )}
                  {m.indexStatus === "READY" && (
                    <p className="text-xs text-green-700">Indexed · {m._count.entries} codes, procedures and settings</p>
                  )}
                  {m.indexStatus === "FAILED" && <p className="text-xs text-red-600">Indexing failed: {m.indexError}</p>}
                  {m.indexStatus === "NONE" && <p className="text-xs text-gray-400">Not indexed yet</p>}
                </div>
                {isOwner && (
                  <div className="flex items-center gap-1">
                    {aiOn && m.indexStatus !== "INDEXING" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => reindex(m.id)}
                        title={m.indexStatus === "READY" ? "Re-index" : "Index now"}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(m.id)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function ManualsPage() {
  return (
    <Suspense>
      <ManualsPageInner />
    </Suspense>
  );
}
