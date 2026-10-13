"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import { Plus, Trash2, FileText, Download, FolderOpen } from "lucide-react";

type DocumentRow = {
  id: string;
  name: string;
  category: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
  uploadedBy: { name: string } | null;
};

const categories = ["general", "compliance", "insurance", "legal", "vendor", "financial"];

const categoryColors: Record<string, string> = {
  general: "bg-gray-100 text-gray-700",
  compliance: "bg-orange-100 text-orange-700",
  insurance: "bg-blue-100 text-blue-700",
  legal: "bg-purple-100 text-purple-700",
  vendor: "bg-green-100 text-green-700",
  financial: "bg-yellow-100 text-yellow-800",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const { data: session } = useSession();
  const isOwner = (session?.user as { role?: string })?.role === "OWNER";

  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("general");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/documents").then((r) => r.json()).then(setDocuments);
  }, []);

  const filtered = filter === "all" ? documents : documents.filter((d) => d.category === filter);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.set("name", name);
    formData.set("category", category);
    formData.set("file", file);

    const res = await fetch("/api/documents", { method: "POST", body: formData });
    setUploading(false);

    if (res.ok) {
      const doc = await res.json();
      setDocuments((prev) => [...prev, doc]);
      setOpen(false);
      setName("");
      setCategory("general");
      setFile(null);
    } else {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Upload failed");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this document?")) return;
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }

  return (
    <div>
      <Header title="Documents" description="Leases, insurance, licenses, policies, and other useful files">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Filter" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
          </SelectContent>
        </Select>
        {isOwner && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Upload Document
          </Button>
        )}
      </Header>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload Document</DialogTitle></DialogHeader>
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. General Liability Insurance Certificate"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{categories.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>File</Label>
              <Input
                type="file"
                required
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={uploading}>
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <div className="p-6">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <FolderOpen className="h-8 w-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400">
              {documents.length === 0 ? "No documents yet." : "No documents in this category."}
              {isOwner && documents.length === 0 && " Upload one above."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((d) => (
              <Card key={d.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${categoryColors[d.category] ?? "bg-gray-100 text-gray-700"}`}>
                      {d.category}
                    </span>
                    {isOwner && (
                      <button onClick={() => handleDelete(d.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-gray-300 hover:text-red-400" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-start gap-2 mb-2">
                    <FileText className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm font-medium text-gray-900 break-words">{d.name}</p>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">{formatFileSize(d.fileSize)}</p>
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-gray-400">
                      {formatDate(d.updatedAt)}
                      {d.uploadedBy && ` · ${d.uploadedBy.name}`}
                    </div>
                    <a
                      href={`/api/documents/${d.id}/file`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Open
                    </a>
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
