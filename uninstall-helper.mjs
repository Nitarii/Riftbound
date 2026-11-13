// Independent Windows uninstaller. A verified copy of our own SEA executable
// runs outside the selected installation root: only then can Windows unlock
// and remove the installed executable and the complete managed directory.
// This mirrors the successfully tested standalone update-helper process.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import {spawn} from "node:child_process";
import {setTimeout as sleep} from "node:timers/promises";
import {inside,readMarker,OWNED_DIRS,OWNED_FILES,INSTALL_MARKER,
 legacyDataFolder} from "./portable.mjs";
const SELF_ARG="--riftbound-uninstall-helper";
const requestName="uninstall-request.json",statusName="uninstall-status.json";
const goName="uninstall-go.signal";
const rooted=p=>path.resolve(p);
const same=(a,b)=>rooted(a).toLowerCase()===rooted(b).toLowerCase();
const validPid=n=>Number.isSafeInteger(n)&&n>0;
const safeLocalRoot=r=>{
 const root=rooted(r),home=rooted(os.homedir());
 if(same(root,path.parse(root).root)||same(root,home)||
  ["downloads","desktop","documents","pictures"].includes(path.basename(root).toLowerCase()))
  throw Error("Dossier de désinstallation non dédié.");
 return root;
};
function status(root,phase,message){
 const updates=path.join(root,"updates");
 try{
  fs.mkdirSync(updates,{recursive:true});
  const file=path.join(updates,statusName),tmp=file+".tmp";
  fs.writeFileSync(tmp,JSON.stringify({phase,message}),{mode:0o600});
  fs.renameSync(tmp,file);
 }catch{}
}
function validated(request,{self=false}={}){
 if(!request||typeof request!=="object")throw Error("Demande de désinstallation absente.");
 const root=safeLocalRoot(request.root),exePath=rooted(request.exePath||"");
 const helperExe=rooted(request.helperExe||"");
 if(!same(path.dirname(exePath),root)||!/^RiftboundCompanion(?:-v\d+(?:\.\d+)*)?\.exe$/i.test(path.basename(exePath)))
  throw Error("Exécutable incompatible avec ce dossier.");
 if(inside(root,helperExe)||same(root,helperExe))
  throw Error("L'assistant ne peut pas être exécuté dans le dossier à supprimer.");
 if(!/^[a-f0-9]{48}$/.test(String(request.nonce||""))||
  !validPid(request.pid)||!String(request.instance||""))
  throw Error("Identifiants de désinstallation invalides.");
 if(self&&(!same(process.execPath,helperExe)||request.pid===process.pid))
  throw Error("Assistant ou PID de désinstallation incorrect.");
 const marker=readMarker(root);
 if(marker.instance!==request.instance||!same(path.join(root,marker.executable),exePath))
  throw Error("Le manifeste ne correspond pas à cette installation.");
 const record=JSON.parse(fs.readFileSync(path.join(root,"updates",requestName),"utf8"));
 if(record.nonce!==request.nonce||record.pid!==request.pid||!same(record.helperExe,helperExe))
  throw Error("Demande de désinstallation modifiée après confirmation.");
 return {root,exePath,helperExe,pid:request.pid,nonce:request.nonce,instance:request.instance};
}
export function launchUninstallHelper({root,exePath,pid=process.pid},{
 env=process.env,spawnImpl=spawn}={}){
 const base=safeLocalRoot(root),marker=readMarker(base),target=rooted(exePath);
 if(!same(path.dirname(target),base)||!same(path.join(base,marker.executable),target)||
  !validPid(pid))throw Error("Installation ou processus invalide.");
 const local=path.join(env.LOCALAPPDATA||path.join(os.homedir(),"AppData","Local"),"Temp");
 const helperDir=path.join(local,"Riftbound-Uninstall-"+crypto.randomBytes(12).toString("hex"));
 if(inside(base,helperDir)||same(base,helperDir))
  throw Error("Impossible de créer un assistant indépendant hors de l'installation.");
 fs.mkdirSync(helperDir,{recursive:false,mode:0o700});
 const helperExe=path.join(helperDir,"RiftboundUninstall.exe");
 const nonce=crypto.randomBytes(24).toString("hex");
 try{
  fs.copyFileSync(target,helperExe,fs.constants.COPYFILE_EXCL);
  const request={root:base,exePath:target,helperExe,pid,
   nonce,instance:marker.instance};
  fs.mkdirSync(path.join(base,"updates"),{recursive:true});
  fs.rmSync(path.join(base,"updates",statusName),{force:true});
  fs.rmSync(path.join(base,"updates",goName),{force:true});
  fs.writeFileSync(path.join(base,"updates",requestName),JSON.stringify(request),{mode:0o600});
  const child=spawnImpl(helperExe,[SELF_ARG],{
   cwd:helperDir,detached:true,windowsHide:true,stdio:"ignore",
   env:{...env,RIFTBOUND_UNINSTALL_REQUEST:Buffer.from(JSON.stringify(request)).toString("base64")}
  });
  if(!validPid(child?.pid))throw Error("L'assistant autonome ne s'est pas lancé.");
  child.unref?.();
  const janitor=startCleanupJanitor(helperDir,helperExe,child.pid,{env,spawnImpl});
  return {pid:child.pid,helperDir,janitorReady:janitor.ready,janitorPid:janitor.pid};
 }catch(error){
  try{fs.rmSync(helperDir,{recursive:true,force:true});}catch{}
  throw error;
 }
}
function pidAlive(pid){
 try{process.kill(pid,0);return true;}
 catch(e){return e?.code==="EPERM";}
}
async function waitUntil(callback,ms,error){
 const until=Date.now()+ms;
 while(Date.now()<until){if(callback())return;await sleep(150);}
 throw Error(error);
}
const symlinkSafe=p=>{
 if(!fs.existsSync(p))return;
 if(fs.lstatSync(p).isSymbolicLink())throw Error("Lien symbolique interdit : "+p);
};
const remove=p=>{
 if(!fs.existsSync(p))return;
 symlinkSafe(p);
 fs.rmSync(p,{recursive:true,force:true,maxRetries:30,retryDelay:250});
 if(fs.existsSync(p))throw Error("Suppression impossible : "+p);
};
async function clean(root){
 const marker=readMarker(root);
 if(!fs.existsSync(root))throw Error("Installation introuvable.");
 symlinkSafe(root);
 for(const name of OWNED_DIRS){
  if(name!=="updates")remove(path.join(root,name));
 }
 for(const name of OWNED_FILES)remove(path.join(root,name));
 for(const name of fs.readdirSync(root)){
  if(/^RiftboundCompanion(?:-v\d+(?:\.\d+)*)?\.exe$/i.test(name)||
   /^cloudflared-[a-f0-9]{16}\.exe$/i.test(name))
   remove(path.join(root,name));
 }
 const legacy=rooted(legacyDataFolder());
 if(!same(legacy,root)&&!inside(legacy,root)&&fs.existsSync(legacy)){
  symlinkSafe(legacy);
  for(const name of [...OWNED_DIRS,...OWNED_FILES])remove(path.join(legacy,name));
  for(const name of fs.readdirSync(legacy)){
   if(/^cloudflared-[a-f0-9]{16}\.exe$/i.test(name))remove(path.join(legacy,name));
  }
  if(!fs.readdirSync(legacy).length)fs.rmdirSync(legacy);
 }
 // Keep the unique installation marker until all other deletions succeed.
 remove(path.join(root,"updates"));
 remove(path.join(root,INSTALL_MARKER));
 if(!fs.readdirSync(root).length)fs.rmdirSync(root);
 if(fs.existsSync(root)){
  const remaining=fs.readdirSync(root).filter(name=>
   OWNED_DIRS.includes(name)||OWNED_FILES.includes(name)||name===INSTALL_MARKER||
   /^RiftboundCompanion(?:-v\d+(?:\.\d+)*)?\.exe$/i.test(name));
  if(remaining.length)throw Error("Des fichiers gérés restent dans le dossier.");
 }
}
function startCleanupJanitor(helperDir,helperExe,helperPid,{env=process.env,spawnImpl=spawn}={}){
 // Launch the janitor FROM THE STILL-RUNNING MANAGER, not from the one-shot
 // uninstaller which Windows can terminate before its own child executes.
 const ready=path.join(helperDir,"janitor-ready.signal");
 const phase=path.join(helperDir,"janitor-phase.txt");
 const scriptFile=path.join(helperDir,"janitor.ps1");
 const q=value=>"'"+String(value).replace(/'/g,"''")+"'";
 const script=[
  "$ErrorActionPreference='Stop'",
  "$targetPid="+helperPid,
  "$exe="+q(helperExe),
  "$dir="+q(helperDir),
  "$self="+q(scriptFile),
  "$ready="+q(ready),
  "$phase="+q(phase),
  "[IO.File]::WriteAllText($phase,'started',[Text.Encoding]::ASCII)",
  "[IO.File]::WriteAllText($ready,'READY',[Text.Encoding]::ASCII)",
  "$limit=[DateTime]::UtcNow.AddSeconds(120)",
  "[IO.File]::WriteAllText($phase,'watching-helper',[Text.Encoding]::ASCII)",
  "while($true){",
  "  $running=$false",
  "  try{",
  "    $p=Get-Process -Id $targetPid -ErrorAction SilentlyContinue",
  "    if($null -ne $p){$running=(-not $p.HasExited) -and ($p.ProcessName -eq 'RiftboundUninstall')}",
  "  }catch{$running=$false}",
  "  if(!$running){break}",
  "  if([DateTime]::UtcNow -ge $limit){[IO.File]::WriteAllText($phase,'helper-exit-timeout');exit 7}",
  "  Start-Sleep -Milliseconds 250",
  "}",
  "[IO.File]::WriteAllText($phase,'helper-exited',[Text.Encoding]::ASCII)",
  "for($i=0;$i -lt 120;$i++){",
  "  try{Remove-Item -LiteralPath $exe -Force -ErrorAction Stop;break}",
  "  catch{Start-Sleep -Milliseconds 250}",
  "}",
  "if(Test-Path -LiteralPath $exe){[IO.File]::WriteAllText($phase,'exe-delete-failed');exit 8}",
  "[IO.File]::WriteAllText($phase,'exe-deleted',[Text.Encoding]::ASCII)",
  "Remove-Item -LiteralPath $ready -Force -ErrorAction SilentlyContinue",
  "Remove-Item -LiteralPath $self -Force -ErrorAction SilentlyContinue",
  "for($i=0;$i -lt 40;$i++){",
  "  Remove-Item -LiteralPath $dir -Force -Recurse -ErrorAction SilentlyContinue",
  "  if(!(Test-Path -LiteralPath $dir)){break}",
  "  Start-Sleep -Milliseconds 250",
  "}"
 ].join("\n");
 fs.writeFileSync(scriptFile,"\uFEFF"+script,{encoding:"utf8",mode:0o600});
 const externalTemp=path.join(env.LOCALAPPDATA||
  path.join(os.homedir(),"AppData","Local"),"Temp");
 // A dedicated process group must survive the manager's exit. On Windows,
 // DETACHED_PROCESS together with a hidden console can prevent PowerShell
 // from executing; let PowerShell hide its own window instead.
 const janitor=spawnImpl("powershell.exe",["-NoProfile","-NonInteractive",
  "-WindowStyle","Hidden","-ExecutionPolicy","Bypass","-File",scriptFile],{
  cwd:path.dirname(helperDir),windowsHide:false,detached:true,stdio:"ignore",
  env:{...env,TEMP:externalTemp,TMP:externalTemp,TMPDIR:externalTemp}
 });
 if(!validPid(janitor?.pid))throw Error("Impossible de démarrer le nettoyeur temporaire.");
 janitor.unref?.();
 return {pid:janitor.pid,ready};
}
export async function runUninstallHelper({env=process.env}={}){
 if(process.platform!=="win32")throw Error("Désinstallateur autonome réservé à Windows.");
 const encoded=String(env.RIFTBOUND_UNINSTALL_REQUEST||"");
 if(!encoded||encoded.length>20000)throw Error("Paramètres de désinstallation manquants.");
 let request;
 try{request=JSON.parse(Buffer.from(encoded,"base64").toString("utf8"));}
 catch{throw Error("Demande de désinstallation illisible.");}
 const r=validated(request,{self:true});
 const go=path.join(r.root,"updates",goName);
 try{
  status(r.root,"waiting","Assistant indépendant prêt, attente d'autorisation.");
  await waitUntil(()=>fs.existsSync(go),30000,"Autorisation de désinstallation absente.");
  await waitUntil(()=>!pidAlive(r.pid),90000,"Riftbound ne s'arrête pas.");
  validated(request,{self:true}); // Revalidate instance and request after shutdown.
  status(r.root,"removing","Suppression vérifiée des fichiers de Riftbound.");
  await clean(r.root);
  return {ok:true};
 }catch(error){
  status(r.root,"failed",String(error?.message||error).slice(0,300));
  return {ok:false,error:String(error?.message||error)};
 }
}
