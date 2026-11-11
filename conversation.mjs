// Authenticated human/agent conversation, scoped to the physical game.
// The only trust boundary is the HTTP server: never accept a client-supplied role.
import fs from "node:fs";
import crypto from "node:crypto";

const LIMIT=180;
const TEXT_LIMIT=1200;
const HISTORY_BATCH=80;
export function createConversation({file=null}={}){
 let entries=[],seq=0,lastAgentPoll=0;
 if(file){
  try{
   const loaded=JSON.parse(fs.readFileSync(file,"utf8"));
   if(Array.isArray(loaded.messages)){
    entries=loaded.messages.filter(m=>m&&Number.isInteger(m.id)&&
      (m.role==="human"||m.role==="ai")&&typeof m.text==="string").slice(-LIMIT);
    seq=Math.max(Number(loaded.seq)||0,...entries.map(m=>m.id),0);
   }
  }catch{}
 }
 function save(){
  if(!file)return;
  const temp=file+"."+crypto.randomBytes(5).toString("hex")+".tmp";
  try{
   fs.writeFileSync(temp,JSON.stringify({seq,messages:entries}),{flag:"wx",mode:0o600});
   fs.renameSync(temp,file);
  }finally{try{fs.unlinkSync(temp);}catch{}}
 }
 function post(role,text){
  if(role!=="human"&&role!=="ai")throw Error("Émetteur non autorisé");
  if(typeof text!=="string"||!text.trim()||text.length>TEXT_LIMIT)
   throw Error("Message obligatoire de 1 à "+TEXT_LIMIT+" caractères");
  const entry={id:++seq,role,text:text.trim(),at:new Date().toISOString()};
  entries.push(entry);entries=entries.slice(-LIMIT);save();
  return entry;
 }
 function list(after=0){
  const cursor=Number(after);
  if(!Number.isInteger(cursor)||cursor<0)throw Error("Curseur de messages invalide");
  return {messages:entries.filter(m=>m.id>cursor).slice(-HISTORY_BATCH),
   lastId:seq,agentSeenAt:lastAgentPoll||null};
 }
 function markAgentPoll(){lastAgentPoll=Date.now();}
 function clear(){entries=[];seq=0;lastAgentPoll=0;save();}
 return {post,list,markAgentPoll,clear};
}
