import {jsonResponse} from './encoding.js';
import {checkAdmin} from './admin-auth.js';
import {loadMailboxes,saveMailboxes,publicMailboxes} from './mailbox-store.js';
import {encryptPassword,decryptPassword,normalizeMailbox,appPassword,cipherKey} from './mailbox-vault.js';
import {MAX_ACTIVE} from './imap-mail.js';
export async function mailboxHandler({request,env},probe){
 if(request.method!=='POST')return jsonResponse({error:'Use POST'},405);
 let input;try{input=await request.json();}catch{return jsonResponse({error:'JSON inválido'},400);}
 const auth=checkAdmin(input.adminUser,input.adminPass);if(auth)return jsonResponse({error:auth.error},auth.status);
 try{
  await cipherKey(env.MAILBOX_ENCRYPTION_KEY);
  const action=input.action,data=input.payload||{};
  if(action==='list')return jsonResponse({mailboxes:await publicMailboxes(env)});
  if(!['create','edit','delete','test'].includes(action))return jsonResponse({error:'Acción inválida'},400);
  const {mailboxes,sha}=await loadMailboxes(env);
  const old=action==='create'?null:mailboxes.find(b=>b.id===data.id);
  if(action!=='create'&&!old)return jsonResponse({error:'Buzón no encontrado'},404);
  if(action==='delete'){
   const commit=await saveMailboxes(env,mailboxes.filter(b=>b.id!==old.id),sha,'eliminar');return jsonResponse({success:true,commit});
  }
  if(action==='test'){
   const password=await decryptPassword(old.password_encrypted,env.MAILBOX_ENCRYPTION_KEY,old.id);
   const result=await probe(old,password);return jsonResponse({success:true,message:'Conexión IMAP TLS 993 correcta',folder:result.folder});
  }
  const config=normalizeMailbox({...old,...data});
  const id=old?.id||crypto.randomUUID(),timestamp=new Date().toISOString();
  if(config.active&&(!old||!old.active)&&mailboxes.filter(b=>b.active).length>=MAX_ACTIVE)return jsonResponse({error:`Esta versión admite hasta ${MAX_ACTIVE} buzones activos; desactiva uno primero`},400);
  if(mailboxes.some(b=>b.email.toLowerCase()===config.email&&b.id!==id))return jsonResponse({error:'Ese buzón ya está registrado'},409);
  let encrypted=old?.password_encrypted;
  if(data.appPassword)encrypted=await encryptPassword(appPassword(data.appPassword),env.MAILBOX_ENCRYPTION_KEY,id);
  if(!encrypted)return jsonResponse({error:'Introduce la clave de aplicación'},400);
  if(old&&config.email!==old.email&&!data.appPassword)return jsonResponse({error:'Al cambiar el correo debes introducir su clave de aplicación'},400);
  if(config.active){const password=await decryptPassword(encrypted,env.MAILBOX_ENCRYPTION_KEY,id);await probe(config,password);}
  const record={id,...config,password_encrypted:encrypted,created_at:old?.created_at||timestamp,updated_at:timestamp};
  const updated=old?mailboxes.map(b=>b.id===id?record:b):[...mailboxes,record];
  const commit=await saveMailboxes(env,updated,sha,old?'editar':'crear');
  return jsonResponse({success:true,commit});
 }catch(e){
  const message=String(e.message||'');
  const allowed=/^(Configura |GitHub |El archivo |Otro cambio |No se pudo descifrar|Correo del buzón inválido|Carpeta inválida|Nombre del buzón|Introduce la clave|Gmail |No se encontró Todos|La consulta IMAP)/.test(message);
  return jsonResponse({error:allowed?message:'No se pudo guardar o conectar el buzón. Revisa GitHub, el correo y la clave de aplicación.'},500);
 }
}
