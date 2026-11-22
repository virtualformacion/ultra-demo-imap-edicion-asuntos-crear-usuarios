import {decode64,encode64} from './users.js';
function settings(env){
 if(!env.GITHUB_TOKEN)throw new Error('Configura GITHUB_TOKEN en Cloudflare');
 const repo=env.GITHUB_REPO||`${env.REPO_OWNER||'virtualformacion'}/${env.REPO_NAME||'going-merry'}`;
 if(!/^[\w.-]+\/[\w.-]+$/.test(repo))throw new Error('Configura GITHUB_REPO como propietario/repositorio');
 const path=env.GITHUB_MAILBOX_PATH||'mailboxes.json';
 if(path===(env.GITHUB_FILE_PATH||env.FILE_PATH||'script.js'))throw new Error('El archivo de buzones debe ser distinto de script.js');
 const url='https://api.github.com/repos/'+repo+'/contents/'+path.split('/').map(encodeURIComponent).join('/');
 return {url,branch:env.GITHUB_BRANCH||env.BRANCH||'main',headers:{'User-Agent':'going-merry-imap','Accept':'application/vnd.github+json','Authorization':`Bearer ${env.GITHUB_TOKEN}`,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'}};
}
export async function loadMailboxes(env){
 const {url,branch,headers}=settings(env);
 const res=await fetch(url+'?ref='+encodeURIComponent(branch),{headers,cache:'no-store'});
 if(res.status===404)return {mailboxes:[],sha:null};
 if(!res.ok)throw new Error(`GitHub devolvió ${res.status} al leer buzones; revisa token y repositorio`);
 const file=await res.json(),doc=JSON.parse(decode64(file.content));
 if(doc.version!==1||!Array.isArray(doc.mailboxes))throw new Error('El archivo mailboxes.json no tiene el formato esperado');
 return {mailboxes:doc.mailboxes,sha:file.sha};
}
export async function saveMailboxes(env,mailboxes,sha,action){
 const {url,branch,headers}=settings(env);
 const body={message:`Buzones IMAP: ${action} desde admin`,branch,content:encode64(JSON.stringify({version:1,mailboxes},null,2)+'\n'),...(sha?{sha}:{})};
 const res=await fetch(url,{method:'PUT',headers,body:JSON.stringify(body)});
 if(res.status===409||res.status===422)throw new Error('Otro cambio modificó los buzones. Recarga la lista y repite la operación.');
 if(!res.ok)throw new Error(`GitHub devolvió ${res.status} al guardar buzones; revisa permiso Contents: Read and write`);
 const result=await res.json();return result.commit?.sha;
}
export async function publicMailboxes(env){return (await loadMailboxes(env)).mailboxes.map(({id,name,email,folder,active,updated_at})=>({id,name,email,folder,active,updated_at}));}
export async function activeMailboxes(env){return (await loadMailboxes(env)).mailboxes.filter(b=>b.active);}
