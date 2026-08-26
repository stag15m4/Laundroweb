"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Thermometer, Wind, Power, RefreshCw, ChevronUp, ChevronDown, Loader2 } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type DeviceStatus = {
  id: string;
  name: string;
  online: boolean;
  status: {
    switch?: boolean;
    mode?: string;
    temp_set?: number;
    temp_current?: number;
    fan_speed_enum?: string;
    temp_unit_convert?: string;
  };
};

// ── Constants ──────────────────────────────────────────────────────────────────

const MODES = [
  { value: "cold", label: "Cool" },
  { value: "heat", label: "Heat" },
  { value: "auto", label: "Auto" },
  { value: "wind", label: "Fan" },
  { value: "wet", label: "Dry" },
];

const FAN_SPEEDS = [
  { value: "auto", label: "Auto" },
  { value: "low", label: "Low" },
  { value: "middle", label: "Mid" },
  { value: "high", label: "High" },
];

// ── UnitCard ───────────────────────────────────────────────────────────────────

function UnitCard({ device, onCommand }: { device: DeviceStatus; onCommand: (deviceId: string, commands: { code: string; value: unknown }[]) => Promise<void> }) {
  const [sending, setSending] = useState<string | null>(null);
  const s = device.status;
  const isCelsius = s.temp_unit_convert !== "f";
  const isOn = s.switch ?? false;

  async function send(commands: { code: string; value: unknown }[], key: string) {
    setSending(key);
    await onCommand(device.id, commands);
    setSending(null);
  }

  function tempDisplay(c?: number) {
    if (c === undefined) return "—";
    if (isCelsius) return `${c}°C`;
    return `${Math.round(c * 9 / 5 + 32)}°F`;
  }

  const currentMode = MODES.find((m) => m.value === s.mode) ?? { label: s.mode ?? "—" };
  const currentFan = FAN_SPEEDS.find((f) => f.value === s.fan_speed_enum) ?? { label: s.fan_speed_enum ?? "—" };

  const tempSet = s.temp_set ?? 24;

  return (
    <Card className={`transition-opacity ${!device.online ? "opacity-60" : ""}`}>
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">{device.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${device.online ? "bg-green-400" : "bg-gray-300"}`} />
              <span className="text-xs text-gray-500">{device.online ? "Online" : "Offline"}</span>
              {device.online && (
                <Badge variant={isOn ? "success" : "secondary"} className="text-xs">
                  {isOn ? "On" : "Off"}
                </Badge>
              )}
            </div>
          </div>
          {/* Power toggle */}
          <Button
            size="sm"
            variant={isOn ? "destructive" : "default"}
            disabled={!device.online || sending === "power"}
            onClick={() => send([{ code: "switch", value: !isOn }], "power")}
            className="gap-1.5"
          >
            {sending === "power" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
            {isOn ? "Turn Off" : "Turn On"}
          </Button>
        </div>

        {/* Temperature display */}
        <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4">
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1">Room</p>
            <p className="text-2xl font-bold text-gray-700">{tempDisplay(s.temp_current)}</p>
          </div>
          <Thermometer className="h-6 w-6 text-gray-300" />
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1">Set to</p>
            <div className="flex items-center gap-2">
              <button
                disabled={!isOn || !device.online || sending === "temp"}
                onClick={() => send([{ code: "temp_set", value: Math.max(16, tempSet - 1) }], "temp")}
                className="p-1 rounded-full hover:bg-gray-200 disabled:opacity-40 transition-colors"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <p className="text-2xl font-bold text-blue-600 w-14 text-center">
                {sending === "temp"
                  ? <Loader2 className="h-5 w-5 animate-spin inline" />
                  : tempDisplay(tempSet)}
              </p>
              <button
                disabled={!isOn || !device.online || sending === "temp"}
                onClick={() => send([{ code: "temp_set", value: Math.min(30, tempSet + 1) }], "temp")}
                className="p-1 rounded-full hover:bg-gray-200 disabled:opacity-40 transition-colors"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Mode */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-500">Mode</p>
          <div className="flex gap-1.5 flex-wrap">
            {MODES.map((m) => (
              <button
                key={m.value}
                disabled={!isOn || !device.online || sending === "mode"}
                onClick={() => send([{ code: "mode", value: m.value }], "mode")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 ${
                  s.mode === m.value
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Fan speed */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
            <Wind className="h-3.5 w-3.5" /> Fan Speed
          </p>
          <div className="flex gap-1.5">
            {FAN_SPEEDS.map((f) => (
              <button
                key={f.value}
                disabled={!isOn || !device.online || sending === "fan"}
                onClick={() => send([{ code: "fan_speed_enum", value: f.value }], "fan")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 flex-1 ${
                  s.fan_speed_enum === f.value
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Summary line */}
        {isOn && (
          <p className="text-xs text-gray-400 text-center">
            {currentMode.label} · {currentFan.label} fan
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── ClimatePage ────────────────────────────────────────────────────────────────

export default function ClimatePage() {
  const [devices, setDevices] = useState<DeviceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDevices = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch("/api/climate");
      if (res.status === 503) {
        setError("Climate control is not configured yet. Add TUYA_CLIENT_ID, TUYA_CLIENT_SECRET, and TUYA_DEVICE_IDS to your Railway environment variables.");
        return;
      }
      if (!res.ok) throw new Error("Failed to load");
      setDevices(await res.json());
      setError(null);
    } catch {
      setError("Could not reach climate devices.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const id = setInterval(() => fetchDevices(true), 30_000);
    return () => clearInterval(id);
  }, [fetchDevices]);

  async function sendCommand(deviceId: string, commands: { code: string; value: unknown }[]) {
    await fetch("/api/climate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, commands }),
    });
    // Refresh status after a short delay to let Tuya propagate the change
    setTimeout(() => fetchDevices(true), 1500);
  }

  return (
    <div>
      <Header title="Climate" description="Mini-split AC control for all units">
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchDevices(true)}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </Header>

      <div className="p-6">
        {loading && (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Connecting to devices…</span>
          </div>
        )}

        {!loading && error && (
          <div className="max-w-lg mx-auto mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-5">
            <p className="text-sm font-medium text-yellow-800 mb-1">Not configured</p>
            <p className="text-sm text-yellow-700">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl">
            {devices.map((d) => (
              <UnitCard key={d.id} device={d} onCommand={sendCommand} />
            ))}
            {devices.length === 0 && (
              <p className="text-sm text-gray-400 col-span-2 text-center py-12">No devices found.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
