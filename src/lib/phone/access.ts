import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function phoneUser(ownerOnly = false) {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, role: true },
  });
  return user && (!ownerOnly || user.role === "OWNER") ? user : null;
}
export const denied = () =>
  Response.json(
    { message: "Sign in with an authorized account." },
    { status: 403 },
  );
