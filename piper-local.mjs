import fs from "node:fs/promises";
import {existsSync} from "node:fs";
import path from "node:path";
import {spawn} from "node:child_process";
import {once} from "node:events";

// Optional, user-supplied local voice. No binaries or weights are redistributed.
export function createLocalPiper({userData,spawnImpl=spawn,timeoutMs=12000}){
 const root=path.join(userData,"speech","piper");
 const pythonTarget=path.join(root,"python");
 const python=process.env.RIFTBOUND_PIPER_PYTHON||"py.exe";
 const model=path.join(root,"fr_FR-siwis-medium.onnx");
 let child=null,job=null;
 const installed=()=>[path.join(pythonTarget,"piper","__main__.py"),model,model+".json"].every(existsSync);
 const status=()=>({installed:installed(),active:!!child,voice:"SIWIS · français"});
 const stop=()=>{try{child?.kill();}catch{}};
 async function generate(text){
  const tmpRoot=path.join(userData,"temp");
  await fs.mkdir(tmpRoot,{recursive:true});
  const tmp=await fs.mkdtemp(path.join(tmpRoot,"piper-"));
  const out=path.join(tmp,"speech.wav");
  let timer;
  try{
   const worker=spawnImpl(python,[...(process.env.RIFTBOUND_PIPER_PYTHON?[]:["-3.12"]),
    "-s","-m","piper","--model",model,"--output-file",out],{
    cwd:root,stdio:["pipe","ignore","ignore"],windowsHide:true,
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
 return {status,synthesize,stop};
}
