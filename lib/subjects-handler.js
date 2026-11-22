import {jsonResponse} from './encoding.js';
import {checkAdmin} from './admin-auth.js';
import {codeSubjects} from './mail-rules.js';
import {SubjectsError,loadRules,saveRules,replaceCodeSubjects,applySubjectsAction} from './subjects-store.js';
export async function subjectsHandler({request,env}){
 if(request.method!=='POST')return jsonResponse({error:'Use POST'},405);
 let input;try{input=await request.json();}catch{return jsonResponse({error:'JSON inválido'},400);}
 const auth=checkAdmin(input.adminUser,input.adminPass);if(auth)return jsonResponse({error:auth.error},auth.status);
 try{
  if(!['list','add','edit','delete'].includes(input.action))throw new SubjectsError('Acción inválida');
  const current=await loadRules(env);
  if(input.action==='list')return jsonResponse({subjects:current.subjects,linkSubjects:current.linkSubjects,sha:current.sha,deployedSubjects:codeSubjects,pendingDeployment:JSON.stringify(current.subjects)!==JSON.stringify(codeSubjects)});
  if(input.sha!==current.sha)throw new SubjectsError('Los asuntos cambiaron mientras editabas. Actualiza la lista y repite el cambio.',409);
  const result=applySubjectsAction(current.subjects,input.action,input.payload||{});
  let commit;
  if(result.changed)commit=await saveRules(env,replaceCodeSubjects(current.source,result.subjects),current.sha,input.action);
  return jsonResponse({success:true,changed:result.changed,added:result.added,duplicates:result.duplicates,commit});
 }catch(e){return jsonResponse({error:e instanceof SubjectsError?e.message:'No se pudo completar el cambio de asuntos. Inténtalo de nuevo.'},e instanceof SubjectsError?e.status:500);}
}
