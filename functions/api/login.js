import {loadUsers,sessionCookie} from '../../lib/user-auth.js';
import {jsonResponse} from '../../lib/users.js';
export async function onRequest({request,env}){
 if(request.method!=='POST')return jsonResponse({error:'Use POST'},405);
 let input;try{input=await request.json();}catch{return jsonResponse({error:'JSON inválido'},400);}
 if(typeof input?.username!=='string'||typeof input.password!=='string')return jsonResponse({error:'Datos incorrectos'},400);
 try{
  const user=(await loadUsers(env)).find(u=>u.username===input.username&&u.password===input.password);
  if(!user)return jsonResponse({error:'Datos incorrectos. Vuelve a intentarlo.'},401);
  if(Date.now()>new Date(user.expiresAt).getTime())return jsonResponse({error:'Tu cuenta ha vencido, ponte en contacto con tu proveedor para renovar tu cuenta.'},403);
  return new Response(JSON.stringify({success:true}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':await sessionCookie(user,env)}});
 }catch{return jsonResponse({error:'No se pudo validar el acceso. Revisa la configuración de GitHub.'},503);}
}
