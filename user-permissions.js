(()=>{
 const original=window.renderUsers;
 const header=document.createElement('th');header.textContent='Consultas permitidas';
 const head=document.querySelector('#usersTable thead tr');head.insertBefore(header,head.lastElementChild);
 async function api(url,action,extra={}){
  const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...window.getMailboxAdmin(),action,...extra})});
  const data=await res.json();if(!res.ok||data.error)throw new Error(data.error||'No se pudo guardar');return data;
 }
 window.renderUsers=function(users){
  original(users);
  [...document.querySelectorAll('#usersTable tbody tr')].forEach((row,index)=>{
   const user=users[index],cell=document.createElement('td'),details=document.createElement('details'),summary=document.createElement('summary');
   summary.textContent=(user.disabledSubjects||[]).length?'Ver / editar permisos':'Todos habilitados · editar';details.append(summary);cell.append(details);row.insertBefore(cell,row.lastElementChild);
   let loaded=false;
   details.addEventListener('toggle',async()=>{
    if(!details.open||loaded)return;loaded=true;
    while(details.children.length>1)details.lastElementChild.remove();
    const content=document.createElement('div');content.style.cssText='min-width:260px;max-width:420px';details.append(content);content.textContent='Cargando asuntos...';
    try{
     const [rules,list]=await Promise.all([api('/api/subjects','list'),api('/api/updateusers','list')]);
     const current=list.users.find(u=>u.username===user.username);if(!current)throw new Error('Usuario no encontrado');
     const available=[...new Set([...rules.subjects,...rules.linkSubjects])],disabled=new Set(current.disabledSubjects||[]);content.textContent='';
     const help=document.createElement('p');help.textContent='Marcado = permitido. Desmarca los asuntos que este usuario no podrá consultar.';content.append(help);
     const choices=document.createElement('div');choices.style.cssText='max-height:300px;overflow:auto';content.append(choices);
     const inputs=[];for(const subject of available){
      const label=document.createElement('label');label.style.cssText='display:flex;gap:7px;margin:9px 0;align-items:flex-start';const check=document.createElement('input');check.type='checkbox';check.checked=!disabled.has(subject);const text=document.createElement('span');text.textContent=subject;label.append(check,text);choices.append(label);inputs.push({check,subject});
     }
     const all=document.createElement('button');all.type='button';all.textContent='Habilitar todos';all.className='btn';all.addEventListener('click',()=>inputs.forEach(x=>x.check.checked=true));
     const none=document.createElement('button');none.type='button';none.textContent='Deshabilitar todos';none.className='btn';none.addEventListener('click',()=>inputs.forEach(x=>x.check.checked=false));
     const save=document.createElement('button');save.type='button';save.className='btn btn-green';save.textContent='Guardar permisos';const status=document.createElement('p');status.setAttribute('role','status');content.append(all,none,save,status);
     save.addEventListener('click',async()=>{
      save.disabled=true;status.textContent='Guardando...';
      try{
       const disabledSubjects=[...disabled].filter(s=>!available.includes(s));for(const item of inputs)if(!item.check.checked)disabledSubjects.push(item.subject);
       await api('/api/updateusers','permissions',{sha:list.sha,payload:{username:user.username,disabledSubjects}});
       // A new read must agree with our write before advancing the revision.
       const fresh=await api('/api/updateusers','list'),saved=fresh.users.find(u=>u.username===user.username);
       if(JSON.stringify(saved?.disabledSubjects)!==JSON.stringify(disabledSubjects))throw new Error('Los permisos cambiaron en otra sesión. Cierra y vuelve a abrir la lista.');
       list.sha=fresh.sha;disabled.clear();disabledSubjects.forEach(s=>disabled.add(s));
       const cached=(window.__usersCache||[]).find(u=>u.username===user.username);if(cached)cached.disabledSubjects=disabledSubjects;
       summary.textContent=`${inputs.filter(x=>x.check.checked).length} de ${available.length} habilitados · editar`;status.textContent='Permisos guardados. Ya se aplican a las consultas de este usuario.';
      }catch(e){status.textContent=e.message;loaded=false;}finally{save.disabled=false;}
     });
    }catch(e){content.textContent=e.message;loaded=false;content.addEventListener('click',()=>content.remove(),{once:true});}
   });
  });
 };
})();
