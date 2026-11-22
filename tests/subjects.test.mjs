import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parse} from 'acorn';
import {splitSubjects,inspectRules,replaceCodeSubjects,applySubjectsAction} from '../lib/subjects-store.js';
import {subjectsHandler} from '../lib/subjects-handler.js';
import {decode64,encode64} from '../lib/users.js';
import {FIXED_ADMIN} from '../lib/admin-auth.js';
const original=await readFile(new URL('../lib/mail-rules.js',import.meta.url),'utf8');
const credentials={adminUser:FIXED_ADMIN.username,adminPass:FIXED_ADMIN.password};
const env={GITHUB_TOKEN:'fake',GITHUB_REPO:'virtualformacion/going-merry',GITHUB_BRANCH:'main'};
test('Bulk formats: lines, CRLF, commas, semicolons, bullets, apostrophes and protected punctuation',()=>{
 assert.deepEqual(splitSubjects('Amazon\nNetflix\r\nDisney;HBO,ChatGPT'),['Amazon','Netflix','Disney','HBO','ChatGPT']);
 assert.deepEqual(splitSubjects('- Amazon\n• Netflix\n1. Disney'),['Amazon','Netflix','Disney']);
 assert.deepEqual(splitSubjects('"Amazon, código";"HBO; urgente";Il tuo codice d\'accesso'),['Amazon, código','HBO; urgente',"Il tuo codice d'accesso"]);
 assert.deepEqual(splitSubjects('["Uno, dos","Tres; cuatro","Unicode 🟢"]'),['Uno, dos','Tres; cuatro','Unicode 🟢']);
 assert.deepEqual(splitSubjects('"Dijo ""hola""",Otro'),['Dijo "hola"','Otro']);
 assert.throws(()=>splitSubjects('"No cerrado'));assert.throws(()=>splitSubjects(' ;\n'));
});
test('Replace only the codeSubjects initializer; retain link rules and all other source bytes',()=>{
 const source='// comentario español\n'+original+'\n// conservar el resto\n';
 const before=inspectRules(source),items=['Nuevo 🟢',"Il tuo d'accesso",'Comillas " y barra \\ ; , ] ; export const evil = true;'];
 const next=replaceCodeSubjects(source,items),after=inspectRules(next);
 assert.equal(next.slice(0,after.start),source.slice(0,before.start));assert.equal(next.slice(after.end),source.slice(before.end));assert.deepEqual(after.subjects,items);
 const tree=parse(next,{ecmaVersion:'latest',sourceType:'module'});assert.equal(tree.body.filter(n=>n.type==='ExportNamedDeclaration').length,2);
 assert.throws(()=>inspectRules('export const codeSubjects = [(()=>"x")()];'));
 assert.throws(()=>inspectRules('export const codeSubjects = ["x", ...other];'));
 assert.throws(()=>replaceCodeSubjects(source,['a\nb']));
});
test('Actions deduplicate new entries, preserve order, edit exact strings and delete without touching links',()=>{
 assert.deepEqual(applySubjectsAction(['Uno'],'add',{text:'Dos;Uno;Dos;Tres'}),{subjects:['Uno','Dos','Tres'],added:2,duplicates:2,changed:true});
 assert.equal(applySubjectsAction(['Uno'],'add',{text:'Uno;Uno'}).changed,false);
 assert.deepEqual(applySubjectsAction(['Uno','Dos'],'edit',{subject:'Dos',newSubject:'Dos, con coma'}).subjects,['Uno','Dos, con coma']);
 assert.throws(()=>applySubjectsAction(['Uno','Dos'],'edit',{subject:'Uno',newSubject:'Dos'}));
 assert.deepEqual(applySubjectsAction(['Uno'],'delete',{subject:'Uno'}).subjects,[]);
 assert.throws(()=>applySubjectsAction(['Uno'],'delete',{subject:'No existe'}));
});
test('Authenticated GitHub API CRUD, fresh SHA guards, duplicate no-op, UTF-8, pending deployment and content preservation',async()=>{
 const originalFetch=globalThis.fetch;let source=original,sha='sha1',puts=0,conflict=false,fetches=0;
 const suffix=source.slice(inspectRules(source).end);
 globalThis.fetch=async(url,options)=>{
  fetches++;assert.match(url,/repos\/virtualformacion\/going-merry\/contents\/lib\/mail-rules.js/);assert.equal(options.headers.Authorization,'Bearer fake');
  if(options.method==='PUT'){
   const body=JSON.parse(options.body);assert.equal(body.branch,'main');assert.equal(body.sha,sha);
   if(conflict)return new Response('{}',{status:409});
   source=decode64(body.content);sha='sha'+(++puts+1);assert.equal(source.slice(inspectRules(source).end),suffix);return Response.json({commit:{sha}});
  }
  return Response.json({content:encode64(source),sha});
 };
 const call=async(action,payload,revision=sha,auth=credentials)=>{
  const r=await subjectsHandler({env,request:new Request('https://example.com/api/subjects',{method:'POST',body:JSON.stringify({...auth,action,sha:revision,payload})})});return {status:r.status,data:await r.json()};
 };
 try{
  assert.equal((await call('list',null,null,{adminUser:'wrong',adminPass:'bad'})).status,401);assert.equal(fetches,0);
  const listed=await call('list');assert.equal(listed.data.pendingDeployment,false);assert.equal(listed.data.subjects.length,inspectRules(original).subjects.length);
  const add=await call('add',{text:'Nuevo 🟢;Otro;Nuevo 🟢'});assert.equal(add.status,200);assert.equal(add.data.added,2);assert.equal(puts,1);
  assert.equal((await call('list')).data.pendingDeployment,true);
  assert.equal((await call('add',{text:'Otro'})).data.changed,false);assert.equal(puts,1);
  assert.equal((await call('delete',{subject:'Otro'},'sha1')).status,409);assert.ok(inspectRules(source).subjects.includes('Otro'));
  assert.equal((await call('edit',{subject:'Otro',newSubject:'Editado, con coma'})).status,200);
  conflict=true;assert.equal((await call('delete',{subject:'Editado, con coma'})).status,409);conflict=false;
  assert.equal((await call('delete',{subject:'Editado, con coma'})).status,200);
  assert.equal((await call('delete',{subject:'Nuevo 🟢'})).status,200);
  assert.deepEqual(inspectRules(source).subjects,inspectRules(original).subjects);assert.equal(source.slice(inspectRules(source).end),suffix);
 }finally{globalThis.fetch=originalFetch;}
});
