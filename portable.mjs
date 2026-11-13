// Portable-only storage and explicit, safe Windows folder selection.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {spawn,spawnSync} from "node:child_process";
import {buildUpdateScript,writeUpdateStatus} from "./update-transaction.mjs";
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
  let destination=path.join(target,"RiftboundCompanion.exe");
  // An already-installed v0.25 companion can have a broken updater. Allow
  // selecting the SAME dedicated folder to repair it from a newly downloaded
  // executable, without deleting models, hands, settings, or existing saves.
  if(fsImpl.existsSync(markerPath(target))){
   const marker=readMarker(target,fsImpl);
   if(!exePattern.test(marker.executable))
    throw Error("Nom d'exécutable enregistré invalide.");
   destination=path.join(target,marker.executable);
   const updateFolder=path.join(target,"updates");
   fsImpl.mkdirSync(updateFolder,{recursive:true});
   const staged=path.join(updateFolder,"manual-repair-new.exe");
   const backup=path.join(updateFolder,"manual-repair-previous.exe");
   fsImpl.copyFileSync(exePath,staged);
   let moved=false;
   try{
    if(fsImpl.existsSync(destination)){
     if(fsImpl.existsSync(backup))fsImpl.rmSync(backup,{force:true});
     fsImpl.renameSync(destination,backup);
     moved=true;
    }
    fsImpl.renameSync(staged,destination);
    writeUpdateStatus(target,"launching","manual",
     "Réparation depuis un nouvel exécutable : fichiers personnels et modèles conservés.",{fsImpl});
   }catch(e){
    if(moved&&fsImpl.existsSync(backup)&&!fsImpl.existsSync(destination))
     try{fsImpl.renameSync(backup,destination);}catch{}
    throw Error("Remplacement manuel impossible. Ferme l'ancien compagnon puis réessaie dans le même dossier. "+e.message);
   }
  }else{
   fsImpl.copyFileSync(exePath,destination,fs.constants.COPYFILE_EXCL);
   createMarker(target,destination);
  }
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
 if(!Number.isSafeInteger(pid)||pid<1)throw Error("PID du compagnon invalide.");
 if(!exePattern.test(path.basename(exePath))||
    resolved(path.dirname(exePath))!==resolved(root))
  throw Error("Exécutable hors du dossier de l'installation : désinstallation refusée.");
 const r=resolved(root),old=resolved(legacyDataFolder());
 const lines=[
  "$ErrorActionPreference='Stop'",
  "$r="+quoted(r),"$pidToWait="+pid,
  "$m=Join-Path $r "+quoted(INSTALL_MARKER),
  "$statusFile=Join-Path $r 'updates/uninstall-status.json'",
  "$go=Join-Path $r 'updates/uninstall-go.signal'",
  "function Save-Status([string]$phase,[string]$message){",
  "  $dir=Split-Path -Parent $statusFile",
  "  if(!(Test-Path -LiteralPath $dir)){New-Item -ItemType Directory -Path $dir -Force | Out-Null}",
  "  $json=@{phase=$phase;message=$message}|ConvertTo-Json -Compress",
  "  [IO.File]::WriteAllText($statusFile,$json,[Text.UTF8Encoding]::new($false))",
  "}",
  "function Remove-Managed([string]$itemPath){",
  "  if(!(Test-Path -LiteralPath $itemPath)){return}",
  "  $item=Get-Item -LiteralPath $itemPath -Force",
  "  if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Lien symbolique ou jonction non supprimé : '+$itemPath}",
  "  for($attempt=0;$attempt -lt 25;$attempt++){",
  "    try{Remove-Item -LiteralPath $itemPath -Recurse -Force -ErrorAction Stop;return}",
  "    catch{if($attempt -eq 24){throw};Start-Sleep -Milliseconds 300}",
  "  }",
  "}",
  "try{",
  "  Save-Status 'starting' 'Vérification du manifeste avant la désinstallation.'",
  "  if(!(Test-Path -LiteralPath $m)){throw 'Manifeste d installation absent.'}",
  "  $manifest=Get-Content -LiteralPath $m -Raw -Encoding UTF8 | ConvertFrom-Json",
  "  if($manifest.id -ne "+quoted(INSTALL_ID)+" -or $manifest.instance -ne "+quoted(info.instance)+" -or $manifest.path -ne $r){throw 'Manifeste du dossier incohérent.'}",
  "  if((Get-Item -LiteralPath $r -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Le dossier est un lien ou une jonction.'}",
  "  Save-Status 'waiting' 'Assistant de désinstallation prêt. Arrêt du compagnon en attente.'",
  "  $handoffDeadline=[DateTime]::UtcNow.AddSeconds(35)",
  "  while(!(Test-Path -LiteralPath $go)){",
  "    if([DateTime]::UtcNow -gt $handoffDeadline){throw 'Le serveur n a pas autorisé la fin de la désinstallation.'}",
  "    Start-Sleep -Milliseconds 100",
  "  }",
  "  Save-Status 'authorized' 'Signal d autorisation reçu : attente de fermeture de Riftbound.'",
  "  if(Get-Process -Id $pidToWait -ErrorAction SilentlyContinue){",
  "    Wait-Process -Id $pidToWait -Timeout 60 -ErrorAction Stop",
  "  }",
  "  Save-Status 'exited' 'Le processus Riftbound est fermé, nettoyage en cours.'",
  "  if(Get-Process -Id $pidToWait -ErrorAction SilentlyContinue){throw 'L application Riftbound ne se ferme pas.'}",
  "  Save-Status 'removing' 'Suppression des fichiers gérés par Riftbound.'",
 ];
 // Any unrelated files are left intact. The marker is removed only at the end
 // so a partially failed cleanup can still be retried without trusting names.
 for(const name of [...OWNED_DIRS].filter(n=>n!=="updates")){
  lines.push("  Remove-Managed (Join-Path $r "+quoted(name)+")");
 }
 for(const name of OWNED_FILES){
  lines.push("  Remove-Managed (Join-Path $r "+quoted(name)+")");
 }
 lines.push(
  "  Get-ChildItem -LiteralPath $r -File -Force | Where-Object { $_.Name -match '^RiftboundCompanion(-v[0-9.]+)?[.]exe$' -or $_.Name -match '^cloudflared-[a-f0-9]{16}[.]exe$' } | ForEach-Object {Remove-Managed $_.FullName}"
 );
 if(old!==r&&!inside(old,r)){
  lines.push(
   "  $old="+quoted(old),
   "  if(Test-Path -LiteralPath $old){",
   "    if((Get-Item -LiteralPath $old -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Ancien dossier lié : nettoyage refusé.'}",
   ...[...OWNED_DIRS,...OWNED_FILES].map(n=>"    Remove-Managed (Join-Path $old "+quoted(n)+")"),
   "    Get-ChildItem -LiteralPath $old -File -Force | Where-Object {$_.Name -match '^cloudflared-[a-f0-9]{16}[.]exe$'} | ForEach-Object {Remove-Managed $_.FullName}",
   "    if(!(Get-ChildItem -LiteralPath $old -Force | Select-Object -First 1)){Remove-Item -LiteralPath $old -Force}",
   "  }"
  );
 }
 lines.push(
  "  Remove-Managed (Join-Path $r 'updates')",
  "  Remove-Managed $m",
  "  if(!(Get-ChildItem -LiteralPath $r -Force | Select-Object -First 1)){Remove-Item -LiteralPath $r -Force}",
  "}catch{",
  "  try{Save-Status 'failed' ([string]$_.Exception.Message)}catch{}",
  "  exit 7",
  "}"
 );
 return lines.join("\n");
}
export const updateScript=buildUpdateScript;
export function launchMaintenance(script,{env=process.env,spawnImpl=spawn,
 spawnSyncImpl=spawnSync,root=null,mode="update"}={}){
 if(!["update","uninstall"].includes(mode))throw Error("Type de maintenance invalide.");
 let args,output=null;
 const options={detached:true,windowsHide:true,stdio:"ignore",env};
 if(root){
  const base=resolved(root),file=path.join(base,"updates",
   mode==="uninstall"?"companion-uninstall.ps1":"companion-update.ps1");
  if(!inside(base,file))throw Error("Script de mise à jour hors dossier interdit.");
  fs.mkdirSync(path.dirname(file),{recursive:true});
  // Windows PowerShell 5.1 needs a UTF-8 BOM to reliably read French paths.
  fs.writeFileSync(file,"\uFEFF"+script,{encoding:"utf8",mode:0o600});
  // The uninstall helper must not have its CWD inside the folder to remove.
  options.cwd=mode==="uninstall"?path.parse(base).root:base;
  // Parse the script before touching the old EXE: a syntax error must never
  // close the user's currently working manager.
  if(process.platform==="win32"){
   const check=[
    "$tokens=$null;$errors=$null",
    "[System.Management.Automation.Language.Parser]::ParseFile("+quoted(file)+",[ref]$tokens,[ref]$errors)|Out-Null",
    "if($errors.Count){$errors|ForEach-Object{[Console]::Error.WriteLine($_.Message)};exit 41}"
   ].join("\n");
   const result=spawnSyncImpl("powershell.exe",["-NoProfile","-NonInteractive",
    "-EncodedCommand",powershellEncoded(check)],{
    encoding:"utf8",windowsHide:true,timeout:15000,env,maxBuffer:32768
   });
   if(result.status!==0)throw Error("Le script de mise à jour est invalide : "+
     String(result.stderr||result.error?.message||"PowerShell inaccessible").trim().slice(0,350));
  }
  // Passing a Unicode folder via -File can fail silently on some Windows
  // PowerShell 5.1 configurations. Execute the already parsed, bounded script
  // as UTF-16LE EncodedCommand instead; still keep .ps1 for diagnostics.
  // A full uninstall script can exceed PowerShell's Windows command-line
  // limits after UTF-16 + base64 expansion. Launch the already parsed .ps1 via
  // a tiny Unicode-safe bootstrap, rather than encoding the entire script.
  // Load into memory before executing, so even the helper's own .ps1 is no
  // longer opened when Windows removes the updates directory.
  if(mode==="uninstall"){
   // Using -File makes Windows pass the exact Unicode path as an argument,
   // without expanding a large encoded command through the command line.
   args=["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",file];
  }else{
   const encoded=powershellEncoded(script);
   if(encoded.length>30000)throw Error("Le script de maintenance dépasse la longueur Windows.");
   args=["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass",
    "-EncodedCommand",encoded];
  }
  if(mode==="update"){
   output=fs.openSync(path.join(base,"updates","maintenance-output.log"),"a");
   options.stdio=["ignore",output,output];
  }else{
   // The Windows PowerShell process launched from the packaged SEA executable
   // exits before executing the script with DETACHED_PROCESS. A normal child
   // process survives its parent shutdown on Windows without this flag.
   options.detached=false;
   // No file handle in the installation folder: write early errors through
   // short-lived append operations, then allow the directory to be deleted.
   options.stdio=["ignore","pipe","pipe"];
  }
 }else{
  args=["-NoProfile","-NonInteractive","-EncodedCommand",powershellEncoded(script)];
 }
 let child;
 try{child=spawnImpl("powershell.exe",args,options);}
 finally{if(output!==null)fs.closeSync(output);}
 if(!child||!Number.isSafeInteger(child.pid)||child.pid<1){
  try{child?.kill?.();}catch{}
  throw Error("Impossible de démarrer l'outil de mise à jour PowerShell.");
 }
 if(root&&mode==="uninstall"){
  const logFile=path.join(root,"updates","uninstall-launch.log");
  const append=text=>{try{fs.appendFileSync(logFile,String(text).slice(0,4096));}catch{}};
  append("Helper spawned PID "+child.pid+"; bootstrapping "+mode+"\\n");
  child.stdout?.on("data",append);
  child.stderr?.on("data",append);
  child.once?.("exit",(code,signal)=>{
   append("Helper terminated: code="+code+" signal="+signal+"\\n");
  });
 }
 child.once?.("error",error=>{
  console.error("Outil de maintenance :",error.message);
  try{fs.appendFileSync(path.join(root||process.cwd(),"updates","maintenance-output.log"),
   "\\nÉchec de démarrage PowerShell : "+error.message+"\\n");}catch{}
 });
 child.once?.("exit",(code,signal)=>{
  if(root&&mode==="update")try{fs.appendFileSync(path.join(root,"updates","maintenance-output.log"),
    "\\nHelper terminé : code="+code+" signal="+signal+"\\n");}catch{}
 });
 child.unref?.();
 return {pid:child.pid};
}
