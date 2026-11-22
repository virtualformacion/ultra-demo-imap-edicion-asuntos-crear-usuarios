(() => {
 const el=id=>document.getElementById(id);let boxes=[];
 const message=(text)=>{el('mailboxMsg').textContent=text;};
 async function api(action,payload){
  const response=await fetch('/api/mailboxes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...window.getMailboxAdmin(),action,payload})});
  let data;try{data=await response.json();}catch{throw new Error('Respuesta inválida; comprueba el despliegue de Cloudflare');}
  if(!response.ok)throw new Error(data.error||'No se pudo completar la operación');return data;
 }
 function reset(){for(const id of ['mailboxId','mailboxName','mailboxEmail','mailboxPassword','mailboxFolder'])el(id).value='';el('mailboxActive').checked=true;el('saveMailbox').textContent='Guardar buzón';}
 window.loadMailboxes=async()=>{try{message('Cargando buzones...');const data=await api('list');boxes=data.mailboxes;render();message(`${boxes.length} buzón(es) registrados. Las claves nunca se muestran.`);}catch(e){message(e.message);}};
 function button(label,fn,style='btn-blue'){const b=document.createElement('button');b.type='button';b.textContent=label;b.className='btn '+style;b.style.margin='2px';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){message(e.message);}finally{b.disabled=false;}};return b;}
 function render(){el('mailboxRows').replaceChildren();for(const box of boxes){
  const tr=document.createElement('tr');for(const value of [box.name,box.email,box.active?'Activo':'Inactivo']){const td=document.createElement('td');td.textContent=value;tr.append(td);}
  const actions=document.createElement('td');
  actions.append(button('Editar',()=>{el('mailboxId').value=box.id;el('mailboxName').value=box.name;el('mailboxEmail').value=box.email;el('mailboxFolder').value=box.folder;el('mailboxPassword').value='';el('mailboxActive').checked=!!box.active;el('saveMailbox').textContent='Guardar cambios';message('Editando buzón. Clave vacía conserva la actual.');}));
  actions.append(button('Probar conexión',async()=>{message('Probando conexión IMAP...');const r=await api('test',{id:box.id});message(r.message+' — carpeta: '+r.folder);}));
  actions.append(button(box.active?'Desactivar':'Activar',async()=>{message('Guardando estado...');await api('edit',{id:box.id,active:!box.active});await window.loadMailboxes();}));
  actions.append(button('Eliminar',async()=>{if(!confirm('¿Eliminar el buzón '+box.email+' de la configuración? No se borrarán correos de Gmail.'))return;await api('delete',{id:box.id});if(el('mailboxId').value===box.id)reset();await window.loadMailboxes();},'btn-red'));
  tr.append(actions);el('mailboxRows').append(tr);
 }}
 el('saveMailbox').onclick=async()=>{
  const b=el('saveMailbox');b.disabled=true;
  try{message('Validando y guardando el buzón...');const id=el('mailboxId').value;
   await api(id?'edit':'create',{...(id?{id}:{}),name:el('mailboxName').value,email:el('mailboxEmail').value,appPassword:el('mailboxPassword').value,folder:el('mailboxFolder').value,active:el('mailboxActive').checked});
   reset();await window.loadMailboxes();message('Buzón guardado en GitHub. Está disponible para las consultas nuevas.');
  }catch(e){message(e.message);}finally{b.disabled=false;}
 };
 el('refreshMailboxes').onclick=()=>window.loadMailboxes();el('cancelMailboxEdit').onclick=()=>{reset();message('Edición cancelada');};
 el('btnLogout').addEventListener('click',()=>{reset();boxes=[];el('mailboxRows').replaceChildren();message('');});
})();
