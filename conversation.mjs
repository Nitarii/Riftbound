// Authenticated human/agent conversation, scoped to the physical game.
// The only trust boundary is the HTTP server: never accept a client-supplied role.
import fs from "node:fs";
import crypto from "node:crypto";

const LIMIT=180;
const TEXT_LIMIT=1200;
const HISTORY_BATCH=80;
export function createConversation({file=null}={}){
 let entries=[],seq=0,lastAgentPoll=0,session=crypto.randomUUID();
 if(file){
  try{
   const loaded=JSON.parse(fs.readFileSync(file,"utf8"));
   if(typeof loaded.session==="string"&&loaded.session.length<=80)session=loaded.session;
   if(Array.isArray(loaded.messages)){
    entries=loaded.messages.filter(m=>m&&Number.isInteger(m.id)&&
      (m.role==="human"||m.role==="ai")&&typeof m.text==="string").slice(-LIMIT)
      .map(m=>m.table?.status==="pending"?{...m,table:{status:"review"}}:m);
    seq=Math.max(Number(loaded.seq)||0,...entries.map(m=>m.id),0);
   }
  }catch{}
 }
 function save(){
  if(!file)return;
  const temp=file+"."+crypto.randomBytes(5).toString("hex")+".tmp";
  try{
   fs.writeFileSync(temp,JSON.stringify({seq,session,messages:entries}),{flag:"wx",mode:0o600});
   fs.renameSync(temp,file);
  }finally{try{fs.unlinkSync(temp);}catch{}}
 }
 function post(role,text,{trackTable=false,requestId,view}={}){
  if(role!=="human"&&role!=="ai")throw Error("Émetteur non autorisé");
  if(typeof text!=="string"||!text.trim()||text.length>TEXT_LIMIT)
   throw Error("Message obligatoire de 1 à "+TEXT_LIMIT+" caractères");
  if(requestId!==undefined&&(role!=="human"||typeof requestId!=="string"||!/^[A-Za-z0-9_-]{8,80}$/.test(requestId)))
   throw Error("Identifiant d’annonce invalide.");
  const entry={id:++seq,role,text:text.trim(),at:new Date().toISOString(),
   ...(requestId?{requestId}:{}),
   ...(role==="ai"&&view?{view}:{}),
   ...(role==="human"&&trackTable?{table:{status:"pending"}}:{})};
  entries.push(entry);entries=entries.slice(-LIMIT);save();
  return entry;
 }
 function findHumanRequest(requestId,text){
  if(!requestId)return null;
  const entry=entries.find(m=>m.role==="human"&&m.requestId===requestId);
  if(entry&&entry.text!==String(text??"").trim())throw Error("Identifiant déjà utilisé pour une autre annonce.");
  return entry||null;
 }
 function markTable(id,expectedSession,table){
  if(session!==expectedSession)return;
  const entry=entries.find(m=>m.id===id&&m.role==="human");
  if(!entry)return;
  entry.table=table;save();
 }
 function list(after=0,{agent=false}={}){
  const cursor=Number(after);
  if(!Number.isInteger(cursor)||cursor<0)throw Error("Curseur de messages invalide");
  let messages=entries.filter(m=>m.id>cursor);
  if(agent){
   const unresolved=messages.findIndex(m=>m.table?.status==="pending");
   if(unresolved>=0)messages=messages.slice(0,unresolved);
   messages=messages.slice(0,HISTORY_BATCH).map(({requestId,...entry})=>entry);
  }else messages=messages.slice(-HISTORY_BATCH);
  return {messages,lastId:agent?(messages.at(-1)?.id??cursor):seq,session,agentSeenAt:lastAgentPoll||null};
 }
 function markAgentPoll(){lastAgentPoll=Date.now();}
 function clear(){entries=[];seq=0;lastAgentPoll=0;session=crypto.randomUUID();save();}
 return {post,findHumanRequest,list,markTable,markAgentPoll,clear};
}
