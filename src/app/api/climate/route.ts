import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { tuyaGet, tuyaPost, deviceIds, tuyaConfigured } from "@/lib/tuya";

function notConfigured() {
  return NextResponse.json({ error: "Climate control not configured" }, { status: 503 });
}

// GET /api/climate  → status of all configured devices
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!tuyaConfigured()) return notConfigured();

  const ids = deviceIds();
  const results = await Promise.allSettled(
    ids.map(async (id) => {
      const [info, status] = await Promise.all([
        tuyaGet(`/v1.0/devices/${id}`),
        tuyaGet(`/v1.0/devices/${id}/status`),
      ]);
      const statusMap: Record<string, unknown> = {};
      if (Array.isArray(status.result)) {
        for (const s of status.result) statusMap[s.code] = s.value;
      }
      return {
        id,
        name: info.result?.name ?? id,
        online: info.result?.online ?? false,
        status: statusMap,
      };
    })
  );

  const devices = results.map((r) =>
    r.status === "fulfilled" ? r.value : { id: "unknown", name: "Error", online: false, status: {} }
  );
  return NextResponse.json(devices);
}

// POST /api/climate  { deviceId, commands: [{ code, value }] }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!tuyaConfigured()) return notConfigured();

  const { deviceId, commands } = await req.json();
  if (!deviceId || !Array.isArray(commands)) {
    return NextResponse.json({ error: "deviceId and commands required" }, { status: 400 });
  }

  // Ensure only configured device IDs can be controlled
  if (!deviceIds().includes(deviceId)) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  const result = await tuyaPost(`/v1.0/devices/${deviceId}/commands`, { commands });
  return NextResponse.json(result);
}
