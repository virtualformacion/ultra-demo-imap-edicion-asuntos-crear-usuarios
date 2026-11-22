import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {subjectsHandler} from '../lib/subjects-handler.js';
import {inspectRules} from '../lib/subjects-store.js';
import {encode64,decode64} from '../lib/users.js';
import {FIXED_ADMIN} from '../lib/admin-auth.js';
test('Admin DOM integration: list, bulk-add, edit, delete, conflict, publication status and logout',async()=>{
 const html=await readFile(new URL('../admin.html',import.meta.url),'utf8');
 const script=await readFile(new URL('../subjects-admin.js',import.meta.url),'utf8');
 const {document,window}=parseHTML(html);window.HTMLElement.prototype.focus=function(){};
 const originalFetch=globalThis.fetch;let source=await readFile(new URL('../lib/mail-rules.js',import.meta.url),'utf8'),revision=1,writes=0;
 const initialCount=inspectRules(source).subjects.length;
 const env={GITHUB_TOKEN:'fake',GITHUB_REPO:'virtualformacion/going-merry',GITHUB_BRANCH:'main'};
 globalThis.fetch=async(url,options)=>{
  if(options.method==='PUT'){const b=JSON.parse(options.body);assert.equal(b.sha,'s'+revision);source=decode64(b.content);revision++;writes++;return Response.json({commit:{sha:'s'+revision}});}
  return Response.json({content:encode64(source),sha:'s'+revision});
 };
 window.getMailboxAdmin=()=>({adminUser:FIXED_ADMIN.username,adminPass:FIXED_ADMIN.password});
 const fetch=async(url,options)=>{assert.equal(url,'/api/subjects');return subjectsHandler({env,request:new Request('https://example.com'+url,options)});};
 vm.runInNewContext(script,{window,document,fetch,confirm:()=>true});
 const el=id=>document.getElementById(id);
 async function click(button){button.dispatchEvent(new window.Event('click'));for(let i=0;i<30;i++){await new Promise(setImmediate);if(!el('addSubjects').disabled)return;}throw new Error('UI did not finish');}
 const findRow=text=>[...el('subjectsRows').children].find(tr=>tr.firstElementChild.textContent===text);
 try{
  await window.loadSubjects();assert.equal(el('subjectsRows').children.length,initialCount);assert.match(el('subjectsPublishState').textContent,/coincide/);
  el('subjectsInput').value='"Nuevo, con coma";Otro\nTercero;Otro';await click(el('addSubjects'));
  assert.equal(el('subjectsRows').children.length,initialCount+3);assert.equal(writes,1);assert.match(el('subjectsMsg').textContent,/Agregados: 3/);assert.match(el('subjectsPublishState').textContent,/pendientes/);
  let row=findRow('Otro');await click([...row.querySelectorAll('button')].find(b=>b.textContent==='Editar'));
  const edited='Asunto con "comillas" y 🟢';row.querySelector('input').value=edited;await click([...row.querySelectorAll('button')].find(b=>b.textContent==='Guardar'));
  assert.ok(inspectRules(source).subjects.includes(edited));row=findRow(edited);await click([...row.querySelectorAll('button')].find(b=>b.textContent==='Eliminar'));assert.ok(!inspectRules(source).subjects.includes(edited));
  revision++;el('subjectsInput').value='No sobrescribir';await click(el('addSubjects'));assert.match(el('subjectsMsg').textContent,/cambiaron/);assert.equal(el('subjectsInput').value,'No sobrescribir');assert.ok(!inspectRules(source).subjects.includes('No sobrescribir'));
  await click(el('refreshSubjects'));await click(el('addSubjects'));assert.ok(inspectRules(source).subjects.includes('No sobrescribir'));
  await click(el('btnLogout'));assert.equal(el('subjectsRows').children.length,0);assert.equal(el('subjectsInput').value,'');
 }finally{globalThis.fetch=originalFetch;}
});
