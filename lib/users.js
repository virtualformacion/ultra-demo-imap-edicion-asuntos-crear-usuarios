export function jsonResponse(body, status=200) {
  return Response.json(body, {status, headers:{'Cache-Control':'no-store'}});
}
export function decode64(value) {
  // Gmail uses Base64URL (- and _), often without = padding. GitHub uses Base64.
  let normalized = String(value).replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
  normalized += '='.repeat((4 - normalized.length % 4) % 4);
  return new TextDecoder().decode(Uint8Array.from(atob(normalized), c => c.charCodeAt(0)));
}
export function encode64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary=''; for (const byte of bytes) binary+=String.fromCharCode(byte);
  return btoa(binary);
}
// Read only data literals and new Date("..."); never execute repository code.
export function parseUsers(source) {
  const match=/const\s+USERS\s*=\s*/.exec(source);
  if (!match) throw new Error('No se encontró USERS en script.js');
  let i=match.index+match[0].length;
  function ws(){while(/\s/.test(source[i]||'') && i<source.length)i++;}
  function take(s){ws(); if(!source.startsWith(s,i))throw new Error('Formato USERS inválido');i+=s.length;}
  function string(){ws();const start=i;take('"');let escape=false;while(i<source.length){const c=source[i++];if(c==='"'&&!escape)return JSON.parse(source.slice(start,i));if(c==='\\'&&!escape)escape=true;else escape=false;}throw new Error('Cadena incompleta');}
  function value(){
    ws();if(source[i]==='"')return string();
    if(source.startsWith('new Date',i)){take('new Date');take('(');const d=string();take(')');return d;}
    if(source[i]==='['){take('[');const a=[];ws();while(source[i]!==']'){a.push(value());ws();if(source[i]!==',')break;take(',');ws();}take(']');return a;}
    if(source[i]==='{'){take('{');const o={};ws();while(source[i]!=='}'){
      ws();const m=/^[A-Za-z_$][\w$]*/.exec(source.slice(i));const key=source[i]==='"'?string():(m?(i+=m[0].length,m[0]):null);
      if(!['username','password','expiresAt','emails','disabledSubjects'].includes(key))throw new Error('Campo de usuario inválido');
      take(':');o[key]=value();ws();if(source[i]!==',')break;take(',');ws();
    }take('}');return o;}
    throw new Error('USERS contiene expresiones no admitidas');
  }
  const users=value();ws();take(';');
  if(!Array.isArray(users)||users.some(u=>!u||typeof u.username!=='string'||typeof u.password!=='string'||(u.disabledSubjects!==undefined&&(!Array.isArray(u.disabledSubjects)||u.disabledSubjects.some(s=>typeof s!=='string')))||typeof u.expiresAt!=='string'||!Number.isFinite(Date.parse(u.expiresAt))||(u.emails!==undefined&&(!Array.isArray(u.emails)||u.emails.some(e=>typeof e!=='string')))))throw new Error('Datos USERS inválidos');
  return {users,startIndex:match.index,endIndex:i};
}
