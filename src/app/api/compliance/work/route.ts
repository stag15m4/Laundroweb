import { NextResponse } from "next/server";
import { workIdentity,relay,unavailable } from "@/lib/compliance-relay";
export async function GET(){
 const identity=await workIdentity();if(!identity)return NextResponse.json({error:'Unauthorized'},{status:401});
 if(!process.env.LEGAL_COMPLIANCE_RELAY_TOKEN)return NextResponse.json({duties:[],configured:false});
 try{const response=await relay('/work',identity);return NextResponse.json(await response.json(),{status:response.status,headers:{'Cache-Control':'no-store'}});}catch{return unavailable();}
}
