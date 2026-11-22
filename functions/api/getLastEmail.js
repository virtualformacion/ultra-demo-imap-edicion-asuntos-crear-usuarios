import {connect} from 'cloudflare:sockets';
import {readMailbox} from '../../lib/imap-mail.js';
import {consultHandler} from '../../lib/consult-handler.js';
export async function onRequest(context){return consultHandler(context,(box,password)=>readMailbox(connect,box,password));}
