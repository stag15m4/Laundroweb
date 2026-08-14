import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const washers = [
  // 60 lb — HCN060KCFX02004
  { name: "W60-1", model: "HCN060KCFX02004", serialNumber: "1704057991" },
  { name: "W60-2", model: "HCN060KCFX02004", serialNumber: "1704057992" },
  // 30 lb — HCN030KCFX03003
  { name: "W30-1", model: "HCN030KCFX03003", serialNumber: "1704058046" },
  { name: "W30-2", model: "HCN030KCFX03003", serialNumber: "1704058048" },
  { name: "W30-3", model: "HCN030KCFX03003", serialNumber: "1704058049" },
  { name: "W30-4", model: "HCN030KCFX03003", serialNumber: "1704058050" },
  { name: "W30-5", model: "HCN030KCFX03003", serialNumber: "1704058051" },
  { name: "W30-6", model: "HCN030KCFX03003", serialNumber: "1704059047" },
  // 20 lb — HCN020KCFX03003
  { name: "W20-1", model: "HCN020KCFX03003", serialNumber: "1704059303" },
  { name: "W20-2", model: "HCN020KCFX03003", serialNumber: "1704054364" },
  { name: "W20-3", model: "HCN020KCFX03003", serialNumber: "1704054362" },
  { name: "W20-4", model: "HCN020KCFX03003", serialNumber: "1704054360" },
  { name: "W20-5", model: "HCN020KCFX03003", serialNumber: "1704054361" },
];

async function main() {
  console.log("Seeding washers…");
  for (const w of washers) {
    const existing = await prisma.machine.findFirst({ where: { name: w.name } });
    if (existing) {
      await prisma.machine.update({
        where: { id: existing.id },
        data: { type: "WASHER", brand: "Huebsch", model: w.model, serialNumber: w.serialNumber },
      });
      console.log(`  ✓ Updated  ${w.name}  →  ${w.serialNumber}`);
    } else {
      await prisma.machine.create({
        data: {
          name: w.name,
          type: "WASHER",
          brand: "Huebsch",
          model: w.model,
          serialNumber: w.serialNumber,
          status: "OPERATIONAL",
        },
      });
      console.log(`  + Created  ${w.name}  →  ${w.serialNumber}`);
    }
  }
  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
