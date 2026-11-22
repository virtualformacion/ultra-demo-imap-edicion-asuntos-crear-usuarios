import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {onRequest as update,FIXED_ADMIN} from '../functions/api/updateusers.js';
import {onRequest as login} from '../functions/api/login.js';
import {sessionCookie,authenticatedUser} from '../lib/user-auth.js';
import {parseUsers,encode64,decode64} from '../lib/users.js';
import {chooseResult} from '../lib/imap-mail.js';
import {consultHandler} from '../lib/consult-handler.js';
import {codeSubjects,linkSubjects} from '../lib/mail-rules.js';
import {encryptPassword} from '../lib/mailbox-vault.js';
const env={GITHUB_TOKEN:'fake',GITHUB_REPO:'owner/repo',MAILBOX_ENCRYPTION_KEY:'testing-key-'.repeat(6)};
const makeUser=(username='a')=>({username,password:'pass',expiresAt:'2099-01-01',emails:['target@gmail.com']});
const request=(body,cookie)=>new Request('https://site.test/api/test',{method:'POST',headers:cookie?{Cookie:cookie}:{},body:JSON.stringify(body)});
const message=(subject,extra={})=>({time:Date.now(),parsed:[{subject,to:[{address:'target@gmail.com'}],html:'<b>123456</b>',...extra}]});
test('Default all, per-user code/link restrictions, overlapping rules and forwarded/nested denial',async()=>{
 const first=codeSubjects[0],link=linkSubjects[0],url='https://www.netflix.com/password?g=secret';
 assert.equal((await chooseResult([message(first)],'target@gmail.com')).body,'<b>123456</b>');
 assert.equal(await chooseResult([message(first)],'target@gmail.com',[first]),null);
 assert.equal((await chooseResult([message(first)],'target@gmail.com',[])).body,'<b>123456</b>');
 assert.equal(await chooseResult([message(link,{text:url})],'target@gmail.com',[link]),null);
 assert.deepEqual(await chooseResult([message(link,{text:url})],'target@gmail.com',[]),{link:url});
 assert.equal(await chooseResult([message(first,{subject:'Reenvío',text:'Asunto: '+first})],'target@gmail.com',[first]),null);
 const nested=message(first);nested.parsed.push({subject:link,to:[{address:'target@gmail.com'}],text:url});
 assert.equal(await chooseResult([nested],'target@gmail.com',[link]),null);
 assert.equal(await chooseResult([message('Prefijo '+first)],'target@gmail.com',[first]),null);
});
test('GitHub permissions persist only in USERS, preserve other users and fields across edit/create and reject stale saves',async()=>{
 const original=globalThis.fetch;let users=[makeUser(),makeUser('b')],source='// keep\nconst USERS = '+JSON.stringify(users)+';\n// keep after',sha='1';
 globalThis.fetch=async(url,options)=>{
  assert.match(url,/owner\/repo\/contents\/script.js/);
  if(options.method==='PUT'){const b=JSON.parse(options.body);assert.equal(b.sha,sha);source=decode64(b.content);sha=String(+sha+1);return Response.json({commit:{sha}});}
  return Response.json({content:encode64(source),sha});
 };
 const call=async(action,payload,revision=sha,auth={adminUser:FIXED_ADMIN.username,adminPass:FIXED_ADMIN.password})=>update({env,request:request({...auth,action,payload,sha:revision})});
 try{
  assert.equal((await call('permissions',{username:'a',disabledSubjects:[codeSubjects[0]]},sha,{adminUser:'bad',adminPass:'bad'})).status,401);
  assert.equal((await call('permissions',{username:'a',disabledSubjects:[codeSubjects[0]]},'old')).status,409);
  assert.equal((await call('permissions',{username:'a',disabledSubjects:[codeSubjects[0]]})).status,200);
  users=parseUsers(source).users;assert.deepEqual(users[0].disabledSubjects,[codeSubjects[0]]);assert.deepEqual(users[1],makeUser('b'));assert.ok(source.endsWith('// keep after'));
  assert.equal((await call('edit',{username:'a',password:'changed'})).status,200);assert.deepEqual(parseUsers(source).users[0].disabledSubjects,[codeSubjects[0]]);
  assert.equal((await call('create',{...makeUser('c')})).status,200);assert.equal(parseUsers(source).users[2].disabledSubjects,undefined);
  assert.equal((await call('permissions',{username:'a',disabledSubjects:[]})).status,200);assert.deepEqual(parseUsers(source).users[0].disabledSubjects,[]);
 }finally{globalThis.fetch=original;}
});
test('Server sessions reject forged/expired cookies, expired/deleted users and changed passwords',async()=>{
 const original=globalThis.fetch;let users=[makeUser()];
 globalThis.fetch=async()=>Response.json({content:encode64('const USERS = '+JSON.stringify(users)+';')});
 try{
  assert.equal((await login({env,request:request({username:'a',password:'wrong'})})).status,401);
  const response=await login({env,request:request({username:'a',password:'pass'})});assert.equal(response.status,200);assert.match(response.headers.get('Set-Cookie'),/HttpOnly; Secure; SameSite=Strict/);
  const cookie=response.headers.get('Set-Cookie').split(';')[0];assert.equal((await authenticatedUser(request({},cookie),env)).username,'a');
  assert.equal(await authenticatedUser(request({},cookie+'x'),env),null);
  const old=(await sessionCookie(users[0],env,Date.now()-9*3600000)).split(';')[0];assert.equal(await authenticatedUser(request({},old),env),null);
  users[0].disabledSubjects=[codeSubjects[0]];assert.deepEqual((await authenticatedUser(request({},cookie),env)).disabledSubjects,[codeSubjects[0]]);
  users[0].password='different';assert.equal(await authenticatedUser(request({},cookie),env),null);
  users[0].password='pass';users[0].expiresAt='2000-01-01';assert.equal(await authenticatedUser(request({},cookie),env),null);
  users=[];assert.equal(await authenticatedUser(request({},cookie),env),null);
 }finally{globalThis.fetch=original;}
});
test('Consult endpoint enforces session, allowed addresses and latest permissions without deployment',async()=>{
 const original=globalThis.fetch;const user=makeUser(),box={id:'one',email:'one@gmail.com',active:1,password_encrypted:await encryptPassword('abcdefghijklmnop',env.MAILBOX_ENCRYPTION_KEY,'one')};
 globalThis.fetch=async url=>Response.json({content:encode64(url.includes('/script.js?')?'const USERS = '+JSON.stringify([user])+';':JSON.stringify({version:1,mailboxes:[box]}))});
 const cookie=(await sessionCookie(user,env)).split(';')[0];let reads=0;
 const read=async()=>{reads++;return {messages:[message(codeSubjects[0])]};};
 const query=(email='target@gmail.com',auth=cookie)=>consultHandler({env,request:request({email},auth)},read);
 try{
  assert.equal((await query(undefined,'')).status,401);assert.equal(reads,0);
  assert.equal((await query('other@gmail.com')).status,403);assert.equal(reads,0);
  assert.equal((await query()).status,200);user.disabledSubjects=[codeSubjects[0]];
  assert.equal((await query()).status,404);user.disabledSubjects=[];assert.equal((await query()).status,200);
 }finally{globalThis.fetch=original;}
});
