import { NextRequest,NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { command,fingerprint,workflowTokenValid } from "@/lib/compliance-workflow";
import { nextDueDate } from "@/lib/compliance";
class Conflict extends Error{}
export async function POST(req:NextRequest){
 if(!workflowTokenValid(req))return NextResponse.json({error:'Unauthorized'},{status:401});
 let p;try{p=command(await req.json());}catch{return NextResponse.json({error:'Invalid workflow command'},{status:400});}
 try{
 const result=await prisma.$transaction(async tx=>{
  const receipt=await tx.complianceWorkflowReceipt.findUnique({where:{eventId:p.event_id}});if(receipt){if(receipt.deadlineId!==p.record_id)throw new Conflict();return receipt.response;}
  const old=await tx.complianceDeadline.findUnique({where:{id:p.record_id}});
  if(!old||fingerprint(old)!==p.expected_fingerprint)throw new Conflict();
  if(old.workflowId&&old.workflowId!==p.obligation_id&&!(p.action==='bind'&&old.workflowPlaceholder&&old.workflowParentId===p.parent_obligation_id))throw new Conflict();
  if(old.workflowRevision>p.revision)throw new Conflict();let nextRecordId:string|null=null;
  if(p.action==='bind'){
   if(old.status==='completed'||old.status==='cancelled')throw new Conflict();
   if(p.assignee_id&&!await tx.user.findUnique({where:{id:p.assignee_id},select:{id:true}}))throw new Conflict();
   await tx.complianceDeadline.update({where:{id:old.id},data:{workflowId:p.obligation_id,workflowParentId:p.parent_obligation_id,workflowPlaceholder:false,workflowRevision:p.revision,workflowOwnerName:p.owner_name,workflowAssigneeId:p.assignee_id,workflowEvidenceRequirements:p.evidence_requirements}});
  }else{
   if(old.workflowId!==p.obligation_id||old.workflowPlaceholder||p.revision<=old.workflowRevision||old.status==='completed'||old.status==='cancelled')throw new Conflict();
   await tx.complianceDeadline.update({where:{id:old.id},data:{status:'completed',completedDate:new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'}),workflowRevision:p.revision}});
   if(old.recurrence!=='none'){
    const child=await tx.complianceDeadline.upsert({where:{parentId:old.id},update:{},create:{title:old.title,notes:old.notes,dueDate:nextDueDate(old.dueDate,old.recurrence),deadlineType:old.deadlineType,recurrence:old.recurrence,parentId:old.id,workflowId:p.obligation_id,workflowParentId:p.obligation_id,workflowPlaceholder:true,workflowOwnerName:p.owner_name,workflowAssigneeId:p.assignee_id,workflowEvidenceRequirements:p.evidence_requirements}});
    nextRecordId=child.id;
   }
  }
  const response={status:'applied',event_id:p.event_id,obligation_id:p.obligation_id,next_record_id:nextRecordId};
  await tx.complianceWorkflowReceipt.create({data:{eventId:p.event_id,deadlineId:p.record_id,response}});return response;
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});return NextResponse.json(result);
 }catch(e){if(e instanceof Conflict)return NextResponse.json({error:'source_changed',message:'The deadline or assignment changed. Review it before retrying.'},{status:409});if(e instanceof Prisma.PrismaClientKnownRequestError&&['P2034','P2002'].includes(e.code))return NextResponse.json({error:'retry_command',message:'A concurrent update is being applied. Retry the same command.'},{status:503});throw e;}
}
