"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, ExternalLink, Settings, Shield } from "lucide-react";

export default function CamerasPage() {
  const [url, setUrl] = useState("");
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((settings) => {
        const u = settings.unifi_protect_url ?? "";
        setUrl(u);
        setSaved(u);
        if (!u) setEditMode(true);
      });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unifi_protect_url: url }),
    });
    setSaved(url);
    setSaving(false);
    setEditMode(false);
  }

  return (
    <div>
      <Header title="Cameras" description="UniFi Protect camera system" />
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4" />
              UniFi Protect Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            {editMode ? (
              <form onSubmit={handleSave} className="space-y-3 max-w-lg">
                <div className="space-y-1.5">
                  <Label htmlFor="protect-url">UniFi Protect URL</Label>
                  <Input
                    id="protect-url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://192.168.1.1/protect"
                    type="url"
                  />
                  <p className="text-xs text-gray-400">
                    Enter the local URL of your UniFi Protect controller (e.g. your UDM Pro IP address).
                    The dashboard will open it in a new tab or embed it below.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
                  {saved && <Button type="button" variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>}
                </div>
              </form>
            ) : (
              <div className="flex items-center gap-3">
                <code className="text-sm bg-gray-100 px-3 py-1.5 rounded-md text-gray-700">{saved}</code>
                <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
                  <Settings className="h-3.5 w-3.5 mr-1.5" />
                  Change
                </Button>
                <a href={saved} target="_blank" rel="noopener noreferrer">
                  <Button size="sm">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Open in new tab
                  </Button>
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {saved ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Camera className="h-4 w-4 text-blue-600" />
                Live View
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="relative">
                <iframe
                  src={saved}
                  className="w-full rounded-b-xl border-0"
                  style={{ height: "calc(100vh - 320px)", minHeight: "500px" }}
                  title="UniFi Protect"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 hover:opacity-100 transition-opacity">
                </div>
              </div>
              <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
                <Shield className="h-3 w-3" />
                UniFi Protect may require you to be on the same local network or have remote access configured on your UDM.
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Camera className="h-12 w-12 text-gray-200 mb-4" />
            <p className="text-gray-400 text-sm">Configure your UniFi Protect URL above to view cameras here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
