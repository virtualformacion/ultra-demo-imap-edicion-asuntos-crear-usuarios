(() => {
 const el=id=>document.getElementById(id);let revision='',subjects=[],published=[],busy=false;
 const message=text=>{el('subjectsMsg').textContent=text;};
 function setBusy(value){busy=value;for(const b of el('subjectsSection').querySelectorAll('button'))b.disabled=value;}
 async function api(action,payload){
  const response=await fetch('/api/subjects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...window.getMailboxAdmin(),action,sha:revision,payload})});
  let result;try{result=await response.json();}catch{throw new Error('Respuesta inválida. Comprueba que el último despliegue terminó correctamente.');}
  if(!response.ok)throw new Error(result.error||'No se pudieron guardar los asuntos');return result;
 }
 async function load(){
  const result=await api('list');subjects=result.subjects;revision=result.sha;published=result.deployedSubjects;
  render();el('subjectsPublishState').textContent=result.pendingDeployment?'Hay cambios pendientes de publicar. Espera a que Cloudflare termine el despliegue del último commit y después actualiza esta lista.':'La lista de GitHub coincide con la versión publicada.';
 }
 window.loadSubjects=async()=>{if(busy)return;setBusy(true);try{message('Cargando asuntos...');await load();message(`${subjects.length} asunto(s) de códigos configurados.`);}catch(e){message(e.message);}finally{setBusy(false);}};
 async function mutate(action,payload){
  setBusy(true);try{
   message('Guardando en GitHub...');const result=await api(action,payload);
   if(action==='add')el('subjectsInput').value='';
   await load();
   message(result.changed?(action==='add'?`Agregados: ${result.added}. Duplicados omitidos: ${result.duplicates}. `:'Cambio guardado. ')+'Espera el despliegue de Cloudflare para usar los cambios en las consultas.':`No se modificó el archivo.${result.duplicates!==undefined?' Duplicados omitidos: '+result.duplicates+'.':''}`);
  }catch(e){message(e.message);}finally{setBusy(false);}
 }
 function button(label,fn,style='btn-blue'){
  const b=document.createElement('button');b.type='button';b.className='btn '+style;b.textContent=label;b.disabled=busy;b.addEventListener('click',fn);return b;
 }
 function render(){
  el('subjectsRows').replaceChildren();for(const subject of subjects){
   const row=document.createElement('tr'),cell=document.createElement('td'),status=document.createElement('td'),actions=document.createElement('td');
   cell.textContent=subject;cell.style.overflowWrap='anywhere';status.textContent=published.includes(subject)?'Publicado':'Pendiente';
   const remove=()=>{if(busy)return;if(confirm('¿Eliminar este asunto de códigos?\n\n'+subject))mutate('delete',{subject});};
   const edit=()=>{
    if(busy)return;
    const input=document.createElement('input');input.type='text';input.maxLength=500;input.value=subject;input.setAttribute('aria-label','Editar asunto');
    cell.replaceChildren(input);actions.replaceChildren(button('Guardar',()=>{if(!busy)mutate('edit',{subject,newSubject:input.value});},'btn-green'),button('Cancelar',()=>render()));input.focus();
   };
   actions.append(button('Editar',edit),button('Eliminar',remove,'btn-red'));row.append(cell,status,actions);el('subjectsRows').append(row);
  }
 }
 el('addSubjects').addEventListener('click',()=>{if(!busy)mutate('add',{text:el('subjectsInput').value});});
 el('refreshSubjects').addEventListener('click',()=>window.loadSubjects());
 el('btnLogout').addEventListener('click',()=>{revision='';subjects=[];published=[];el('subjectsInput').value='';el('subjectsRows').replaceChildren();el('subjectsPublishState').textContent='';message('');});
})();
