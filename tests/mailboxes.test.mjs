import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mailboxHandler} from '../lib/mailbox-handler.js';
import {sessionCookie} from '../lib/user-auth.js';
import {consultHandler} from '../lib/consult-handler.js';
import {FIXED_ADMIN} from '../lib/admin-auth.js';
import {decode64,encode64} from '../lib/users.js';
const env={GITHUB_TOKEN:'fake',GITHUB_REPO:'virtualformacion/going-merry-cloudflare',GITHUB_BRANCH:'main',MAILBOX_ENCRYPTION_KEY:'test-key-'.repeat(8)};
const creds={adminUser:FIXED_ADMIN.username,adminPass:FIXED_ADMIN.password};
const req=(input,auth=creds)=>new Request('https://example.com/api/mailboxes',{method:'POST',body:JSON.stringify({...auth,...input})});
const plain='abcdefghijklmnop';
test('Mailbox GitHub CRUD: encrypted persistence, masked responses, edit password optional, activation, test, deletion and commit conflicts',async()=>{
 const original=globalThis.fetch;let doc={version:1,mailboxes:[]},revision=1,writes=0,probes=0,failProbe=false,conflict=false;
 globalThis.fetch=async(url,options)=>{
  assert.match(url,/repos\/virtualformacion\/going-merry-cloudflare\/contents\/mailboxes.json/);
  assert.equal(options.headers.Authorization,'Bearer fake');
  if(options.method==='PUT'){
   const b=JSON.parse(options.body);assert.equal(b.sha,'sha'+revision);assert.ok(!JSON.stringify(b).includes(plain));
   if(conflict)return new Response('{}',{status:409});
   const next=JSON.parse(decode64(b.content));assert.ok(!JSON.stringify(next).includes(plain));doc=next;revision++;writes++;return Response.json({commit:{sha:'sha'+revision}});
  }
  return Response.json({sha:'sha'+revision,content:encode64(JSON.stringify(doc))});
 };
 const probe=async(box,password)=>{probes++;assert.equal(password,plain);if(failProbe)throw new Error('server private '+plain);return {folder:'[Gmail]/All Mail'};};
 const call=async(action,payload,auth=creds)=>{const r=await mailboxHandler({request:req({action,payload},auth),env},probe);const data=await r.json();assert.ok(!JSON.stringify(data).includes(plain));return {status:r.status,data};};
 try{
  assert.equal((await call('list',null,{adminUser:'bad',adminPass:'bad'})).status,401);assert.equal(writes,0);
  assert.equal((await call('create',{email:'one@gmail.com',name:'Uno',appPassword:'abcd efgh ijkl mnop',active:true})).status,200);assert.equal(probes,1);assert.equal(writes,1);
  const id=doc.mailboxes[0].id;assert.ok(doc.mailboxes[0].password_encrypted);const encrypted=doc.mailboxes[0].password_encrypted;
  const listed=await call('list');assert.equal(listed.data.mailboxes.length,1);assert.equal(listed.data.mailboxes[0].password_encrypted,undefined);
  assert.equal((await call('create',{email:'one@gmail.com',appPassword:plain})).status,409);
  assert.equal((await call('edit',{id,name:'Renombrado',active:false})).status,200);assert.equal(doc.mailboxes[0].password_encrypted,encrypted);assert.equal(doc.mailboxes[0].active,0);
  assert.equal((await call('test',{id})).status,200);
  assert.equal((await call('edit',{id,email:'other@gmail.com'})).status,400);
  failProbe=true;const failed=await call('edit',{id,active:true});assert.equal(failed.status,500);assert.ok(!JSON.stringify(failed).includes('server private'));assert.equal(doc.mailboxes[0].active,0);failProbe=false;
  assert.equal((await call('edit',{id,active:true})).status,200);
  conflict=true;assert.equal((await call('delete',{id})).status,500);assert.equal(doc.mailboxes.length,1);conflict=false;
  assert.equal((await call('delete',{id})).status,200);assert.equal(doc.mailboxes.length,0);
 }finally{globalThis.fetch=original;}
});
test('Query works across active mailboxes, ignores disabled, keeps body/link output and surfaces partial failures',async()=>{
 const original=globalThis.fetch;
 const {encryptPassword}=await import('../lib/mailbox-vault.js');
 const doc={version:1,mailboxes:[]};
 for(const id of ['broken','good','inactive'])doc.mailboxes.push({id,email:id+'@gmail.com',active:id!=='inactive',password_encrypted:await encryptPassword(plain,env.MAILBOX_ENCRYPTION_KEY,id)});
 const user={username:'test',password:'test',expiresAt:'2099-01-01',emails:[]};
 const cookie=(await sessionCookie(user,env)).split(';')[0];
 globalThis.fetch=async url=>Response.json({sha:'x',content:encode64(url.includes('/script.js?')?'const USERS = '+JSON.stringify([user])+';':JSON.stringify(doc))});
 const query=()=>new Request('https://example.com/api/getLastEmail',{method:'POST',headers:{Cookie:cookie},body:JSON.stringify({email:'target@gmail.com'})});
 try{
  let seen=[];
  const r=await consultHandler({request:query(),env},async box=>{seen.push(box.id);if(box.id==='broken')throw new Error('offline');return {messages:[{time:Date.now(),parsed:[{to:[{address:'target@gmail.com'}],subject:'Tu código de acceso único para Disney+',html:'<p>123456</p>'}]}]};});
  assert.equal(r.status,200);assert.equal((await r.json()).body,'<p>123456</p>');assert.deepEqual(seen.sort(),['broken','good']);
  const failed=await consultHandler({request:query(),env},async()=>{throw new Error('offline');});assert.equal(failed.status,502);
  doc.mailboxes=[];assert.equal((await consultHandler({request:query(),env},()=>{})).status,503);
 }finally{globalThis.fetch=original;}
});
