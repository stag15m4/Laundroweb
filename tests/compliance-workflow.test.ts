import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { command,fingerprint,workflowTokenValid } from '../src/lib/compliance-workflow';
test('workflow fingerprint follows the shared Unicode/date contract',()=>{
 const contract=JSON.parse(readFileSync('docs/compliance-workflow-v1.json','utf8'));
 for(const row of contract.fingerprints)assert.equal(fingerprint({...row,dueDate:row.due_date}),row.fingerprint);
});
test('workflow rejects anonymous/read credentials and malformed scope or identity',()=>{
 process.env.COMPLIANCE_WORKFLOW_TOKEN='ci-write-key';
 assert.equal(workflowTokenValid(new NextRequest('https://source.example',{headers:{'X-Compliance-Token':'ci-write-key'}})),false);
 assert.equal(workflowTokenValid(new NextRequest('https://source.example',{headers:{'X-Compliance-Workflow-Token':'wrong'}})),false);
 assert.equal(workflowTokenValid(new NextRequest('https://source.example',{headers:{'X-Compliance-Workflow-Token':'ci-write-key'}})),true);
 const payload={version:1,event_id:'10000000-0000-4000-8000-000000000001',obligation_id:'10000000-0000-4000-8000-000000000002',revision:1,action:'bind',tenant_id:'laundroweb',record_id:'deadline-1',expected_fingerprint:'a'.repeat(64),owner_name:'Owner',assignee_id:null,evidence_requirements:'Receipt'};
 assert.equal(command(payload).action,'bind');
 for(const delta of [{tenant_id:'other'},{revision:0},{action:'complete'},{expected_fingerprint:'wrong'},{event_id:'bad'},{parent_obligation_id:'bad'}])assert.throws(()=>command({...payload,...delta}));
 delete process.env.COMPLIANCE_WORKFLOW_TOKEN;
});
