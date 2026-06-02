import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
          quantity: body.quantity,
          revenue: Number(product.price) * body.quantity,
          date: new Date(body.date),
        },
      }),
      prisma.vendingProduct.update({
        where: { id: body.productId },
        data: { currentStock: { decrement: body.quantity } },
      }),
    ]);
    return NextResponse.json(sale, { status: 201 });
  }

  if (body._action === "restock") {
    const [restock] = await prisma.$transaction([
      prisma.vendingRestock.create({
        data: {
          productId: body.productId,
          quantity: body.quantity,
          cost: body.cost ? Number(body.cost) : null,
          date: new Date(body.date),
          supplier: body.supplier || null,
        },
      }),
      prisma.vendingProduct.update({
        where: { id: body.productId },
        data: { currentStock: { increment: body.quantity } },
      }),
    ]);
    return NextResponse.json(restock, { status: 201 });
  }

  const product = await prisma.vendingProduct.create({
    data: {
      name: body.name,
      category: body.category,
      price: Number(body.price),
      costPerUnit: body.costPerUnit ? Number(body.costPerUnit) : null,
      currentStock: body.currentStock ?? 0,
      minimumStock: body.minimumStock ?? 5,
    },
  });
  return NextResponse.json(product, { status: 201 });
}
