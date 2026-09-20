import { NextResponse } from "next/server";
import { MachineStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { alfredError, resolveMachine } from "@/lib/alfred-write";

const STATUSES = Object.values(MachineStatus) as string[];

export type StatusPayload = {
  machineId: string;
  machineName: string;
  fromStatus: string;
  status: string;
  note: string | null;
};

export type Validated =
  | { ok: true; payload: StatusPayload; summary: string }
  | { ok: false; response: NextResponse };

function readable(status: string): string {
  return status.replace(/_/g, " ").toLowerCase();
}

export async function validateStatusChange(body: Record<string, unknown>): Promise<Validated> {
  const match = await resolveMachine(body.machine);
  if (!match.ok) return { ok: false, response: match.response };
  const machine = match.machine;

  const raw = body.status;
  if (typeof raw !== "string" || raw.trim() === "") {
    return {
      ok: false,
      response: alfredError(
        400,
        "missing_status",
        `No status was supplied. Use one of ${STATUSES.join(", ")}.`,
      ),
    };
  }

  const status = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!STATUSES.includes(status)) {
    return {
      ok: false,
      response: alfredError(
        400,
        "invalid_status",
        `"${raw}" is not a machine status. Use one of ${STATUSES.join(", ")}.`,
      ),
    };
  }

  if (status === machine.status) {
    return {
      ok: false,
      response: alfredError(
        409,
        "status_unchanged",
        `${machine.name} is already ${readable(status)}. Nothing would change.`,
      ),
    };
  }

  // The dashboard requires a reason for taking a machine out of service; the
  // same rule holds here, so a machine cannot end up dark with no explanation
  // just because the change came in over the API.
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
  if (status !== "OPERATIONAL" && !note) {
    return {
      ok: false,
      response: alfredError(
        400,
        "note_required",
        `A note is required when a machine is not operational. Say why ${machine.name} is going ${readable(status)}.`,
      ),
    };
  }

  const summary =
    `Change ${machine.name} from ${readable(machine.status)} to ${readable(status)}` +
    `${note ? `, noting: "${note}"` : ""}.`;

  return {
    ok: true,
    summary,
    payload: {
      machineId: machine.id,
      machineName: machine.name,
      fromStatus: machine.status,
      status,
      note,
    },
  };
}

export async function writeStatusChange(payload: StatusPayload) {
  // Status and note land together, so a machine is never marked down with its
  // explanation missing.
  const [machine] = await prisma.$transaction([
    prisma.machine.update({
      where: { id: payload.machineId },
      data: { status: payload.status as MachineStatus },
      select: { id: true, name: true, type: true, status: true },
    }),
    ...(payload.note
      ? [
          prisma.note.create({
            data: {
              content: payload.note,
              category: "maintenance",
              machineId: payload.machineId,
            },
          }),
        ]
      : []),
  ]);

  return machine;
}
