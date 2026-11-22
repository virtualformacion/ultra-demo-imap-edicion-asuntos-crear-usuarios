// Obtiene la sesión del servidor y conserva la interfaz original del acceso.
(()=>{
 const form=document.getElementById('loginForm');let busy=false;
 form.addEventListener('submit',async event=>{
  if(event.serverAuthenticated)return;
  event.preventDefault();event.stopImmediatePropagation();if(busy)return;busy=true;
  const message=document.getElementById('loginMessage');message.textContent='Validando acceso...';
  try{
   const res=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:document.getElementById('loginUser').value.trim(),password:document.getElementById('loginPass').value.trim()})});
   const data=await res.json();if(!res.ok)throw new Error(data.error||'No se pudo iniciar sesión');
   message.textContent='';const next=new Event('submit',{bubbles:true,cancelable:true});next.serverAuthenticated=true;form.dispatchEvent(next);
  }catch(e){message.textContent=e.message;}finally{busy=false;}
 },true);
})();
