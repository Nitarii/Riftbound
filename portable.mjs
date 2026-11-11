// Portable-only storage and explicit, safe Windows folder selection.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {spawn,spawnSync} from "node:child_process";
export const INSTALL_MARKER=".riftbound-install.json";
export const INSTALL_ID="org.nitarii.riftbound.portable";
export const OWNED_DIRS=["free-opponent","speech","temp","downloads","updates"];
export const OWNED_FILES=[".riftbound-local-state.json",".riftbound-conversation.json",
 ".riftbound-catalog-cache.json",".riftbound-ai-settings.json"];
const exePattern=/^RiftboundCompanion(?:-v\d+(?:\.\d+)*)?\.exe$/i;
const resolved=p=>path.resolve(p);
export const inside=(a,b)=>b===a||b.startsWith(a+path.sep);
const quoted=v=>"'"+String(v).replace(/'/g,"''")+"'";
export const powershellEncoded=script=>Buffer.from(script,"utf16le").toString("base64");
export const markerPath=root=>path.join(root,INSTALL_MARKER);
export const ownedEntry=name=>OWNED_DIRS.includes(name)||OWNED_FILES.includes(name)||
 name===INSTALL_MARKER||exePattern.test(name)||/^cloudflared-[0-9a-f]{16}\.exe$/i.test(name);
export function assertSafeInstallFolder(folder,{exePath="",fsImpl=fs}={}){
 const target=resolved(folder),home=resolved(os.homedir());
 if(target===path.parse(target).root||target===home||target===path.dirname(home)||
 /^(desktop|downloads|documents|pictures)$/i.test(path.basename(target)))
  throw Error("Choisis un dossier dédié et vide, pas le Bureau ni la racine du disque.");
 if(fsImpl.existsSync(target)){
  const names=fsImpl.readdirSync(target);
  if(names.some(n=>n!==path.basename(exePath)&&!ownedEntry(n)))
   throw Error("Ce dossier contient des fichiers personnels. Choisis un dossier vide.");
  if(names.length&&names.some(n=>n!==path.basename(exePath))&&!names.includes(INSTALL_MARKER))
   throw Error("Ce dossier contient des fichiers non gérés. Choisis un dossier vide.");
 }
 return target;
}
export function readMarker(root,fsImpl=fs){
 const info=JSON.parse(fsImpl.readFileSync(markerPath(root),"utf8"));
 if(info.id!==INSTALL_ID||resolved(info.path)!==resolved(root)||!info.instance)
  throw Error("Installation non reconnue : suppression interdite.");
 return info;
}
export function portableEnvironment(root,env=process.env){
 const tmp=path.join(root,"temp");
 fs.mkdirSync(tmp,{recursive:true});
 return {...env,RIFTBOUND_DATA_DIR:root,TEMP:tmp,TMP:tmp,TMPDIR:tmp};
}
export function chooseWindowsFolder({initialPath=os.homedir(),spawnSyncImpl=spawnSync}={}){
 const lines=[
  "Add-Type -AssemblyName System.Windows.Forms",
  "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)",
  "$d=New-Object System.Windows.Forms.FolderBrowserDialog",
  "$d.Description='Riftbound : choisir un dossier dédié pour tous les fichiers'",
  "$d.ShowNewFolderButton=$true",
  "$d.SelectedPath="+quoted(initialPath),
  "if($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){[Console]::WriteLine($d.SelectedPath)}else{exit 2}"
 ];
 const result=spawnSyncImpl("powershell.exe",["-NoProfile","-NonInteractive","-STA",
  "-EncodedCommand",powershellEncoded(lines.join("\n"))],
  {encoding:"utf8",windowsHide:false,timeout:120000,maxBuffer:8192});
 return result.status===0?String(result.stdout||"").trim().split(/\r?\n/).at(-1)||null:null;
}
function createMarker(folder,exe){
 const info={id:INSTALL_ID,path:resolved(folder),instance:crypto.randomBytes(16).toString("hex"),
  executable:path.basename(exe),created:new Date().toISOString()};
 fs.writeFileSync(markerPath(folder),JSON.stringify(info,null,2),{flag:"wx",mode:0o600});
 return info;
}
export function initializePortableInstall({
 packaged,exePath=process.execPath,sourceRoot=process.cwd(),argv=process.argv,
 env=process.env,platform=process.platform,chooser=chooseWindowsFolder,
 spawnImpl=spawn,fsImpl=fs
}={}){
 if(!packaged)return {root:sourceRoot,launched:false,portable:false};
 const exeDir=resolved(path.dirname(exePath));
 if(argv.includes("--verify-bundle"))return {root:exeDir,launched:false,portable:false,verify:true};
 if(env.RIFTBOUND_PORTABLE_TEST==="1"){
  const dir=resolved(env.RIFTBOUND_DATA_DIR||path.join(exeDir,"portable-ci"));
  fsImpl.mkdirSync(dir,{recursive:true});
  if(!fsImpl.existsSync(markerPath(dir)))createMarker(dir,exePath);
  return {root:dir,launched:false,portable:true};
 }
 if(platform!=="win32")throw Error("Le compagnon portable nécessite Windows.");
 if(fsImpl.existsSync(markerPath(exeDir))){
  readMarker(exeDir,fsImpl);
  return {root:exeDir,launched:false,portable:true};
 }
 const chosen=chooser({initialPath:exeDir});
 if(!chosen)throw Error("Choix du dossier annulé. Aucun fichier installé.");
 const target=assertSafeInstallFolder(chosen,{exePath,fsImpl});
 fsImpl.mkdirSync(target,{recursive:true});
 if(target!==exeDir){
  const destination=path.join(target,"RiftboundCompanion.exe");
  fsImpl.copyFileSync(exePath,destination,fs.constants.COPYFILE_EXCL);
  createMarker(target,destination);
  const child=spawnImpl(destination,[],{cwd:target,env:portableEnvironment(target,env),
   detached:true,windowsHide:false,stdio:"ignore"});
  child.unref?.();
  return {root:target,launched:true,portable:true};
 }
 createMarker(target,exePath);
 return {root:target,launched:false,portable:true};
}
export const legacyDataFolder=()=>path.join(process.env.LOCALAPPDATA||
 path.join(os.homedir(),"AppData","Local"),"RiftboundTableCompanion");
export function moveLegacyFiles(source,target,{fsImpl=fs}={}){
 if(resolved(source)===resolved(target)||!fsImpl.existsSync(source))return [];
 const moved=[];
 for(const name of fsImpl.readdirSync(source)){
  if(!ownedEntry(name)||name===INSTALL_MARKER||exePattern.test(name))continue;
  const from=path.join(source,name),to=path.join(target,name);
  if(fsImpl.existsSync(to))continue;
  try{fsImpl.renameSync(from,to);}
  catch(e){
   if(e.code!=="EXDEV")throw e;
   fsImpl.cpSync(from,to,{recursive:true,errorOnExist:true,force:false});
   fsImpl.rmSync(from,{force:true,recursive:true});
  }
  moved.push(name);
 }
 try{if(fsImpl.readdirSync(source).length===0)fsImpl.rmdirSync(source);}catch{}
 return moved;
}
export function uninstallScript({root,exePath,pid=process.pid}){
 const info=readMarker(root);
 const lines=[
  "$ErrorActionPreference='Stop'",
  "$r="+quoted(root),"$pidToWait="+Number(pid),
  "try{Wait-Process -Id $pidToWait -Timeout 50 -ErrorAction SilentlyContinue}catch{}",
  "$m=Join-Path $r "+quoted(INSTALL_MARKER),
  "if(!(Test-Path -LiteralPath $m)){exit 4}",
  "$manifest=Get-Content -LiteralPath $m -Raw | ConvertFrom-Json",
  "if($manifest.id -ne "+quoted(INSTALL_ID)+" -or $manifest.instance -ne "+quoted(info.instance)+" -or $manifest.path -ne $r){exit 5}",
  "foreach($n in @("+[...OWNED_DIRS,...OWNED_FILES].map(quoted).join(",")+")){"+
   "$p=Join-Path $r $n; if(Test-Path -LiteralPath $p){Remove-Item -LiteralPath $p -Recurse -Force}}",
  "Get-ChildItem -LiteralPath $r -File | Where-Object { $_.Name -match '^RiftboundCompanion(-v[0-9.]+)?[.]exe$' -or $_.Name -match '^cloudflared-[a-f0-9]{16}[.]exe$' } | ForEach-Object {Remove-Item -LiteralPath $_.FullName -Force}",
  "Remove-Item -LiteralPath $m -Force",
  "try{Remove-Item -LiteralPath $r -ErrorAction SilentlyContinue}catch{}"
 ];

 const legacy=legacyDataFolder();
 if(resolved(legacy)!==resolved(root)&&!inside(resolved(legacy),resolved(root))){
  // Cleanup is scoped to the fixed folder created by older versions only.
  lines.push(
   "$old="+quoted(legacy),
   "if(Test-Path -LiteralPath $old){",
   "foreach($n in @("+[...OWNED_DIRS,...OWNED_FILES].map(quoted).join(",")+")){"+
    "$p=Join-Path $old $n;if(Test-Path -LiteralPath $p){Remove-Item -LiteralPath $p -Recurse -Force}}",
   "Get-ChildItem -LiteralPath $old -File | Where-Object {$_.Name -match '^cloudflared-[0-9a-f]{16}[.]exe({root,exePath,staged,pid=process.pid}){
 const info=readMarker(root);
 if(!inside(resolved(root),resolved(staged))||resolved(staged)===resolved(exePath))
  throw Error("Mise à jour hors du dossier choisi refusée.");
 return [
  "$ErrorActionPreference='Stop'",
  "$r="+quoted(root),"$exe="+quoted(exePath),"$staged="+quoted(staged),
  "try{Wait-Process -Id "+Number(pid)+" -Timeout 50 -ErrorAction SilentlyContinue}catch{}",
  "$m=Join-Path $r "+quoted(INSTALL_MARKER),
  "if(!(Test-Path -LiteralPath $m)){exit 4}",
  "$data=Get-Content -LiteralPath $m -Raw | ConvertFrom-Json",
  "if($data.id -ne "+quoted(INSTALL_ID)+" -or $data.instance -ne "+quoted(info.instance)+" -or $data.path -ne $r){exit 5}",
  "if(!(Test-Path -LiteralPath $staged)){exit 6}",
  "Move-Item -LiteralPath $staged -Destination $exe -Force",
  "Start-Process -FilePath $exe -WorkingDirectory $r"
 ].join("\n");
}
export function launchMaintenance(script,{env=process.env,spawnImpl=spawn}={}){
 const child=spawnImpl("powershell.exe",["-NoProfile","-NonInteractive","-EncodedCommand",
  powershellEncoded(script)],{detached:true,windowsHide:true,stdio:"ignore",env});
 child.unref?.();return true;
}
} | ForEach-Object {Remove-Item -LiteralPath $_.FullName -Force}",
   "try{Remove-Item -LiteralPath $old -ErrorAction SilentlyContinue}catch{}",
   "}"
  );
 }
 return lines.join("\n");
}
export function updateScript({root,exePath,staged,pid=process.pid}){
 const info=readMarker(root);
 if(!inside(resolved(root),resolved(staged))||resolved(staged)===resolved(exePath))
  throw Error("Mise à jour hors du dossier choisi refusée.");
 return [
  "$ErrorActionPreference='Stop'",
  "$r="+quoted(root),"$exe="+quoted(exePath),"$staged="+quoted(staged),
  "try{Wait-Process -Id "+Number(pid)+" -Timeout 50 -ErrorAction SilentlyContinue}catch{}",
  "$m=Join-Path $r "+quoted(INSTALL_MARKER),
  "if(!(Test-Path -LiteralPath $m)){exit 4}",
  "$data=Get-Content -LiteralPath $m -Raw | ConvertFrom-Json",
  "if($data.id -ne "+quoted(INSTALL_ID)+" -or $data.instance -ne "+quoted(info.instance)+" -or $data.path -ne $r){exit 5}",
  "if(!(Test-Path -LiteralPath $staged)){exit 6}",
  "Move-Item -LiteralPath $staged -Destination $exe -Force",
  "Start-Process -FilePath $exe -WorkingDirectory $r"
 ].join("\n");
}
export function launchMaintenance(script,{env=process.env,spawnImpl=spawn}={}){
 const child=spawnImpl("powershell.exe",["-NoProfile","-NonInteractive","-EncodedCommand",
  powershellEncoded(script)],{detached:true,windowsHide:true,stdio:"ignore",env});
 child.unref?.();return true;
}
