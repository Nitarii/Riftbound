// Free multilingual CPU speech recognizer, downloaded only after user consent.
// The single Whisper Small model, verified archives and temporary WAV files stay under userData/speech.
import fs,{createReadStream} from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import {spawn} from "node:child_process";
import {stopOwnedProcess} from "./process-lifecycle.mjs";
import {once} from "node:events";
import net from "node:net";
import {downloadVerified} from "./free-ai.mjs";

export const WHISPER_RELEASE="b5454";
export const WHISPER_ARCHIVE="whisper-bin-x64.zip";
export const WHISPER_ENGINE_URL="https://github.com/ggml-org/whisper.cpp/releases/download/"+WHISPER_RELEASE+"/"+WHISPER_ARCHIVE;
export const WHISPER_ENGINE_SHA="6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb";
export const WHISPER_MODEL="small";
export const WHISPER_OPTIONS=Object.freeze({
 small:{label:"Whisper Small · multilingue",file:"ggml-small.bin",
  url:"https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin?download=true",
  sha256:"1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",bytes:488000000}
});
const utterances=["Riftbound","Loyal Poro","Shen","Jinx","Runes","Channel","Exhaust",
 "Battlefield","Chosen Champion","Base","Draw","Ready","Unit","Spell","Gear","Mulligan"];
