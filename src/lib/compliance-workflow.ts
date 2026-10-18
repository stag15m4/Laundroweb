import { createHash,createHmac,timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
export function workflowTokenValid(req:NextRequest){
 const token=process.env.COMPLIANCE_WORKFLOW_TOKEN;const supplied=req.headers.get('x-compliance-workflow-token')||'';
 if(!token||!supplied)return false;const mac=(v:string)=>createHmac('sha256','compliance-workflow').update(v).digest();return timingSafeEqual(mac(token),mac(supplied));
}
export function fingerprint(row:{title:string;dueDate:string;notes:string|null;recurrence:string}){
 return createHash('sha256').update(JSON.stringify([row.title,row.dueDate,row.notes||'',row.recurrence||'none'])).digest('hex');
}
export type WorkflowCommand={version:number;event_id:string;obligation_id:string;parent_obligation_id?:string|null;revision:number;action:'bind'|'verify';tenant_id:string;record_id:string;expected_fingerprint:string;owner_name:string;assignee_id:string|null;evidence_requirements:string;};
export function command(body:unknown):WorkflowCommand{
 if(!body||typeof body!=='object')throw new Error('Invalid workflow command');const b=body as Record<string,unknown>;
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const string=(key:string,min:number,max:number)=>typeof b[key]==='string'&&(b[key] as string).length>=min&&(b[key] as string).length<=max;
 if(b.version!==1||!string('event_id',36,36)||!uuid.test(b.event_id as string)||!string('obligation_id',36,36)||!uuid.test(b.obligation_id as string)||!Number.isInteger(b.revision)||Number(b.revision)<1||!['bind','verify'].includes(b.action as string)||b.tenant_id!=='laundroweb'||!string('record_id',1,200)||!string('expected_fingerprint',64,64)||!/^[a-f0-9]{64}$/.test(b.expected_fingerprint as string)||!string('owner_name',1,200)||!string('evidence_requirements',3,4000)||(b.assignee_id!==null&&!string('assignee_id',1,200))||(b.parent_obligation_id!=null&&!uuid.test(String(b.parent_obligation_id))))throw new Error('Invalid workflow command');
 return b as WorkflowCommand;
}
