import {parseUsers,decode64} from './users.js';
const COOKIE='going-merry_session',TTL=28800,encoder=new TextEncoder();
function b64(bytes){return btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function bytes(text){const s=text.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(s+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));}
async function key(env){if(!env.MAILBOX_ENCRYPTION_KEY||env.MAILBOX_ENCRYPTION_KEY.length<32)throw new Error('Configura MAILBOX_ENCRYPTION_KEY');return crypto.subtle.importKey('raw',encoder.encode('going-merry:session:v1:'+env.MAILBOX_ENCRYPTION_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function loadUsers(env){
 if(!env.GITHUB_TOKEN)throw new Error('Configura GITHUB_TOKEN');
 const repo=env.GITHUB_REPO||`${env.REPO_OWNER||'virtualformacion'}/${env.REPO_NAME||'going-merry'}`,path=env.GITHUB_FILE_PATH||env.FILE_PATH||'script.js',branch=env.GITHUB_BRANCH||env.BRANCH||'main';
 const res=await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,{headers:{'User-Agent':'going-merry-users',Accept:'application/vnd.github+json',Authorization:`Bearer ${env.GITHUB_TOKEN}`},cache:'no-store'});
 if(!res.ok)throw new Error(`GitHub respondió ${res.status} al validar el usuario`);
 return parseUsers(decode64((await res.json()).content)).users;
}
async function stamp(user,env){return b64(new Uint8Array(await crypto.subtle.sign('HMAC',await key(env),encoder.encode(JSON.stringify([user.username,user.password])))));}
export async function sessionCookie(user,env,now=Date.now()){
 const payload=b64(encoder.encode(JSON.stringify({u:user.username,p:await stamp(user,env),exp:Math.floor(now/1000)+TTL})));
 const signature=b64(new Uint8Array(await crypto.subtle.sign('HMAC',await key(env),encoder.encode(payload))));
 return `${COOKIE}=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL}`;
}
export async function authenticatedUser(request,env,now=Date.now()){
 const token=request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);if(!token||token.length>4096)return null;
 let claim;try{const [payload,signature,...rest]=token.split('.');if(rest.length||!signature||!await crypto.subtle.verify('HMAC',await key(env),bytes(signature),encoder.encode(payload)))return null;claim=JSON.parse(new TextDecoder().decode(bytes(payload)));if(typeof claim.exp!=='number'||claim.exp<=now/1000)return null;}catch{return null;}
 const user=(await loadUsers(env)).find(u=>u.username===claim.u);
 return user&&now<=new Date(user.expiresAt).getTime()&&claim.p===await stamp(user,env)?user:null;
}
