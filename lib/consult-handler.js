import {authenticatedUser} from './user-auth.js';
import {jsonResponse} from './encoding.js';
import {decryptPassword} from './mailbox-vault.js';
import {activeMailboxes} from './mailbox-store.js';
import {chooseResult,collectMailboxes,MAX_ACTIVE} from './imap-mail.js';
export async function consultHandler({request,env},read){
 if(request.method!=='POST')return jsonResponse({error:'Use POST'},405);
 try{
  const {email}=await request.json();
  if(typeof email!=='string'||! /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))return jsonResponse({error:'Correo inválido'},400);
  const user=await authenticatedUser(request,env);
  if(!user)return jsonResponse({error:'Inicia sesión nuevamente para consultar.'},401);
  const allowed=(user.emails||[]).map(s=>s.trim().toLowerCase()).filter(Boolean);
  if(allowed.length&&!allowed.includes(email.trim().toLowerCase()))return jsonResponse({error:'Consulta con tu proveedor acerca de este correo que deseas obtener codigos'},403);
  const boxes=await activeMailboxes(env);
  if(!boxes.length)return jsonResponse({error:'No hay buzones activos. Añade uno desde Administrar.'},503);
  if(boxes.length>MAX_ACTIVE)return jsonResponse({error:`Desactiva buzones hasta dejar como máximo ${MAX_ACTIVE} activos.`},503);
  const {messages,errors}=await collectMailboxes(boxes,async box=>{
   const password=await decryptPassword(box.password_encrypted,env.MAILBOX_ENCRYPTION_KEY,box.id);return read(box,password);
  });
  const result=await chooseResult(messages,email,user.disabledSubjects||[]);
  if(result)return jsonResponse({...result,...(errors.length?{warning:'Algunos buzones no respondieron; resultado obtenido de los disponibles.'}:{})});
  if(errors.length)return jsonResponse({error:'No se completó la consulta de todos los buzones. Prueba las conexiones desde el panel.'},502);
  return jsonResponse({message:'No se encontró un resultado para tu cuenta, vuelve a intentar nuevamente'},404);
 }catch(e){return jsonResponse({error:/^(Configura|GitHub|El archivo)/.test(e.message)?e.message:'No se pudo consultar IMAP. Revisa los buzones y la configuración de GitHub.'},500);}
}
