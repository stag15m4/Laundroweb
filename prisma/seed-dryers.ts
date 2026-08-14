import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Stacked units: each pair of drum names shares one physical unit (same model + serial).
const dryers = [
  // 45 lb stacked — unit 1 (drums 1 & 2) — HTT45NKCG2G2N05
  { name: "D45-1", model: "HTT45NKCG2G2N05", serialNumber: "1704049070" },
  { name: "D45-2", model: "HTT45NKCG2G2N05", serialNumber: "1704049070" },
  // 45 lb stacked — unit 2 (drums 3 & 4) — HTT45NKCG2G2N05
  { name: "D45-3", model: "HTT45NKCG2G2N05", serialNumber: "1704049071" },
  { name: "D45-4", model: "HTT45NKCG2G2N05", serialNumber: "1704049071" },
  // 30 lb stacked — unit 3 (drums 5 & 6)
  { name: "D30-5",  model: "HTT30NKCB2G2N04", serialNumber: "1704049138" },
  { name: "D30-6",  model: "HTT30NKCB2G2N04", serialNumber: "1704049138" },
  // 30 lb stacked — unit 4 (drums 7 & 8)
  { name: "D30-7",  model: "HTT30NKCB2G2N04", serialNumber: "1704049143" },
  { name: "D30-8",  model: "HTT30NKCB2G2N04", serialNumber: "1704049143" },
  // 30 lb stacked — unit 5 (drums 9 & 10)
  { name: "D30-9",  model: "HTT30NKCB2G2N04", serialNumber: "1704049139" },
  { name: "D30-10", model: "HTT30NKCB2G2N04", serialNumber: "1704049139" },
  // 30 lb stacked — unit 6 (drums 11 & 12)
  { name: "D30-11", model: "HTT30NKCB2G2N04", serialNumber: "1704049140" },
  { name: "D30-12", model: "HTT30NKCB2G2N04", serialNumber: "1704049140" },
  // 20 lb stacked — unit 7 (drums 13 & 14)
  { name: "D20-13", model: "HTT20NKCB2G2N04", serialNumber: "1704049142" },
  { name: "D20-14", model: "HTT20NKCB2G2N04", serialNumber: "1704049142" },
  // 20 lb stacked — unit 8 (drums 15 & 16)
  { name: "D20-15", model: "HTT20NKCB2G2N04", serialNumber: "1704049141" },
  { name: "D20-16", model: "HTT20NKCB2G2N04", serialNumber: "1704049141" },
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
