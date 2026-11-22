const enc=new TextEncoder(),dec=new TextDecoder();
function b64(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);}
function unb64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
export async function cipherKey(secret){
 if(typeof secret!=='string'||secret.length<32)throw new Error('Configura MAILBOX_ENCRYPTION_KEY con al menos 32 caracteres aleatorios');
 const hash=await crypto.subtle.digest('SHA-256',enc.encode(secret));return crypto.subtle.importKey('raw',hash,'AES-GCM',false,['encrypt','decrypt']);
}
export async function encryptPassword(password,secret,id){const key=await cipherKey(secret),iv=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(id)},key,enc.encode(password));return JSON.stringify({v:1,iv:b64(iv),data:b64(new Uint8Array(ciphertext))});}
export async function decryptPassword(value,secret,id){try{const key=await cipherKey(secret),data=JSON.parse(value);return dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(data.iv),additionalData:enc.encode(id)},key,unb64(data.data)));}catch{throw new Error('No se pudo descifrar un buzón. Revisa MAILBOX_ENCRYPTION_KEY; no la cambies después de guardar buzones.');}}
export function normalizeMailbox(data){
 const email=String(data.email||'').trim().toLowerCase();if(!/^[^\s@<>"\\]+@[^\s@<>"\\]+\.[^\s@<>"\\]+$/.test(email))throw new Error('Correo del buzón inválido');
 const folder=String(data.folder||'').trim();if(folder.length>200||/[\r\n\0]/.test(folder))throw new Error('Carpeta inválida');
 const name=String(data.name||email).trim();if(name.length>100)throw new Error('Nombre del buzón demasiado largo');
 return {email,name,folder,active:(data.active===false||data.active===0)?0:1};
}
export function appPassword(value){const password=String(value||'').replace(/\s/g,'');if(!/^[a-zA-Z]{16}$/.test(password))throw new Error('Introduce la clave de aplicación de Google de 16 letras, no la contraseña habitual');return password;}
