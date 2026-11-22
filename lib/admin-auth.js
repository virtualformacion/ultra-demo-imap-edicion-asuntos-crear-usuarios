import {FIXED_ADMIN} from '../functions/api/updateusers.js';
export {FIXED_ADMIN};
export function checkAdmin(user,pass,now=Date.now()) {
 if(user!==FIXED_ADMIN.username||pass!==FIXED_ADMIN.password)return {status:401,error:'Credenciales admin inválidas'};
 if(now>new Date(FIXED_ADMIN.expiresAt).getTime())return {status:403,error:'Acceso admin vencido'};
 return null;
}
