import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Number inputs arrive as strings from the form. Prisma rejects a string for
 * an Int column with a validation error, which surfaces as a 500 — a save that
 * looks like it simply does nothing.
 */
function toInt(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toDecimal(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const products = await prisma.vendingProduct.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { sales: true, restocks: true } },
    },
  });
  return NextResponse.json(products);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();

  if (body._action === "sale") {
    const product = await prisma.vendingProduct.findUnique({ where: { id: body.productId } });
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const [sale] = await prisma.$transaction([
      prisma.vendingSale.create({
        data: {
          productId: body.productId,
          quantity: toInt(body.quantity, 0),
          revenue: Number(product.price) * toInt(body.quantity, 0),
          date: new Date(body.date),
        },
      }),
      prisma.vendingProduct.update({
        where: { id: body.productId },
        data: { currentStock: { decrement: toInt(body.quantity, 0) } },
      }),
    ]);
    return NextResponse.json(sale, { status: 201 });
  }

  if (body._action === "restock") {
    const [restock] = await prisma.$transaction([
      prisma.vendingRestock.create({
        data: {
          productId: body.productId,
          quantity: toInt(body.quantity, 0),
          cost: toDecimal(body.cost),
          date: new Date(body.date),
          supplier: body.supplier || null,
        },
      }),
      prisma.vendingProduct.update({
        where: { id: body.productId },
        data: { currentStock: { increment: toInt(body.quantity, 0) } },
      }),
    ]);
    return NextResponse.json(restock, { status: 201 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const price = toDecimal(body.price);

  if (!name) {
    return NextResponse.json({ error: "Product name is required." }, { status: 400 });
  }
  if (price === null) {
    return NextResponse.json({ error: "Sell price must be a number." }, { status: 400 });
  }

  const product = await prisma.vendingProduct.create({
    data: {
      name,
      category: body.category,
      price,
      costPerUnit: toDecimal(body.costPerUnit),
      currentStock: toInt(body.currentStock, 0),
      minimumStock: toInt(body.minimumStock, 5),
    },
  });
  return NextResponse.json(product, { status: 201 });
}
