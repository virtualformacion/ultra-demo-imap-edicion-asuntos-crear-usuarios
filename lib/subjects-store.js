import {parse} from 'acorn';
import {decode64,encode64} from './users.js';
export class SubjectsError extends Error {constructor(message,status=400){super(message);this.status=status;}}
const MAX_SUBJECTS=500,MAX_LENGTH=500;
function cleanSubject(value){if(typeof value!=='string')throw new SubjectsError('Cada asunto debe ser texto');const text=value.trim();if(!text||text.length>MAX_LENGTH||/[\r\n\0]/.test(text))throw new SubjectsError('Cada asunto debe tener entre 1 y 500 caracteres y ocupar una sola línea');return text;}
export function splitSubjects(value){
 if(Array.isArray(value))return value.map(cleanSubject);
 if(typeof value!=='string'||value.length>100000)throw new SubjectsError('Introduce los asuntos como texto o lista');
 if(value.trim().startsWith('[')){try{const arr=JSON.parse(value);if(!Array.isArray(arr))throw new Error();return arr.map(cleanSubject);}catch(e){if(e instanceof SubjectsError)throw e;throw new SubjectsError('La lista JSON no es válida');}}
 const result=[];let current='',quoted=false;
 // CSV-style double quotes protect commas/semicolons inside a single subject.
 for(let i=0;i<value.length;i++){
  const char=value[i];
  if(char==='"'){
   if(quoted&&value[i+1]==='"'){current+='"';i++;}
   else if(quoted||!current.trim()){quoted=!quoted;}
   else current+=char;
  }else if(!quoted&&/[\n\r,;]/.test(char)){
   if(current.trim())result.push(cleanSubject(current.replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)/,'')));current='';
  }else current+=char;
 }
 if(quoted)throw new SubjectsError('Cierra las comillas dobles de la lista antes de guardar');
 if(current.trim())result.push(cleanSubject(current.replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)/,'')));
 if(!result.length)throw new SubjectsError('Introduce al menos un asunto');
 return result;
}
export function inspectRules(source,name='codeSubjects'){
 let tree;try{tree=parse(source,{ecmaVersion:'latest',sourceType:'module'});}catch{throw new SubjectsError('No se pudo interpretar lib/mail-rules.js. Revisa su sintaxis en GitHub.');}
 let array;
 for(const node of tree.body)if(node.type==='ExportNamedDeclaration'&&node.declaration?.type==='VariableDeclaration'){
  for(const declaration of node.declaration.declarations)if(declaration.id.type==='Identifier'&&declaration.id.name===name)array=declaration.init;
 }
 if(!array||array.type!=='ArrayExpression'||array.elements.some(n=>!n||n.type!=='Literal'||typeof n.value!=='string'))throw new SubjectsError('codeSubjects debe ser un array exportado que contenga solo cadenas de texto');
 return {subjects:array.elements.map(n=>n.value),start:array.start,end:array.end};
}
export function replaceCodeSubjects(source,subjects){
 const block=inspectRules(source),items=subjects.map(cleanSubject);
 if(items.length>MAX_SUBJECTS)throw new SubjectsError('Se admiten hasta 500 asuntos de códigos');
 const array='[\n'+items.map(s=>'  '+JSON.stringify(s)).join(',\n')+'\n]';
 return source.slice(0,block.start)+array+source.slice(block.end);
}
function settings(env){
 if(!env.GITHUB_TOKEN)throw new SubjectsError('Configura GITHUB_TOKEN en Cloudflare',503);
 const repo=env.GITHUB_REPO||`${env.REPO_OWNER||'virtualformacion'}/${env.REPO_NAME||'going-merry'}`;
 if(!/^[\w.-]+\/[\w.-]+$/.test(repo))throw new SubjectsError('Configura GITHUB_REPO como propietario/repositorio',503);
 return {url:`https://api.github.com/repos/${repo}/contents/lib/mail-rules.js`,branch:env.GITHUB_BRANCH||env.BRANCH||'main',headers:{'User-Agent':'streaminggamaz-subjects','Accept':'application/vnd.github+json','Authorization':`Bearer ${env.GITHUB_TOKEN}`,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'}};
}
export async function loadRules(env){
 const {url,branch,headers}=settings(env);const res=await fetch(url+'?ref='+encodeURIComponent(branch),{headers,cache:'no-store'});
 if(res.status===404)throw new SubjectsError('No se encontró lib/mail-rules.js en el repositorio y rama configurados',404);
 if(!res.ok)throw new SubjectsError(`GitHub respondió ${res.status} al leer los asuntos. Revisa token y repositorio.`,502);
 const file=await res.json(),source=decode64(file.content);return {source,sha:file.sha,...inspectRules(source),linkSubjects:inspectRules(source,'linkSubjects').subjects};
}
export async function saveRules(env,source,sha,action){
 const {url,branch,headers}=settings(env);
 const res=await fetch(url,{method:'PUT',headers,body:JSON.stringify({message:`Asuntos de códigos: ${action} desde admin`,content:encode64(source),branch,sha})});
 if(res.status===409||res.status===422)throw new SubjectsError('Los asuntos cambiaron mientras editabas. Actualiza la lista y repite el cambio.',409);
 if(!res.ok)throw new SubjectsError(`GitHub respondió ${res.status} al guardar. Revisa el permiso Contents: Read and write.`,502);
 return (await res.json()).commit?.sha;
}
export function applySubjectsAction(subjects,action,payload){
 if(action==='add'){
  const input=splitSubjects(payload.text??payload.subjects),known=new Set(subjects),added=[];let duplicates=0;
  for(const subject of input){if(known.has(subject)){duplicates++;continue;}known.add(subject);added.push(subject);}
  if(subjects.length+added.length>MAX_SUBJECTS)throw new SubjectsError('Se admiten hasta 500 asuntos de códigos');
  return {subjects:[...subjects,...added],added:added.length,duplicates,changed:added.length>0};
 }
 const old=payload.subject;if(typeof old!=='string'||!subjects.includes(old))throw new SubjectsError('El asunto ya no existe. Actualiza la lista.',409);
 if(action==='delete')return {subjects:subjects.filter(s=>s!==old),changed:true};
 if(action==='edit'){
  const next=cleanSubject(payload.newSubject);if(next!==old&&subjects.includes(next))throw new SubjectsError('Ese asunto ya existe en la lista',409);
  return {subjects:subjects.map(s=>s===old?next:s),changed:old!==next};
 }
 throw new SubjectsError('Acción inválida');
}
