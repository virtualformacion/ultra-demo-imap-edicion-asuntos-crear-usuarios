import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('Actual admin table dropdown: defaults, individual checkboxes, save, reload and bulk selection',async()=>{
 const html=await readFile(new URL('../admin.html',import.meta.url),'utf8');
 const {window}=parseHTML(html);const context=vm.createContext(window);
 const users=[{username:'alice',password:'a',expiresAt:'2099-01-01',emails:[]},{username:'bob',password:'b',expiresAt:'2099-01-01',emails:[],disabledSubjects:['Código B']}];let sha='1',writes=0;
 window.fetch=async(url,options)=>{
  const b=JSON.parse(options.body);
  if(url==='/api/subjects')return Response.json({subjects:['Código A','Código B'],linkSubjects:['Enlace C']});
  if(b.action==='permissions'){assert.equal(b.sha,sha);users.find(u=>u.username===b.payload.username).disabledSubjects=b.payload.disabledSubjects;sha=''+(+sha+1);writes++;return Response.json({success:true});}
  return Response.json({users:structuredClone(users),sha});
 };
 vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
 vm.runInContext(await readFile(new URL('../user-permissions.js',import.meta.url),'utf8'),context);
 window.renderUsers(users);
 assert.equal(window.document.querySelectorAll('#usersTable th').length,6);
 const open=async index=>{const d=window.document.querySelectorAll('#usersTable details')[index];d.open=true;d.dispatchEvent(new window.Event('toggle'));await tick();await tick();return d;};
 let a=await open(0),checks=[...a.querySelectorAll('input')];assert.equal(checks.length,3);assert.ok(checks.every(x=>x.checked));
 checks[1].checked=false;const buttons=[...a.querySelectorAll('button')];buttons.find(x=>x.textContent==='Guardar permisos').click();await tick();await tick();assert.equal(writes,1);assert.deepEqual(Array.from(users[0].disabledSubjects),['Código B']);assert.match(a.textContent,/2 de 3 habilitados/);
 const b=await open(1);assert.deepEqual([...b.querySelectorAll('input')].map(x=>x.checked),[true,false,true]);
 window.renderUsers(users);a=await open(0);assert.deepEqual([...a.querySelectorAll('input')].map(x=>x.checked),[true,false,true]);
 [...a.querySelectorAll('button')].find(x=>x.textContent==='Habilitar todos').click();assert.ok([...a.querySelectorAll('input')].every(x=>x.checked));
 [...a.querySelectorAll('button')].find(x=>x.textContent==='Deshabilitar todos').click();assert.ok([...a.querySelectorAll('input')].every(x=>!x.checked));
});
