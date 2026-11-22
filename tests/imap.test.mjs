import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ImapClient,quote} from '../lib/imap-protocol.js';
import {canonicalEmail,recipientMatches,chooseResult,readMailbox,collectMailboxes,parsedMessages} from '../lib/imap-mail.js';
import {encryptPassword,decryptPassword,appPassword} from '../lib/mailbox-vault.js';
import {codeSubjects,linkSubjects} from '../lib/mail-rules.js';
const enc=new TextEncoder();
const date=new Date().toUTCString();
function raw(subject,{to='test+uno@gmail.com',body='<p>Código 123456 🟢</p>',type='text/html',extra='',headers=''}={}){
 return `From: Service <service@example.com>\r\nTo: ${to}\r\nSubject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=\r\nDate: ${date}\r\nMIME-Version: 1.0\r\n${headers}Content-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n${extra}\r\n${Buffer.from(body).toString('base64')}\r\n`;
}
test('Every original subject and link still yields original API shape',async()=>{
 for(const subject of codeSubjects){const r=await chooseResult([{raw:enc.encode(raw(subject)),time:Date.now()}],'test+uno@gmail.com');assert.equal(r.alert,'Código de Disney+ encontrado');assert.match(r.body,/123456 🟢/);}
 for(const subject of linkSubjects)for(const url of ['https://www.netflix.com/account/travel/verify?nftoken=abc','https://www.netflix.com/account/update-primary-location?nftoken=abc','https://www.netflix.com/password?g=abc']){
  const r=await chooseResult([{raw:enc.encode(raw(subject,{body:url+']',type:'text/plain'})),time:Date.now()}],'test+uno@gmail.com');assert.equal(r.link,url);
 }
});
test('Gmail aliases retain +tags; forwarded recipient labels, delivery headers, quoted-printable and nested MIME',async()=>{
 assert.equal(canonicalEmail('t.e.s.t+uno@googlemail.com'),'test+uno@gmail.com');
 assert.notEqual(canonicalEmail('test+uno@gmail.com'),canonicalEmail('test+dos@gmail.com'));
 const forwarded=enc.encode(raw('Fwd: '+codeSubjects[0],{to:'destination@gmail.com',body:'---------- Forwarded message ---------\nPara: test+uno@gmail.com\nAsunto: '+codeSubjects[0]+'\nCódigo 123456',type:'text/plain'}));
 assert.ok(await chooseResult([{raw:forwarded,time:Date.now()}],'test+uno@gmail.com'));
 const htmlForward=enc.encode(raw('Fwd: '+codeSubjects[0],{to:'destination@gmail.com',body:'<div>Para: &lt;test+uno@gmail.com&gt;</div><div>Código 123456</div>'}));
 assert.ok(await chooseResult([{raw:htmlForward,time:Date.now()}],'test+uno@gmail.com'));
 assert.equal(await chooseResult([{raw:enc.encode(raw(codeSubjects[0],{to:'other@gmail.com',body:'Texto arbitrario test+uno@gmail.com'})),time:Date.now()}],'test+uno@gmail.com'),null);
 const qp=`From: sender@example.com\r\nTo: destination@gmail.com\r\nDelivered-To: test+uno@gmail.com\r\nSubject: ${codeSubjects[0]}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="x"\r\n\r\n--x\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nC=C3=B3digo 654321\r\n--x\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n<p>C=C3=B3digo 654321</p>\r\n--x--\r\n`;
 const result=await chooseResult([{raw:enc.encode(qp),time:Date.now()}],'test+uno@gmail.com');assert.match(result.body,/Código 654321/);
 const attachment=`To: destination@gmail.com\r\nSubject: Fwd\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="z"\r\n\r\n--z\r\nContent-Type: message/rfc822\r\nContent-Disposition: attachment\r\n\r\n${raw(codeSubjects[0])}\r\n--z--\r\n`;
 assert.ok((await parsedMessages(enc.encode(attachment))).length>=2);
 assert.ok(await chooseResult([{raw:enc.encode(attachment),time:Date.now()}],'test+uno@gmail.com'));
});
test('Codes retain priority across multiple mailboxes and newest code wins',async()=>{
 const messages=[{raw:enc.encode(raw(linkSubjects[0],{body:'https://www.netflix.com/password?g=abc',type:'text/plain'})),time:30},{raw:enc.encode(raw(codeSubjects[0],{body:'older'})),time:10},{raw:enc.encode(raw(codeSubjects[0],{body:'newer'})),time:20}];
 assert.match((await chooseResult(messages,'test+uno@gmail.com')).body,/newer/);
 const collected=await collectMailboxes([{id:'broken'},{id:'good'}],async b=>{if(b.id==='broken')throw new Error('secret');return {messages:[messages[2]]};});assert.equal(collected.messages.length,1);assert.equal(collected.errors.length,1);assert.ok(!JSON.stringify(collected).includes('secret'));
});
test('AES-GCM protects stored application password; ciphertext bound to mailbox ID',async()=>{
 const secret='a'.repeat(64),pass='abcdefghijklmnop';const a=await encryptPassword(pass,secret,'box1'),b=await encryptPassword(pass,secret,'box1');assert.notEqual(a,b);assert.ok(!a.includes(pass));assert.equal(await decryptPassword(a,secret,'box1'),pass);await assert.rejects(()=>decryptPassword(a,secret,'box2'));await assert.rejects(()=>decryptPassword(a,'b'.repeat(64),'box1'));assert.equal(appPassword('abcd efgh ijkl mnop'),pass);assert.throws(()=>appPassword('123'));
});
function mockSocket(responder,{greeting='* OK Gmail ready\r\n',chunkSize=7}={}){
 const commands=[];let controller,closed=false;
 const push=buffer=>{const bytes=typeof buffer==='string'?enc.encode(buffer):buffer;for(let i=0;i<bytes.length;i+=chunkSize)controller.enqueue(bytes.slice(i,i+chunkSize));};
 const socket={opened:Promise.resolve(),closed:Promise.resolve(),readable:new ReadableStream({start(c){controller=c;push(greeting);}}),writable:new WritableStream({write(bytes){const cmd=new TextDecoder().decode(bytes);commands.push(cmd);push(responder(cmd));}}),async close(){if(!closed){closed=true;controller.close();}}};return {socket,commands,isClosed:()=>closed};
}
test('Actual IMAP wire parser: TLS 993, literal byte counts, reordered FETCH fields, All Mail, read-only and ten-minute cutoff',async()=>{
 const mail=enc.encode(raw(codeSubjects[0]));
 const old=new Date(Date.now()-11*60*1000).toUTCString();
 const header=enc.encode('Date: '+date+'\r\nTo: test+uno@gmail.com\r\n\r\n'),expired=enc.encode('Date: '+old+'\r\n\r\n');
 const combine=(...parts)=>{let buffers=parts.map(x=>typeof x==='string'?enc.encode(x):x);const out=new Uint8Array(buffers.reduce((n,b)=>n+b.length,0));let at=0;for(const b of buffers){out.set(b,at);at+=b.length;}return out;};
 const m=mockSocket(command=>{
  const tag=command.split(' ')[0];if(command.includes(' LOGIN '))return tag+' OK logged in\r\n';
  if(command.includes(' LIST '))return '* LIST (\\HasNoChildren \\All) "/" "[Gmail]/Todos"\r\n'+tag+' OK list\r\n';
  if(command.includes(' EXAMINE '))return '* 2 EXISTS\r\n'+tag+' OK selected\r\n';
  if(command.includes(' FETCH 1:2 '))return combine(`* 1 FETCH (BODY[HEADER] {${header.length}}\r\n`,header,' UID 10 RFC822.SIZE 1024)\r\n',`* 2 FETCH (UID 11 BODY[HEADER] {${expired.length}}\r\n`,expired,')\r\n'+tag+' OK fetched\r\n');
  if(command.includes('UID FETCH 10'))return combine(`* 1 FETCH (UID 10 BODY[] {${mail.length}}\r\n`,mail,')\r\n'+tag+' OK fetched\r\n');
  throw new Error('Unexpected command '+command);
 });
 const connect=(address,options)=>{assert.deepEqual(address,{hostname:'imap.gmail.com',port:993});assert.equal(options.secureTransport,'on');return m.socket;};
 const result=await readMailbox(connect,{id:'box',email:'box@gmail.com',folder:''},'abcdefghijklmnop');assert.equal(result.messages.length,1);assert.equal(result.folder,'[Gmail]/Todos');assert.ok(m.isClosed());assert.ok(m.commands.some(c=>c.includes('BODY.PEEK[]')));assert.ok(!m.commands.some(c=>/STORE|EXPUNGE|DELETE/.test(c)));assert.ok(!m.commands.some(c=>c.includes('UID FETCH 11')));
});
test('Rejected authentication closes socket and does not expose app password',async()=>{
 const m=mockSocket(c=>c.split(' ')[0]+' NO authentication failed\r\n');const client=new ImapClient(()=>m.socket);await assert.rejects(()=>client.open('box@gmail.com','abcdefghijklmnop'),/Gmail rechazó/);assert.ok(m.isClosed());assert.throws(()=>quote('bad\r\nvalue'));
});
