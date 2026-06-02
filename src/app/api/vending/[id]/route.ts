import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const product = await prisma.vendingProduct.update({
    where: { id },
    data: {
      name: body.name,
      category: body.category,
      price: Number(body.price),
      costPerUnit: body.costPerUnit ? Number(body.costPerUnit) : null,
      minimumStock: body.minimumStock,
      active: body.active,
    },
  });
  return NextResponse.json(product);
}