export function whisperPrompt(cards=[],max=220){
 const names=[...utterances.slice(0,6),...(cards||[]).map(c=>typeof c==="string"?c:c?.name).filter(Boolean),...utterances.slice(6)];
 const seen=new Set(),selected=[];
 for(const name of names){
  const cleaned=String(name).replace(/[\r\n,;.]+/g," ").trim().slice(0,50);
  if(!cleaned||seen.has(cleaned.toLowerCase()))continue;
  if((selected.join(", ").length+cleaned.length+3)>max)break;
  seen.add(cleaned.toLowerCase());selected.push(cleaned);
 }
 return selected.join(", ")+".";
}
export function whisperServerArguments({model,port,threads=4}){
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error("Port local Whisper invalide.");
 return ["--model",model,"--host","127.0.0.1","--port",String(port),"--no-gpu",
  "--threads",String(Math.min(8,Math.max(1,threads))),"--no-context"];
}
export function whisperArguments({model,wav,out,language="auto",prompt=""}){
 const lang=["fr","en","auto"].includes(language)?language:"auto";
 const args=["--model",model,"--file",wav,"--language",lang,"--no-gpu",
  "--no-prints","--no-timestamps","--output-txt","--output-file",out,
  "--threads",String(Math.min(4,Math.max(1,os.availableParallelism?.()||4)))];
 if(prompt)args.push("--prompt",prompt.slice(0,220));
 return args;
}
function findWhisper(dir,depth=4){
 if(depth<0||!fs.existsSync(dir))return "";
 const entries=fs.readdirSync(dir,{withFileTypes:true});
 const bin=entries.find(x=>x.isFile()&&/^whisper-cli\.exe$/i.test(x.name));
 if(bin)return path.join(dir,bin.name);
 for(const item of entries)if(item.isDirectory()){
  const nested=findWhisper(path.join(dir,item.name),depth-1);
  if(nested)return nested;
 }
 return "";
}
async function digest(file){
 const h=crypto.createHash("sha256");
 for await(const bytes of createReadStream(file))h.update(bytes);
 return h.digest("hex");
}
export function validateWAV(audio){
 if(!Buffer.isBuffer(audio)||audio.length<44||audio.length>4_000_000||
  audio.toString("ascii",0,4)!=="RIFF"||audio.toString("ascii",8,12)!=="WAVE")
  throw Error("Enregistrement WAV invalide ou trop long (limite : 4 Mo).");
 // Browser supplies PCM16 mono 16 kHz. Reject unexpected channel/format.
 const fmt=audio.indexOf(Buffer.from("fmt "),12);
 if(fmt<0||fmt+24>audio.length||audio.readUInt16LE(fmt+8)!==1||
    audio.readUInt16LE(fmt+10)!==1||audio.readUInt32LE(fmt+12)!==16000||
    audio.readUInt16LE(fmt+22)!==16)
  throw Error("Audio attendu : WAV PCM 16 bits, mono, 16 kHz.");
 return audio;
}
export function createLocalWhisper({
 userData,fetchImpl=fetch,spawnImpl=spawn,platform=process.platform,download=downloadVerified,
 extract=null
}){
 const root=path.join(userData,"speech"),engineDir=path.join(root,"engine"),
  downloads=path.join(root,"downloads"),models=path.join(root,"models"),temp=path.join(root,"temp");
 const stamp=path.join(engineDir,".verified.json"),preferences=path.join(root,".speech-preferences.json");
 const selected=WHISPER_MODEL;
 let job=null,transcribing=false,activeProc=null,serverProc=null,serverPort=0,warmPromise=null,idleTimer=null,extractProc=null,stopping=false,downloadAbort=null;
 let enabled=true; // Preserve the existing hands-free default for current users.
 const ensureRunning=()=>{if(stopping)throw Error("Installation vocale interrompue : fermeture du compagnon.");};
 async function unpack(zip,dir,env){
  if(extract){await extract(zip,dir,env);return;}
  const proc=spawnImpl("tar",["-xf",zip,"-C",dir],{
   stdio:"ignore",windowsHide:true,env
  });
  extractProc=proc;
  try{
   const [status]=await once(proc,"close");
   if(status!==0)throw Error("Extraction de whisper.cpp impossible.");
  }finally{if(extractProc===proc)extractProc=null;}
 }
 try{
  const saved=JSON.parse(fs.readFileSync(preferences,"utf8"));
  if(saved.enabled===false)enabled=false;
 }catch{}
 function savePreferences(){
  fs.mkdirSync(root,{recursive:true});
  fs.writeFileSync(preferences,JSON.stringify({selected,enabled}),{mode:0o600});
 }
 let info={phase:"idle",progress:0,error:"",message:"Transcription locale non installée."};
 const modelPath=id=>path.join(models,WHISPER_OPTIONS[id].file);
 const installed=id=>Boolean(findWhisper(engineDir)&&fs.existsSync(stamp)&&fs.existsSync(modelPath(id)));
 function status(){
  const ready=installed(selected);
  const effective=ready&&info.phase==="idle"?
   {...info,phase:"ready",progress:100,message:"Whisper "+selected+" installé dans ton dossier."}:info;
  const running=serverProc||activeProc;
  const processActive=Boolean(running&&running.exitCode==null&&
   running.signalCode==null&&!running.killed);
  return {...effective,installed:ready,selected,enabled,
   processing:Boolean(transcribing&&processActive),processActive,
   pid:processActive&&Number.isSafeInteger(running.pid)?running.pid:null,
   installing:Boolean(job),
   engineInstalled:Boolean(findWhisper(engineDir)),options:Object.fromEntries(
   Object.entries(WHISPER_OPTIONS).map(([id,c])=>[id,{label:c.label,bytes:c.bytes,installed:installed(id)}])),
  running:Boolean(job)};}
 function stopServer(){
  if(idleTimer){clearTimeout(idleTimer);idleTimer=null;}
  const proc=serverProc;serverProc=null;serverPort=0;
  if(proc)try{stopOwnedProcess(proc);}catch{}
 }
 function extendServerIdle(){
  if(idleTimer)clearTimeout(idleTimer);
  idleTimer=setTimeout(()=>{if(!transcribing)stopServer();},5*60*1000);
  idleTimer.unref?.();
 }
 async function startWhisperServer(){
  if(serverProc&&serverPort)return serverPort;
  if(warmPromise)return warmPromise;
  if(stopping||!enabled||!installed(selected))return 0;
  const binary=findWhisper(engineDir);
  const serverBinary=path.join(path.dirname(binary),"whisper-server.exe");
  if(!binary||!fs.existsSync(serverBinary))return 0;
  warmPromise=(async()=>{
   const probe=net.createServer();
   const port=await new Promise((resolve,reject)=>{
    probe.once("error",reject);
    probe.listen(0,"127.0.0.1",()=>resolve(probe.address().port));
   });
   await new Promise(resolve=>probe.close(resolve));
   if(stopping)return 0;
   const proc=spawnImpl(serverBinary,whisperServerArguments({
    model:modelPath(selected),port,threads:Math.min(8,os.availableParallelism?.()||4)
   }),{cwd:path.dirname(serverBinary),windowsHide:true,stdio:"ignore",
    env:{...process.env,TEMP:temp,TMP:temp,TMPDIR:temp}});
   serverProc=proc;
   proc.once("error",()=>{if(serverProc===proc){serverProc=null;serverPort=0;}});
   proc.once("close",()=>{if(serverProc===proc){serverProc=null;serverPort=0;}});
   for(let attempt=0;attempt<125;attempt++){
    if(stopping||serverProc!==proc)return 0;
    try{
     const response=await fetch("http://127.0.0.1:"+port+"/",{
      signal:AbortSignal.timeout(700),cache:"no-store"
     });
     if(response.ok){serverPort=port;extendServerIdle();return port;}
    }catch{}
    await new Promise(resolve=>setTimeout(resolve,120));
   }
   stopServer();
   return 0;
  })();
  try{return await warmPromise;}finally{warmPromise=null;}
 }
 function warm(){
  if(!enabled||stopping||!installed(selected))return {warming:false};
  void startWhisperServer().catch(()=>{stopServer();});
  return {warming:true,model:selected};
 }
 async function transcribeOnServer(audio,{language="auto",cards=[]}={}){
  const port=await startWhisperServer();
  if(!port)return null;
  const data=new FormData();
  data.append("file",new Blob([audio],{type:"audio/wav"}),"voice.wav");
  data.append("language",["fr","en","auto"].includes(language)?language:"auto");
  data.append("prompt",whisperPrompt(cards));
  data.append("response_format","json");
  data.append("temperature","0");
  const response=await fetch("http://127.0.0.1:"+port+"/inference",{
   method:"POST",body:data,signal:AbortSignal.timeout(90000)
  });
  if(!response.ok)throw Error("Whisper local HTTP "+response.status);
  const result=await response.json();
  extendServerIdle();
  return {text:String(result.text||"").replace(/\\[[^\\]]{1,50}\\]/g," ")
   .replace(/\\s+/g," ").trim().slice(0,1200),language,model:selected};
 }
 async function prepare(id){
  if(id!==WHISPER_MODEL)throw Error("Un seul modèle vocal est disponible : Whisper Small.");
  if(platform!=="win32")throw Error("Whisper intégré est destiné au Windows x64.");
  const dirs=[root,downloads,models,temp,engineDir];
  dirs.forEach(dir=>fs.mkdirSync(dir,{recursive:true}));
  const config=WHISPER_OPTIONS[id];
  const env={...process.env,TEMP:temp,TMP:temp,TMPDIR:temp};
  if(!findWhisper(engineDir)||!fs.existsSync(stamp)){
   info={phase:"engine",progress:0,error:"",message:"Téléchargement du moteur vocal officiel…"};
   const zip=path.join(downloads,WHISPER_ARCHIVE);
   await download(WHISPER_ENGINE_URL,zip,WHISPER_ENGINE_SHA,
    (n,total)=>{info.progress=total?Math.round(n/total*100):0;},fetchImpl,
    {signal:downloadAbort?.signal});
   ensureRunning();
   info={...info,phase:"extracting",message:"Extraction du moteur vocal…"};
   await unpack(zip,engineDir,env);
   ensureRunning();
   if(!findWhisper(engineDir))throw Error("whisper-cli.exe absent de l'archive officielle.");
   fs.writeFileSync(stamp,JSON.stringify({release:WHISPER_RELEASE,sha256:WHISPER_ENGINE_SHA}),{mode:0o600});
   try{fs.rmSync(zip,{force:true});}catch{}
  }
  info={phase:"model",progress:0,error:"",message:"Téléchargement de "+config.label+"…"};
  await download(config.url,modelPath(id),config.sha256,
   (n,total)=>{info.progress=total?Math.round(n/total*100):Math.round(n/config.bytes*100);},fetchImpl,
   {signal:downloadAbort?.signal});
  ensureRunning();
  enabled=true;
  savePreferences();
  // Old multilingual Base is obsolete and no longer selectable.
  try{fs.rmSync(path.join(models,"ggml-base.bin"),{force:true});}catch{}
  info={phase:"ready",progress:100,error:"",message:"Whisper Small prêt, 100 % local."};
 }
 function begin(id=WHISPER_MODEL){
  if(job)return status();
  if(id!==WHISPER_MODEL)throw Error("Un seul modèle vocal est disponible : Whisper Small.");
  stopping=false;
  downloadAbort=new AbortController();
  const promise=prepare(id).catch(e=>{if(stopping)return;info={phase:"error",error:String(e.message||e).slice(0,250),
   message:"Installation vocale interrompue.",progress:0};}).finally(()=>{if(job===promise)job=null;downloadAbort=null;});
  job=promise;return status();
 }
 function stop({disable=false}={}){
  if(disable){
   enabled=false;
   savePreferences();
  }
  stopping=true;
  downloadAbort?.abort();
  if(extractProc)stopOwnedProcess(extractProc);
  extractProc=null;
  if(activeProc)stopOwnedProcess(activeProc);
  activeProc=null;transcribing=false;
 }
 function enable(){
  if(!installed(selected))throw Error("Installe d'abord Whisper avant de l'activer.");
  enabled=true;stopping=false;savePreferences();
  info={...info,phase:"ready",error:"",message:"Whisper activé : aucun processus tant qu'une transcription n'est pas demandée."};
  return status();
 }
 async function transcribe(buffer,{language="auto",cards=[]}={}){
  if(!enabled)throw Error("Whisper désactivé dans le gestionnaire : réactive-le pour utiliser le micro local.");
  if(stopping)throw Error("Whisper arrêté.");
  if(!installed(selected))throw Error("Whisper n'est pas installé. Installe le modèle dans le compagnon.");
  if(transcribing)throw Error("Une transcription est déjà en cours.");
  validateWAV(buffer);
  fs.mkdirSync(temp,{recursive:true});
  const id=crypto.randomBytes(12).toString("hex");
  const wav=path.join(temp,id+".wav"),out=path.join(temp,id);
  const binary=findWhisper(engineDir),env={...process.env,TEMP:temp,TMP:temp,TMPDIR:temp};
  const args=whisperArguments({model:modelPath(selected),wav,out,language,
   prompt:whisperPrompt(cards)});
  transcribing=true;
  try{
   fs.writeFileSync(wav,buffer,{mode:0o600,flag:"wx"});
   const result=await new Promise((resolve,reject)=>{
    const proc=spawnImpl(binary,args,{cwd:path.dirname(binary),windowsHide:true,stdio:"ignore",env});
    activeProc=proc;
    let closed=false;
    const timer=setTimeout(()=>{try{proc.kill();}catch{};if(!closed)reject(Error("Whisper a dépassé le délai de 90 secondes."));},90000);
    proc.once("error",e=>{clearTimeout(timer);closed=true;reject(e);});
    proc.once("close",code=>{
     clearTimeout(timer);closed=true;
     if(code!==0)return reject(Error("Whisper a échoué (code "+code+")."));
     resolve(true);
    });
   });
   const text=fs.readFileSync(out+".txt","utf8").replace(/\[[^\]]{1,50}\]/g," ").replace(/\s+/g," ").trim().slice(0,1200);
   return {text,language,model:selected};
  }finally{
   activeProc=null;transcribing=false;
   for(const name of [wav,out+".txt",out+".json"])try{fs.rmSync(name,{force:true});}catch{}
  }
 }
 return {status,begin,stop,enable,transcribe,root};
}
