import fs from "node:fs/promises";
import {existsSync} from "node:fs";
import path from "node:path";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {downloadVerified} from "./free-ai.mjs";

const archive="https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip";
const archiveHash="f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea";
const voiceBase="https://huggingface.co/rhasspy/piper-voices/resolve/cf910fb/fr/fr_FR/siwis/medium/";
const voiceFiles={
 "fr_FR-siwis-medium.onnx":"b1d946fd68d0347155fa59bce0a018924abbef3c1561181db45ca463d83963ef",
 "fr_FR-siwis-medium.onnx.json":"df814aa3dfedd00510a07144442cc0a220ff21e43d03c3b078444fc0be68fc37",
 "MODEL_CARD":"f75d76ec577b5e7a49a7462883d31ef65383022387818a9a0b75bdaf90b9010c"
};

export function createLocalPiper({userData,spawnImpl=spawn,timeoutMs=12000}){
 const root=path.join(userData,"speech","piper");
 const nativeRoot=path.join(userData,"speech","piper-native");
 const executable=path.join(nativeRoot,"piper","piper.exe");
 const pythonTarget=path.join(root,"python");
 const python=process.env.RIFTBOUND_PIPER_PYTHON||"py.exe";
 const model=path.join(root,"fr_FR-siwis-medium.onnx");
 let child=null,job=null,installation=null,installError="",stageLabel="";
 const nativeModel=path.join(nativeRoot,path.basename(model));
 const nativeInstalled=()=>[executable,nativeModel,nativeModel+".json"].every(existsSync);
 const installed=()=>nativeInstalled()||[path.join(pythonTarget,"piper","__main__.py"),model,model+".json"].every(existsSync);
 const status=()=>({installed:installed(),native:nativeInstalled(),installing:!!installation,active:!!child,
  voice:"SIWIS · français",message:stageLabel,error:installError});
 const stop=()=>{installation?.abort();try{child?.kill();}catch{}};
 function install(){
  if(process.platform!=="win32"||process.arch!=="x64")throw Error("Piper est disponible sur Windows x64.");
  if(installation||nativeInstalled())return status();
  const controller=new AbortController();
  installation=controller;installError="";stageLabel="Téléchargement de Piper…";
  void (async()=>{
   let stage;
   try{
    await fs.mkdir(path.dirname(nativeRoot),{recursive:true});
    stage=await fs.mkdtemp(path.join(path.dirname(nativeRoot),"piper-download-"));
    const zip=path.join(stage,"piper.zip");
    await downloadVerified(archive,zip,archiveHash,undefined,fetch,{signal:controller.signal});
    stageLabel="Préparation de la voix française…";
    const extract=spawnImpl("tar.exe",["-xf",zip,"-C",stage],{windowsHide:true,stdio:"ignore",signal:controller.signal});
    const [code]=await once(extract,"close");
    if(code!==0||!existsSync(path.join(stage,"piper","piper.exe")))throw Error("Archive Piper non exploitable.");
    await fs.unlink(zip);
    for(const [name,hash] of Object.entries(voiceFiles))
     await downloadVerified(voiceBase+name,path.join(stage,name),hash,undefined,fetch,{signal:controller.signal});
    // The standalone CLI emits and accepts individual Unicode codepoints.
    // SIWIS also ships multi-codepoint entries that this CLI cannot parse or emit.
    const configPath=path.join(stage,path.basename(model)+".json");
    const voiceConfig=JSON.parse(await fs.readFile(configPath,"utf8"));
    voiceConfig.phoneme_id_map=Object.fromEntries(Object.entries(voiceConfig.phoneme_id_map)
     .filter(([phoneme])=>[...phoneme].length===1));
    await fs.writeFile(configPath,JSON.stringify(voiceConfig),"utf8");
    controller.signal.throwIfAborted();
    await fs.rename(stage,nativeRoot);
    stage=null;
    stageLabel="";
   }catch(error){
    installError=String(error.message||error);
   }finally{
    if(stage)await fs.rm(stage,{recursive:true,force:true}).catch(()=>{});
    installation=null;
   }
  })();
  return status();
 }
 async function generate(text){
  const tmpRoot=path.join(userData,"temp");
  await fs.mkdir(tmpRoot,{recursive:true});
  const tmp=await fs.mkdtemp(path.join(tmpRoot,"piper-"));
  const out=path.join(tmp,"speech.wav");
  let timer;
  try{
   const native=nativeInstalled();
   const args=native?["--model",nativeModel,"--output_file",out]:
    [...(process.env.RIFTBOUND_PIPER_PYTHON?[]:["-3.12"]),"-s","-m","piper","--model",model,"--output-file",out];
   const worker=spawnImpl(native?executable:python,args,{
    cwd:native?path.dirname(executable):root,stdio:["pipe","ignore","ignore"],windowsHide:true,
    env:{...process.env,PYTHONPATH:pythonTarget,PYTHONNOUSERSITE:"1",PYTHONUTF8:"1",PYTHONDONTWRITEBYTECODE:"1"}
   });
   child=worker;
   worker.stdin.on("error",()=>{});
   const exit=once(worker,"close");
   timer=setTimeout(()=>{try{worker.kill();}catch{}},timeoutMs);
   worker.stdin.end(text+"\n","utf8");
   const [code]=await exit;
   if(code!==0)throw Error("La voix Piper n’a pas pu terminer la synthèse.");
   const wav=await fs.readFile(out);
   if(wav.length<44||wav.length>8_000_000||wav.toString("ascii",0,4)!=="RIFF")
    throw Error("Audio Piper non valide.");
   return wav;
  }finally{
   clearTimeout(timer);child=null;
   try{await fs.unlink(out);}catch{}
   try{await fs.rmdir(tmp);}catch{}
  }
 }
 async function synthesize(value){
  const text=String(value||"").replace(/[\x00-\x1F\x7F]/g," ").trim();
  if(!text||text.length>850)throw Error("Annonce vocale invalide.");
  if(!installed())throw Error("Voix Piper française non installée.");
  if(job)throw Error("Une synthèse vocale est déjà en cours.");
  job=generate(text);
  try{return await job;}finally{job=null;}
 }
 return {status,install,synthesize,stop};
}
