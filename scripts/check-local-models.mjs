// Exercise the installed engines without modifying the client installation.
import {spawn,execFile} from "node:child_process";
import {once} from "node:events";
import {promisify} from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import {audioToWav} from "../local-voice.mjs";
import {createIntegratedAI,extractJSON} from "../integrated-ai.mjs";
import {applyCommand,createState} from "../core.mjs";
import {llamaServerArgs,ADVANCED_LOCAL_MODEL,DEFAULT_LOCAL_MODEL,LOCAL_MODELS} from "../local-ai-profiles.mjs";

const useCPU=process.argv.includes("--cpu");
const [rootArg,wavArg]=process.argv.slice(2).filter(x=>x!=="--cpu");
if(!rootArg)throw Error("Usage: node scripts/check-local-models.mjs CHEMIN_CLIENT [VOIX_PCM_MONO.wav]");
const root=path.resolve(rootArg);
const out=path.resolve("dist","model-smoke");
await fs.mkdir(out,{recursive:true});
const qwenRoot=path.join(root,"free-opponent");
const backend=useCPU?"cpu":"vulkan";
const modelId=useCPU?DEFAULT_LOCAL_MODEL:ADVANCED_LOCAL_MODEL;
const engine=path.join(qwenRoot,useCPU?"llama-b12277":"llama-b12277-vulkan","llama-server.exe");
const model=path.join(qwenRoot,"models",LOCAL_MODELS[modelId].file);
const port=useCPU?21965:21964;
const origin="http://127.0.0.1:"+port;
let qwenTime;
const args=llamaServerArgs({modelFile:model,model:modelId,backend,threads:useCPU?4:8,ctx:useCPU?4096:8192});
args[args.indexOf("--port")+1]=String(port);
const log=await fs.open(path.join(out,"qwen-"+backend+".log"),"w");
const child=spawn(engine,args,{cwd:path.dirname(engine),stdio:["ignore",log.fd,log.fd],windowsHide:true});
const stopped=once(child,"close");
void stopped.catch(()=>{});
try{
 const begin=performance.now();
 let ready=false;
 for(let i=0;i<120&&child.exitCode===null;i++){
  try{const response=await fetch(origin+"/health",{signal:AbortSignal.timeout(400)});
   if(response.ok){ready=true;break;}
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 if(!ready)throw Error("llama-server indisponible; consulter dist/model-smoke/qwen-"+backend+".log");
 const coldMs=Math.round(performance.now()-begin);
 const t=performance.now();
 const res=await fetch(origin+"/v1/chat/completions",{method:"POST",
  headers:{"Content-Type":"application/json"},signal:AbortSignal.timeout(25000),body:JSON.stringify({
   model:modelId,temperature:0,max_tokens:80,chat_template_kwargs:{enable_thinking:false},
   response_format:{type:"json_object"},messages:[
    {role:"system",content:'Tu joues à Riftbound. Réponds en JSON avec une seule clé "choice" et la valeur numérique d’un coup proposé.'},
    {role:"user",content:"0 : passer et perdre à la prochaine occupation. 1 : conquérir maintenant pour gagner. Quel coup choisis-tu ?"}
   ]})});
 if(!res.ok)throw Error("Qwen HTTP "+res.status);
 const result=await res.json();
 const chosen=extractJSON(result.choices?.[0]?.message?.content);
 if(chosen.choice!==1)throw Error("Qwen n’a pas choisi la victoire disponible : "+JSON.stringify(chosen));
 qwenTime=Math.round(performance.now()-t);
 console.log(JSON.stringify({qwen:modelId,backend,coldMs,decisionMs:qwenTime,chosen,
  generatedTokens:result.usage?.completion_tokens}));
 if(!useCPU)await checkTableQuestions();
}finally{
 if(child.exitCode===null)child.kill();
 try{await stopped;}catch{}
 await log.close();
}

async function checkTableQuestions(){
 const scratch=await fs.mkdtemp(path.join(out,"grounded-qwen-"));
 const card=(name,type="Unit",might=0)=>({code:name,name,type,energy:0,might});
 let state=createState({seed:17});
 const apply=command=>{state=applyCommand(state,command);};
 apply({type:"setup-human",legend:card("Shen","Legend"),champion:card("Chosen Shen"),
  battlefield:card("Grove","Battlefield")});
 apply({type:"start",player:"ai"});
 apply({type:"phase",phase:"Main"});
 apply({type:"add",player:"human",card:card("Disciple test","Unit",1),zone:"battlefield",battlefield:0});
 apply({type:"add",player:"ai",card:card("Blade test","Unit",4),zone:"base"});
 apply({type:"add",player:"ai",card:card("Assassin test","Unit",5),zone:"base"});
 apply({type:"combat-attack",player:"ai",battlefield:0,
  uids:state.cards.filter(c=>c.owner==="ai"&&c.zone==="base").map(c=>c.uid)});
 apply({type:"combat-pass",player:"ai"});
 let answer,proposalTried=false,requests=0;
 const opponent=createIntegratedAI({userData:scratch,getState:()=>state,
  applyBatch:()=>{proposalTried=true;throw Error("Une question ne doit jamais muter le plateau.");},
  sendMessage:text=>answer?.(text),getMessages:()=>({session:"qwen-report-fixture",messages:[]}),
  getCatalog:async()=>[],
  fetchImpl:(url,options)=>{
   requests++;
   return fetch(origin+new URL(url).pathname,options);
  }
 });
 opponent.configure({provider:"free",model:modelId,enabled:true});
 const ask=async(label,question,pattern,source="engine")=>{
  const before=state.revision,beforeRequests=requests,begin=performance.now();
  const text=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error("Aucune réponse à "+label)),23000);
   answer=reply=>{clearTimeout(timer);resolve(reply);};
   opponent.onHumanMessage(question);
  });
  const actualSource=requests===beforeRequests?"engine":"qwen";
  console.log(JSON.stringify({qwen:modelId,source:actualSource,scenario:label,replyMs:Math.round(performance.now()-begin),text}));
  if(state.revision!==before||proposalTried||actualSource!==source||!pattern.test(text))
   throw Error("Réponse non conforme pour "+label);
 };
 await ask("confrontation-en-cours","Quelle est la force provisoire en attaque, puis en défense ?",
  /\b9\b[^\n]*\b1\b/);
 apply({type:"combat-pass",player:"human"});
 apply({type:"next-turn"});
 await ask("combat-resolu","Quels étaient les totaux d’attaque puis de défense au dernier combat ?",
  /\b9\b[^\n]*\b1\b/);
 await ask("priorite","Comment fonctionne la priorité quand un sort est sur la chaîne ?",
  /pass|r[ée]action/i,"qwen");
}

