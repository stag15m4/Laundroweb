/**
 * Reports, and optionally removes, the demo records created by prisma/seed.ts.
 *
 * The base seed creates two accounts (owner@laundromat.local,
 * staff@laundromat.local) and eight placeholder machines named "Washer 1"…
 * "Dryer 4". Those machines carry no model number, so they never appear on the
 * Pricing page — but they are counted everywhere else, including the divisor
 * for turns per day. This script says definitively whether any of them are
 * still present.
 *
 *   npx tsx prisma/cleanup-seed-data.ts            # report only, changes nothing
 *   npx tsx prisma/cleanup-seed-data.ts --delete   # remove what it found
 *
 * Nothing is deleted without --delete. Run the report first and read it.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SEED_EMAILS = ["owner@laundromat.local", "staff@laundromat.local"];
const SEED_SERIALS = [
  "W-001", "W-002", "W-003", "W-004",
  "D-001", "D-002", "D-003", "D-004",
];

const apply = process.argv.includes("--delete");

async function main() {
  console.log(apply ? "Mode: DELETE\n" : "Mode: report only (pass --delete to act)\n");

  // ── Accounts ───────────────────────────────────────────────────────────
  const users = await prisma.user.findMany({
    where: { email: { in: SEED_EMAILS } },
    select: { id: true, name: true, email: true, role: true },
  });
  const totalOwners = await prisma.user.count({ where: { role: "OWNER" } });

  console.log(`Seed accounts found: ${users.length}`);
  for (const u of users) console.log(`  ${u.email}  (${u.role})`);

  // Removing the last owner would lock everyone out of the dashboard.
  const owners = users.filter((u) => u.role === "OWNER");
  const wouldStrandAccount = owners.length > 0 && owners.length >= totalOwners;
  if (wouldStrandAccount) {
    console.log(
      `  ! Skipping the owner account: it is the only OWNER on the system.\n` +
        `    Create your own owner account first, then re-run.`
    );
  }

  const deletableUsers = users.filter((u) => u.role !== "OWNER" || !wouldStrandAccount);

  // ── Machines ───────────────────────────────────────────────────────────
  const machines = await prisma.machine.findMany({
    where: { serialNumber: { in: SEED_SERIALS } },
    select: {
      id: true, name: true, serialNumber: true, type: true, status: true,
      _count: {
        select: {
          maintenanceLogs: true, revenueEntries: true,
          maintenanceSchedules: true, vendingSlots: true, noteEntries: true,
        },
      },
    },
  });

  console.log(`\nSeed machines found: ${machines.length}`);

  // A placeholder that has history is not a placeholder — somebody used it.
  const inUse: typeof machines = [];
  const deletableMachines: typeof machines = [];
  for (const m of machines) {
    const history =
      m._count.maintenanceLogs + m._count.revenueEntries +
      m._count.maintenanceSchedules + m._count.vendingSlots + m._count.noteEntries;
    console.log(`  ${m.name} (${m.serialNumber}) — ${history} related record${history === 1 ? "" : "s"}`);
    if (history > 0) inUse.push(m);
    else deletableMachines.push(m);
  }
  if (inUse.length > 0) {
    console.log(
      `  ! ${inUse.length} of these have history attached and will be left alone.\n` +
        `    Delete those from Equipment if you are sure.`
    );
  }

  if (users.length === 0 && machines.length === 0) {
    console.log("\nNothing to clean up. The database has no seed leftovers.");
    return;
  }

  if (!apply) {
    console.log(
      `\nWould delete ${deletableUsers.length} account(s) and ` +
        `${deletableMachines.length} machine(s). Re-run with --delete to do it.`
    );
    return;
  }

  // ── Deletion ───────────────────────────────────────────────────────────
  for (const u of deletableUsers) {
    // Detach authored records explicitly rather than relying on the schema's
    // referential action, so the delete cannot fail on a foreign key.
    await prisma.$transaction([
      prisma.note.updateMany({ where: { authorId: u.id }, data: { authorId: null } }),
      prisma.incident.updateMany({ where: { reportedById: u.id }, data: { reportedById: null } }),
      prisma.user.delete({ where: { id: u.id } }),
    ]);
    console.log(`Deleted account ${u.email}`);
  }

  for (const m of deletableMachines) {
    await prisma.machine.delete({ where: { id: m.id } });
    console.log(`Deleted machine ${m.name} (${m.serialNumber})`);
  }

  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
