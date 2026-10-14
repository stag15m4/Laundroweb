import { NextRequest,NextResponse } from "next/server";
import { verifyComplianceToken } from "@/lib/compliance-auth";
import { prisma } from "@/lib/prisma";
export async function GET(req:NextRequest){
 if(!verifyComplianceToken(req))return NextResponse.json({error:'Unauthorized'},{status:401});
 if(req.nextUrl.searchParams.get('tenant_id')!=='laundroweb')return NextResponse.json({error:'Business not authorized'},{status:403});
 return NextResponse.json({business_id:'laundroweb',people:await prisma.user.findMany({select:{id:true,name:true},orderBy:{name:'asc'}})},{headers:{'Cache-Control':'no-store'}});
}
