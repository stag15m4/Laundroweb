import { PrismaClient, Role, MachineType, MachineStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const ownerPassword = await bcrypt.hash("owner1234", 12);
  const owner = await prisma.user.upsert({
    where: { email: "owner@laundromat.local" },
    update: {},
    create: {
      name: "Owner",
      email: "owner@laundromat.local",
      password: ownerPassword,
      role: Role.OWNER,
    },
  });

  const staffPassword = await bcrypt.hash("staff1234", 12);
  await prisma.user.upsert({
    where: { email: "staff@laundromat.local" },
    update: {},
    create: {
      name: "Staff",
      email: "staff@laundromat.local",
      password: staffPassword,
      role: Role.STAFF,
    },
  });

  const washers = [
    { name: "Washer 1", serialNumber: "W-001" },
    { name: "Washer 2", serialNumber: "W-002" },
    { name: "Washer 3", serialNumber: "W-003" },
    { name: "Washer 4", serialNumber: "W-004" },
  ];

  const dryers = [
    { name: "Dryer 1", serialNumber: "D-001" },
    { name: "Dryer 2", serialNumber: "D-002" },
    { name: "Dryer 3", serialNumber: "D-003" },
    { name: "Dryer 4", serialNumber: "D-004" },
  ];

  for (const w of washers) {
    await prisma.machine.upsert({
      where: { serialNumber: w.serialNumber },
      update: {},
      create: {
        name: w.name,
        type: MachineType.WASHER,
        brand: "Huebsch",
        serialNumber: w.serialNumber,
        status: MachineStatus.OPERATIONAL,
      },
    });
  }

  for (const d of dryers) {
    await prisma.machine.upsert({
      where: { serialNumber: d.serialNumber },
      update: {},
      create: {
        name: d.name,
        type: MachineType.DRYER,
        brand: "Huebsch",
        serialNumber: d.serialNumber,
        status: MachineStatus.OPERATIONAL,
      },
    });
  }

  await prisma.vendingProduct.createMany({
    skipDuplicates: true,
    data: [
      { name: "Tide Pods (1pk)", category: "Detergent", price: 1.50, costPerUnit: 0.40, currentStock: 20, minimumStock: 10 },
      { name: "Dryer Sheet (2pk)", category: "Softener", price: 0.75, costPerUnit: 0.15, currentStock: 30, minimumStock: 15 },
      { name: "Bleach Packet", category: "Detergent", price: 1.00, costPerUnit: 0.25, currentStock: 15, minimumStock: 10 },
      { name: "Fabric Softener Packet", category: "Softener", price: 1.00, costPerUnit: 0.30, currentStock: 10, minimumStock: 8 },
    ],
  });

  await prisma.setting.upsert({
    where: { key: "unifi_protect_url" },
    update: {},
    create: { key: "unifi_protect_url", value: "" },
  });

  await prisma.setting.upsert({
    where: { key: "business_name" },
    update: {},
    create: { key: "business_name", value: "My Laundromat" },
  });

  console.log("Seed complete. Owner:", owner.email);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
