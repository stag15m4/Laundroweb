import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { alfredError, resolveMachine } from "@/lib/alfred-write";

/** Statuses a maintenance log may carry. */
const LOG_STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "OVERDUE"] as const;

export type MaintenancePayload = {
  machineId: string | null;
  machineName: string | null;
  date: string;
  type: string;
  description: string;
  cost: number | null;
  technician: string | null;
  vendor: string | null;
  status: string;
  parts: { partId: string; partName: string; quantityUsed: number }[];
};

export type Validated =
  | { ok: true; payload: MaintenancePayload; summary: string }
  | { ok: false; response: NextResponse };

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

/**
 * Turns a propose body into resolved, writable values — or into the reason it
 * cannot be written. Nothing here touches the real tables.
 */
export async function validateMaintenance(body: Record<string, unknown>): Promise<Validated> {
  // ── Machine (optional: a log can be shop-wide) ──────────────────────────
  let machineId: string | null = null;
  let machineName: string | null = null;
  if (body.machine !== undefined && body.machine !== null && body.machine !== "") {
    const match = await resolveMachine(body.machine);
    if (!match.ok) return { ok: false, response: match.response };
    machineId = match.machine.id;
    machineName = match.machine.name;
  }

  // ── Required text ──────────────────────────────────────────────────────
  const type = typeof body.type === "string" ? body.type.trim() : "";
  if (!type) {
    return {
      ok: false,
      response: alfredError(
        400,
        "missing_type",
        "No type was supplied. Send a short label such as Repair, Preventive or Inspection.",
      ),
    };
  }

  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!description) {
    return {
      ok: false,
      response: alfredError(
        400,
        "missing_description",
        "No description was supplied. Describe what was done, in a sentence.",
      ),
    };
  }

  // ── Date ───────────────────────────────────────────────────────────────
  let date: Date;
  if (body.date === undefined || body.date === null || body.date === "") {
    date = new Date();
  } else if (typeof body.date === "string" && !Number.isNaN(Date.parse(body.date))) {
    // A bare yyyy-MM-dd is read at midday so the calendar date cannot slip a
    // day west of UTC.
    date = /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? new Date(`${body.date}T12:00:00.000Z`)
      : new Date(body.date);
  } else {
    return {
      ok: false,
      response: alfredError(
        400,
        "invalid_date",
        `Could not read "${String(body.date)}" as a date. Use YYYY-MM-DD.`,
      ),
    };
  }

  // ── Cost ───────────────────────────────────────────────────────────────
  let cost: number | null = null;
  if (body.cost !== undefined && body.cost !== null && body.cost !== "") {
    const parsed = typeof body.cost === "number" ? body.cost : Number(body.cost);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return {
        ok: false,
        response: alfredError(
          400,
          "invalid_cost",
          `Could not read "${String(body.cost)}" as a cost. Send a number of dollars, such as 125.50.`,
        ),
      };
    }
    cost = parsed;
  }

  // ── Status ─────────────────────────────────────────────────────────────
  const status =
    body.status === undefined || body.status === null || body.status === ""
      ? "COMPLETED"
      : String(body.status).toUpperCase();
  if (!LOG_STATUSES.includes(status as (typeof LOG_STATUSES)[number])) {
    return {
      ok: false,
      response: alfredError(
        400,
        "invalid_status",
        `"${String(body.status)}" is not a maintenance status. Use one of ${LOG_STATUSES.join(", ")}.`,
      ),
    };
  }

  // ── Parts ──────────────────────────────────────────────────────────────
  const parts: MaintenancePayload["parts"] = [];
  const rawParts = body.partsUsed;
  if (rawParts !== undefined && rawParts !== null) {
    if (!Array.isArray(rawParts)) {
      return {
        ok: false,
        response: alfredError(
          400,
          "invalid_parts",
          "partsUsed must be an array of { part, quantity } objects.",
        ),
      };
    }

    for (const entry of rawParts) {
      const row = (entry ?? {}) as Record<string, unknown>;
      const partQuery = typeof row.part === "string" ? row.part.trim() : "";
      if (!partQuery) {
        return {
          ok: false,
          response: alfredError(
            400,
            "missing_part",
            "Every entry in partsUsed needs a part name or id.",
          ),
        };
      }

      const quantityUsed =
        typeof row.quantity === "number" ? row.quantity : Number.parseInt(String(row.quantity ?? ""), 10);
      if (!Number.isFinite(quantityUsed) || quantityUsed <= 0) {
        return {
          ok: false,
          response: alfredError(
            400,
            "invalid_part_quantity",
            `Quantity for "${partQuery}" must be a whole number greater than zero.`,
          ),
        };
      }

      const exact = await prisma.partInventory.findFirst({
        where: { OR: [{ id: partQuery }, { name: { equals: partQuery, mode: "insensitive" } }] },
        select: { id: true, name: true, quantity: true },
      });
      const candidates = exact
        ? [exact]
        : await prisma.partInventory.findMany({
            where: { name: { contains: partQuery, mode: "insensitive" } },
            select: { id: true, name: true, quantity: true },
            take: 11,
          });

      if (candidates.length === 0) {
        return {
          ok: false,
          response: alfredError(
            404,
            "part_not_found",
            `No part matches "${partQuery}". Check the name against the parts inventory.`,
          ),
        };
      }
      if (candidates.length > 1) {
        const names = candidates.slice(0, 10).map((p) => p.name);
        return {
          ok: false,
          response: alfredError(
            409,
            "ambiguous_part",
            `"${partQuery}" matches ${candidates.length} parts: ${names.join(", ")}. Send the exact name.`,
            { candidates: names },
          ),
        };
      }

      const part = candidates[0]!;

      // Confirming this log decrements inventory, so a shortfall is caught now
      // rather than leaving stock negative after the write.
      if (part.quantity < quantityUsed) {
        return {
          ok: false,
          response: alfredError(
            409,
            "insufficient_part_stock",
            `Only ${part.quantity} of "${part.name}" are in stock, but ${quantityUsed} were requested.`,
          ),
        };
      }

      parts.push({ partId: part.id, partName: part.name, quantityUsed });
    }
  }

  // ── Summary, written for a person to approve ────────────────────────────
  const partsText =
    parts.length > 0
      ? ` using ${parts.map((p) => `${p.quantityUsed} × ${p.partName}`).join(", ")}`
      : "";
  const summary =
    `Log ${type} on ${machineName ?? "the shop (no specific machine)"} ` +
    `dated ${date.toISOString().slice(0, 10)}` +
    `${cost === null ? "" : `, cost ${money(cost)}`}` +
    `${partsText}. Status ${status}. "${description}"`;

  return {
    ok: true,
    summary,
    payload: {
      machineId,
      machineName,
      date: date.toISOString(),
      type,
      description,
      cost,
      technician: typeof body.technician === "string" && body.technician.trim() ? body.technician.trim() : null,
      vendor: typeof body.vendor === "string" && body.vendor.trim() ? body.vendor.trim() : null,
      status,
      parts,
    },
  };
}

