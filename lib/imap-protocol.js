const enc=new TextEncoder(),dec=new TextDecoder();
export function quote(value){if(/[\r\n\0]/.test(value))throw new Error('Valor IMAP inválido');return '"'+value.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';}
export class ImapClient {
 constructor(connect,{timeout=12000,sessionTimeout=40000}={}){this.connect=connect;this.timeout=timeout;this.sessionTimeout=sessionTimeout;this.buffer=new Uint8Array();this.counter=0;}
 async open(email,password){
  this.socket=this.connect({hostname:'imap.gmail.com',port:993},{secureTransport:'on'});
  this.socket.closed?.catch(()=>{});this.socket.opened?.catch(()=>{});
  this.reader=this.socket.readable.getReader();this.writer=this.socket.writable.getWriter();
  this.deadline=setTimeout(()=>{this.expired=true;this.socket.close().catch(()=>{});},this.sessionTimeout);
  try{const greeting=await this.line();if(!/^\* OK\b/i.test(greeting))throw new Error('Gmail no aceptó la conexión IMAP');
   await this.command('LOGIN '+quote(email)+' '+quote(password));
  }catch(e){await this.close();throw e;}
 }
 async readMore(){
  if(this.expired)throw new Error('La consulta IMAP superó el tiempo disponible');
  let timer;try{
   const result=await Promise.race([this.reader.read(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Gmail no respondió a tiempo')),this.timeout);})]);
   if(result.done)throw new Error('Gmail cerró la conexión IMAP');
   const joined=new Uint8Array(this.buffer.length+result.value.length);joined.set(this.buffer);joined.set(result.value,this.buffer.length);this.buffer=joined;
  }finally{clearTimeout(timer);}
 }
 async line(){for(;;){let end=-1;for(let i=0;i<this.buffer.length-1;i++)if(this.buffer[i]===13&&this.buffer[i+1]===10){end=i;break;}
  if(end>=0){const s=dec.decode(this.buffer.subarray(0,end));this.buffer=this.buffer.slice(end+2);return s;}
  if(this.buffer.length>262144)throw new Error('Cabecera IMAP demasiado grande');await this.readMore();}}
 async bytes(n){if(n>4*1024*1024)throw new Error('Un mensaje supera el límite de 4 MiB de esta consulta');while(this.buffer.length<n)await this.readMore();const b=this.buffer.slice(0,n);this.buffer=this.buffer.slice(n);return b;}
 async command(command){
  const tag='A'+(++this.counter);await this.writer.write(enc.encode(tag+' '+command+'\r\n'));const frames=[];
  for(;;){const line=await this.line();if(line.startsWith(tag+' ')){
   if(!new RegExp('^'+tag+' OK\\b','i').test(line))throw new Error(command.startsWith('LOGIN')?'Gmail rechazó el correo o la clave de aplicación':'Gmail rechazó una operación IMAP');return frames;
  }
  if(/^\* BYE\b/i.test(line))throw new Error('Gmail cerró la sesión IMAP');
  const literal=/\{(\d+)\+?\}$/.exec(line);
  if(!literal && frames.at(-1)?.data && !line.startsWith('* ')){frames.at(-1).line+=' '+line;continue;}
  frames.push({line,data:literal?await this.bytes(Number(literal[1])):null});
  }
 }
 async folder(requested){
  if(requested)return requested;
  const frames=await this.command('LIST "" "*"');
  for(const f of frames)if(/\([^)]*\\All(?:\s|\))/.test(f.line)){
   if(f.data)return dec.decode(f.data);
   const match=/\)\s+(?:"(?:[^"\\]|\\.)*"|NIL)\s+("(?:[^"\\]|\\.)*"|[^\s]+)\s*$/.exec(f.line);
   if(match)return match[1].startsWith('"')?JSON.parse(match[1]):match[1];
  }
  throw new Error('No se encontró Todos los correos. Activa su visibilidad IMAP en Gmail o indica una carpeta.');
 }
 async select(folder){const frames=await this.command('EXAMINE '+quote(folder));const f=frames.find(f=>/^\* \d+ EXISTS$/i.test(f.line));return f?Number(f.line.split(' ')[1]):0;}
 async close(){clearTimeout(this.deadline);try{await this.socket?.close();}catch{}try{this.reader?.releaseLock();this.writer?.releaseLock();}catch{}}
}