if(wavArg){
 const raw=await fs.readFile(wavArg);
 let offset=12,rate=0,pcm=null;
 while(offset+8<raw.length){
  const tag=raw.toString("ascii",offset,offset+4),len=raw.readUInt32LE(offset+4);
  if(tag==="fmt "){
   if(raw.readUInt16LE(offset+8)!==1||raw.readUInt16LE(offset+10)!==1||raw.readUInt16LE(offset+22)!==16)
    throw Error("La fixture WAV doit être PCM mono 16 bits.");
   rate=raw.readUInt32LE(offset+12);
  }
  if(tag==="data"){pcm=raw.subarray(offset+8,offset+8+len);break;}
  offset+=len+8+(len%2);
 }
 if(!pcm||!rate)throw Error("WAV sans audio lisible.");
 const pulse=new Float32Array(pcm.length/2);
 for(let i=0;i<pulse.length;i++)pulse[i]=pcm.readInt16LE(i*2)/32768;
 const wav=path.join(out,"input-16khz.wav"),prefix=path.join(out,"whisper");
 await fs.writeFile(wav,Buffer.from(await audioToWav([pulse],rate).arrayBuffer()));
 const bin=path.join(root,"speech","engine","Release","whisper-cli.exe");
 const weights=path.join(root,"speech","models","ggml-small.bin");
 const t=performance.now();
 await promisify(execFile)(bin,["-m",weights,"-f",wav,"-l","fr","-ng","-nt","-otxt","-of",prefix,
  "--prompt","Riftbound. Disciple of Shen. Mournful Witness."],
  {cwd:path.dirname(bin),windowsHide:true,timeout:90000});
 const text=(await fs.readFile(prefix+".txt","utf8")).trim();
 if(!text)throw Error("Whisper a renvoyé une transcription vide.");
 console.log(JSON.stringify({whisper:"small",transcriptionMs:Math.round(performance.now()-t),text}));
}
