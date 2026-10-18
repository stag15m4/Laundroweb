import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Upper-case a code and drop everything but letters and digits: "e: 35" -> "E35". */
export function codeKey(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Which manuals apply. A machine sees its own manual, the manuals for its
 * type, and the general manuals; a manual id narrows to that one manual.
 */
export async function manualScope(opts: {
  machineId?: string | null;
  manualId?: string | null;
  machineType?: string | null;
}): Promise<Prisma.ManualDocumentWhereInput> {
  if (opts.manualId) return { id: opts.manualId };
  if (opts.machineType) return { OR: [{ machineType: opts.machineType }, { machineType: null, machineId: null }] };
  if (opts.machineId) {
    const machine = await prisma.machine.findUnique({ where: { id: opts.machineId }, select: { id: true, type: true } });
    if (machine) {
      return {
        OR: [
          { machineId: machine.id },
          { machineType: machine.type },
          { machineType: null, machineId: null },
        ],
      };
    }
  }
  return {};
}

const entrySelect = {
  id: true,
  kind: true,
  code: true,
  codeKey: true,
  title: true,
  models: true,
  meaning: true,
  details: true,
  pageStart: true,
  pageEnd: true,
  manual: { select: { id: true, name: true } },
} satisfies Prisma.ManualEntrySelect;

export type ManualEntryResult = Prisma.ManualEntryGetPayload<{ select: typeof entrySelect }> & {
  match: "code" | "text";
};

const KIND_ORDER: Record<string, number> = { ERROR_CODE: 0, PROCEDURE: 1, SETTING: 2, SPEC: 3 };

/**
 * Database-only lookup -- no AI. A query that looks like a code is matched
 * exactly against the codes printed in the manuals, tolerating punctuation,
 * case, leading zeros and a missing letter prefix ("35" finds "E:35"). Every
 * query is also matched as words against titles and descriptions.
 */
export async function lookupEntries(query: string, scope: Prisma.ManualDocumentWhereInput, limit = 30): Promise<ManualEntryResult[]> {
  const q = query.trim();
  if (!q) return [];
  const results: ManualEntryResult[] = [];
  const seen = new Set<string>();

  const key = codeKey(q);
  const looksLikeCode = key.length > 0 && key.length <= 10 && q.split(/\s+/).length <= 2;
  if (looksLikeCode) {
    const digits = key.match(/(\d+)$/)?.[1]?.replace(/^0+(?=\d)/, "");
    const candidates = await prisma.manualEntry.findMany({
      where: {
        manual: scope,
        OR: [{ codeKey: key }, ...(digits ? [{ codeKey: { endsWith: digits } }] : [])],
      },
      select: entrySelect,
      take: 200,
    });
    const loose = digits ? new RegExp(`^[A-Z]{0,4}0*${digits}$`) : null;
    const exact = candidates.filter((e) => e.codeKey === key);
    const near = candidates.filter((e) => e.codeKey !== key && loose && e.codeKey && loose.test(e.codeKey));
    for (const e of [...exact, ...near]) {
      seen.add(e.id);
      results.push({ ...e, match: "code" });
    }
  }

  const terms = q.split(/\s+/).filter((t) => t.length >= 2).slice(0, 8);
  if (terms.length > 0) {
    const text = await prisma.manualEntry.findMany({
      where: {
        manual: scope,
        AND: terms.map((t) => ({
          OR: [
            { code: { contains: t, mode: "insensitive" as const } },
            { title: { contains: t, mode: "insensitive" as const } },
            { meaning: { contains: t, mode: "insensitive" as const } },
            { details: { contains: t, mode: "insensitive" as const } },
            { models: { contains: t, mode: "insensitive" as const } },
          ],
        })),
      },
      select: entrySelect,
      take: limit,
    });
    text.sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9));
    for (const e of text) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      results.push({ ...e, match: "text" });
    }
  }

  return results.slice(0, limit);
}
