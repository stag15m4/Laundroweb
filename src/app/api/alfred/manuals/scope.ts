import type { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { alfredError, resolveMachine } from "@/lib/alfred-write";
import { manualScope } from "@/lib/manual-search";

const TYPES = ["WASHER", "DRYER", "VENDING", "WATER_HEATER", "AIR_CONDITIONER", "PLUMBING_DEVICE", "OTHER", "BUILDING"];

export type AlfredScope =
  | { ok: true; scope: Prisma.ManualDocumentWhereInput; label: string | null }
  | { ok: false; response: NextResponse };

/**
 * Narrow the manuals searched from Alfred's query string: `machine` (name,
 * serial or id, resolved the same way as the machine writes, so an ambiguous
 * name comes back with candidates) or `type` (WASHER, DRYER, ...). Neither
 * searches every manual.
 */
export async function alfredScope(params: URLSearchParams): Promise<AlfredScope> {
  const machine = params.get("machine");
  const type = params.get("type")?.trim().toUpperCase();

  if (machine) {
    const match = await resolveMachine(machine);
    if (!match.ok) return match;
    const scope = await manualScope({ machineId: match.machine.id });
    return { ok: true, scope, label: `${match.machine.name} (${match.machine.type.toLowerCase()})` };
  }
  if (type) {
    if (!TYPES.includes(type)) {
      return {
        ok: false,
        response: alfredError(400, "invalid_type", `"${type}" is not a machine type. Use one of ${TYPES.join(", ")}.`),
      };
    }
    return { ok: true, scope: await manualScope({ machineType: type }), label: `the ${type.toLowerCase().replace(/_/g, " ")}s` };
  }
  return { ok: true, scope: {}, label: null };
}
