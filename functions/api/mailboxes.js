import {connect} from 'cloudflare:sockets';
import {mailboxHandler} from '../../lib/mailbox-handler.js';
import {testMailbox} from '../../lib/imap-mail.js';
export async function onRequest(context){return mailboxHandler(context,(mailbox,password)=>testMailbox(connect,mailbox,password));}
