import PostalMime from 'postal-mime';
import {ImapClient} from './imap-protocol.js';
import {codeSubjects,linkSubjects} from './mail-rules.js';
export const MAX_MESSAGES=110;
export const MAX_ACTIVE=10;
const dec=new TextDecoder();
export function canonicalEmail(email){
 let [local,domain]=String(email).trim().toLowerCase().split('@');
 if(domain==='googlemail.com')domain='gmail.com';
 if(domain==='gmail.com')local=local.replace(/\./g,'');
 return local+'@'+domain; // Deliberately retain +tags: separate authorized recipients.
}
function htmlText(html){return String(html||'').replace(/<br\s*\/?\s*>|<\/p>|<\/div>/gi,'\n').replace(/<[^>]*>/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ');}
function addresses(text){return String(text||'').match(/[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)||[];}
export function recipientMatches(mail,email){
 const target=canonicalEmail(email), found=[];
 for(const field of ['to','cc','bcc'])for(const a of mail[field]||[])if(a.address)found.push(a.address);
 for(const h of mail.headers||[])if(['to','cc','bcc','delivered-to','x-original-to','x-forwarded-to','envelope-to','resent-to','original-recipient'].includes(h.key.toLowerCase()))found.push(...addresses(h.value));
 if(found.some(a=>canonicalEmail(a)===target))return true;
 // Forwarded blocks: only recipient-labelled lines, never an arbitrary address in the body.
 const body=(mail.text||'')+'\n'+htmlText(mail.html);
 for(const line of body.split(/\r?\n/))if(/^\s*>?\s*(?:to|para|a|à|destinatario|delivered-to|x-original-to)\s*:/i.test(line)){
  if(addresses(line).some(a=>canonicalEmail(a)===target))return true;
 }
 return false;
}
function matchingSubject(mail,list){
 if(list.some(s=>String(mail.subject||'').includes(s)))return true;
 const body=(mail.text||'')+'\n'+htmlText(mail.html);
 return body.split(/\r?\n/).some(line=>/^\s*>?\s*(subject|asunto|objet)\s*:/i.test(line)&&list.some(s=>line.includes(s)));
}
function extractLink(text){
 const urls=String(text||'').replace(/&amp;/g,'&').match(/https?:\/\/[^\s<>"']+/g)||[];
 const prefixes=['https://www.netflix.com/account/travel/verify?nftoken=','https://www.netflix.com/account/update-primary-location?nftoken='];
 return (urls.find(u=>prefixes.some(p=>u.startsWith(p)))||urls.find(u=>u.startsWith('https://www.netflix.com/password?g=')))?.replace(/\]$/,'')||null;
}
export async function parsedMessages(raw){
 const first=await PostalMime.parse(raw),result=[first];
 async function children(mail,depth){if(depth>=3)return;for(const att of mail.attachments||[])if(att.mimeType==='message/rfc822'){
  const child=await PostalMime.parse(att.content);result.push(child);await children(child,depth+1);
 }}
 await children(first,0);return result;
}
export async function chooseResult(messages,email,disabledSubjects=[]){
 const ordered=[...messages].sort((a,b)=>b.time-a.time),seen=new Set();let bestLink=null;
 for(const item of ordered){
  const parts=item.parsed||await parsedMessages(item.raw);
  if(parts.some(mail=>recipientMatches(mail,email)&&matchingSubject(mail,disabledSubjects)))continue;
  for(const mail of parts){
   if(!recipientMatches(mail,email))continue;
   if(matchingSubject(mail,disabledSubjects))continue;
   const id=mail.messageId?mail.messageId+'|'+String(mail.subject):null;if(id&&seen.has(id))continue;if(id)seen.add(id);
   if(matchingSubject(mail,codeSubjects))return {alert:'Código de Disney+ encontrado',body:mail.html||mail.text||''};
   if(!bestLink&&matchingSubject(mail,linkSubjects)){const link=extractLink(mail.text||htmlText(mail.html));if(link)bestLink={link};}
  }
 }
 return bestLink;
}
export async function readMailbox(connect,mailbox,password,{now=Date.now()}={}){
 const client=new ImapClient(connect),messages=[];let totalBytes=0;
 try{
  await client.open(mailbox.email,password);
  const folder=await client.folder(mailbox.folder),count=await client.select(folder);
  if(!count)return {messages,folder};
  const start=Math.max(1,count-MAX_MESSAGES+1);
  const headers=await client.command(`FETCH ${start}:${count} (UID INTERNALDATE RFC822.SIZE BODY.PEEK[HEADER])`);
  for(const frame of headers){if(!frame.data)continue;
   const uid=/\bUID (\d+)/i.exec(frame.line)?.[1];if(!uid)continue;
   const text=dec.decode(frame.data).replace(/\r?\n[ \t]+/g,' ');
   const date=/^Date:\s*(.+)$/im.exec(text)?.[1];
   const internal=/INTERNALDATE "([^"]+)"/i.exec(frame.line)?.[1];
   const time=Date.parse(date||internal||'');
   if(!Number.isFinite(time)||now-time>10*60*1000)continue;
   const size=Number(/RFC822\.SIZE (\d+)/i.exec(frame.line)?.[1]||0);
   if(size>4*1024*1024)throw new Error('Un correo reciente supera 4 MiB; reduce su tamaño para consultarlo');
   const body=await client.command(`UID FETCH ${uid} (BODY.PEEK[])`);
   const raw=body.find(f=>f.data)?.data;
   if(raw){totalBytes+=raw.byteLength;if(totalBytes>12*1024*1024)throw new Error("Los mensajes recientes del buzón superan 12 MiB; consulta una carpeta más pequeña");messages.push({raw,time,mailboxId:mailbox.id});}
  }
  return {messages,folder};
 }finally{await client.close();}
}
export async function testMailbox(connect,mailbox,password){
 const client=new ImapClient(connect);try{await client.open(mailbox.email,password);const folder=await client.folder(mailbox.folder);await client.select(folder);return {folder};}finally{await client.close();}
}
export async function collectMailboxes(boxes,read){
 const messages=[],errors=[];let next=0,totalBytes=0;
 async function worker(){while(next<boxes.length){const box=boxes[next++];try{const incoming=(await read(box)).messages;const bytes=incoming.reduce((n,m)=>n+(m.raw?.byteLength||0),0);if(totalBytes+bytes>24*1024*1024)throw new Error('Límite total de memoria de la consulta');totalBytes+=bytes;messages.push(...incoming);}catch{errors.push({id:box.id,error:'No se pudo consultar este buzón. Comprueba su conexión en el panel.'});}}}
 await Promise.all([worker(),worker()]);return {messages,errors};
}
