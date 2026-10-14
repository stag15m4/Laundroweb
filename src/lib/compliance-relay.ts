import { NextRequest,NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
export async function workIdentity(req?:NextRequest){
 const session=await getServerSession(authOptions);const id=(session?.user as {id?:string}|undefined)?.id;
 if(!id)return null;const user=await prisma.user.findUnique({where:{id},select:{id:true,name:true}});if(!user)return null;
 if(req&&req.headers.get('origin')!==new URL(process.env.NEXTAUTH_URL||req.url).origin)return null;
 return {tenant_id:'laundroweb',actor_id:user.id,actor_name:user.name};
}
export async function relay(path:string,identity:Record<string,string>,body?:Record<string,unknown>){
 const base=process.env.LEGAL_COMPLIANCE_URL,token=process.env.LEGAL_COMPLIANCE_RELAY_TOKEN;
 if(!base||!token)throw new Error('Compliance submission unavailable');const url=new URL(base);if(url.protocol!=='https:'||url.username||url.password)throw new Error('Invalid compliance hub');
 const target=new URL('/api/compliance/relay'+path,url);if(!body)for(const [k,v] of Object.entries(identity))target.searchParams.set(k,v);
 return fetch(target,{method:body?'POST':'GET',headers:{'X-Compliance-Relay-Token':token,'Content-Type':'application/json'},body:body?JSON.stringify({...body,...identity}):undefined,redirect:'error',signal:AbortSignal.timeout(20000),cache:'no-store'});
}
export function unavailable(){return NextResponse.json({error:'Compliance duties are temporarily unavailable. Completion has not been recorded.'},{status:503});}
