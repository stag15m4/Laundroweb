
import { NextRequest } from "next/server";
import { read, write, respond } from "@/lib/wdf-server";
export const dynamic = "force-dynamic";
export function GET(req: NextRequest) { return respond(() => read(req)); }
export function POST(req: NextRequest) { return respond(() => write(req)); }
