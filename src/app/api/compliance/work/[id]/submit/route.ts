import { NextRequest,NextResponse } from "next/server";
import { workIdentity,relay,unavailable } from "@/lib/compliance-relay";
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const identity=await workIdentity(req);if(!identity)return NextResponse.json({error:'Unauthorized or invalid request origin'},{status:401});
 try{const {id}=await params;const body=await req.json();const response=await relay(`/work/${encodeURIComponent(id)}/submit`,identity,body);return NextResponse.json(await response.json(),{status:response.status});}catch{return unavailable();}
}
