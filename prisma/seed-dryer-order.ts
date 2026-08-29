import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Physical line order: D45-1 (start) → D20-16 (end)
const ORDER = [
  "D45-1", "D45-2", "D45-3", "D45-4",
  "D30-5",  "D30-6",  "D30-7",  "D30-8",
  "D30-9",  "D30-10", "D30-11", "D30-12",
  "D20-13", "D20-14", "D20-15", "D20-16",
];

async function main() {
  console.log("Setting dryer floor order…");
  for (let i = 0; i < ORDER.length; i++) {
    const name = ORDER[i];
    const machine = await prisma.machine.findFirst({ where: { name } });
    if (machine) {
      await prisma.machine.update({ where: { id: machine.id }, data: { floorOrder: i } });
      console.log(`  ✓ ${name} → position ${i}`);
    } else {
      console.log(`  ✗ ${name} not found in DB`);
    }
  }
  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