/** Performs the write described by a confirmed proposal. */
export async function writeMaintenance(payload: MaintenancePayload) {
  const data = {
    machineId: payload.machineId,
    date: new Date(payload.date),
    type: payload.type,
    description: payload.description,
    cost: payload.cost === null ? null : new Prisma.Decimal(payload.cost),
    technician: payload.technician,
    vendor: payload.vendor,
    status: payload.status as Prisma.MaintenanceLogCreateInput["status"],
  };

  const include = {
    machine: { select: { id: true, name: true, type: true } },
    partsUsed: { include: { part: { select: { id: true, name: true, unit: true } } } },
  };

  if (payload.parts.length === 0) {
    return prisma.maintenanceLog.create({ data, include });
  }

  // One transaction: the log, its part usages and the stock decrements land
  // together or not at all, matching what the dashboard does.
  return prisma.$transaction(async (tx) => {
    const created = await tx.maintenanceLog.create({ data });
    for (const part of payload.parts) {
      await tx.maintenancePartUsage.create({
        data: { maintenanceLogId: created.id, partId: part.partId, quantityUsed: part.quantityUsed },
      });
      await tx.partInventory.update({
        where: { id: part.partId },
        data: { quantity: { decrement: part.quantityUsed } },
      });
    }
    return tx.maintenanceLog.findUniqueOrThrow({ where: { id: created.id }, include });
  });
}
