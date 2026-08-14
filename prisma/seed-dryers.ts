import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Stacked units: each pair of drums is one physical unit sharing a model number.
// Serial numbers get a -1/-2 suffix to satisfy the unique constraint while
// keeping the relationship to the physical unit's actual serial obvious.
const dryers = [
  // 45 lb stacked — unit 1 (drums 1 & 2) — HTT45NKCG2G2N05
  { name: "D45-1", model: "HTT45NKCG2G2N05", serialNumber: "1704049070-1" },
  { name: "D45-2", model: "HTT45NKCG2G2N05", serialNumber: "1704049070-2" },
  // 45 lb stacked — unit 2 (drums 3 & 4) — HTT45NKCG2G2N05
  { name: "D45-3", model: "HTT45NKCG2G2N05", serialNumber: "1704049071-1" },
  { name: "D45-4", model: "HTT45NKCG2G2N05", serialNumber: "1704049071-2" },
  // 30 lb stacked — unit 3 (drums 5 & 6)
  { name: "D30-5",  model: "HTT30NKCB2G2N04", serialNumber: "1704049138-1" },
  { name: "D30-6",  model: "HTT30NKCB2G2N04", serialNumber: "1704049138-2" },
  // 30 lb stacked — unit 4 (drums 7 & 8)
  { name: "D30-7",  model: "HTT30NKCB2G2N04", serialNumber: "1704049143-1" },
  { name: "D30-8",  model: "HTT30NKCB2G2N04", serialNumber: "1704049143-2" },
  // 30 lb stacked — unit 5 (drums 9 & 10)
  { name: "D30-9",  model: "HTT30NKCB2G2N04", serialNumber: "1704049139-1" },
  { name: "D30-10", model: "HTT30NKCB2G2N04", serialNumber: "1704049139-2" },
  // 30 lb stacked — unit 6 (drums 11 & 12)
  { name: "D30-11", model: "HTT30NKCB2G2N04", serialNumber: "1704049140-1" },
  { name: "D30-12", model: "HTT30NKCB2G2N04", serialNumber: "1704049140-2" },
  // 20 lb stacked — unit 7 (drums 13 & 14)
  { name: "D20-13", model: "HTT20NKCB2G2N04", serialNumber: "1704049142-1" },
  { name: "D20-14", model: "HTT20NKCB2G2N04", serialNumber: "1704049142-2" },
  // 20 lb stacked — unit 8 (drums 15 & 16)
  { name: "D20-15", model: "HTT20NKCB2G2N04", serialNumber: "1704049141-1" },
  { name: "D20-16", model: "HTT20NKCB2G2N04", serialNumber: "1704049141-2" },
];

async function main() {
  console.log("Seeding dryers…");
  for (const d of dryers) {
    const existing = await prisma.machine.findFirst({ where: { name: d.name } });
    if (existing) {
      await prisma.machine.update({
        where: { id: existing.id },
        data: { type: "DRYER", brand: "Huebsch", model: d.model, serialNumber: d.serialNumber },
      });
      console.log(`  ✓ Updated  ${d.name}  →  ${d.serialNumber}`);
    } else {
      await prisma.machine.create({
        data: {
          name: d.name,
          type: "DRYER",
          brand: "Huebsch",
          model: d.model,
          serialNumber: d.serialNumber,
          status: "OPERATIONAL",
        },
      });
      console.log(`  + Created  ${d.name}  →  ${d.serialNumber}`);
    }
  }
  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
