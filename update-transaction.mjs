// Transactional Windows update helper. Runs in an independent PowerShell process,
// writes diagnostics ONLY under the user-selected portable root, and recovers
// the previous executable if replacement or startup verification fails.
import fs from "node:fs";
import path from "node:path";
import {INSTALL_ID,INSTALL_MARKER,inside,readMarker} from "./portable.mjs";

const q=value=>"'"+String(value).replace(/'/g,"''")+"'";
const safeVersion=value=>/^\d+\.\d+(?:\.\d+)?$/.test(String(value||""));
const shaPattern=/^[a-f0-9]{64}$/i;
export const updateStatusPath=root=>path.join(root,"updates","update-status.json");
export const updateLogPath=root=>path.join(root,"updates","update.log");
export function readUpdateStatus(root,{fsImpl=fs}={}){
 try{
  const file=updateStatusPath(root);
  if(fsImpl.statSync(file).size>16384)return null;
  const info=JSON.parse(fsImpl.readFileSync(file,"utf8").replace(/^\uFEFF/,""));
  if(!info||!["waiting","verifying","replacing","restarting","success","failed","rolled-back","launching"].includes(info.phase))return null;
  return {phase:info.phase,version:String(info.version||"").slice(0,32),
   message:String(info.message||"").slice(0,500),at:String(info.at||"").slice(0,48)};
 }catch{return null;}
}
export function writeUpdateStatus(root,phase,version,message,{fsImpl=fs}={}){
 const filename=updateStatusPath(root);
 fsImpl.mkdirSync(path.dirname(filename),{recursive:true});
 fsImpl.writeFileSync(filename,JSON.stringify({
  phase,version,at:new Date().toISOString(),message:String(message).slice(0,500)
 }),{encoding:"utf8",mode:0o600});
}
export function buildUpdateScript({root,exePath,staged,pid=process.pid,
 expectedSha256,version,port=8787,fsImpl=fs}={}){
 const base=path.resolve(root||""),executable=path.resolve(exePath||""),
  downloaded=path.resolve(staged||"");
 if(!inside(base,executable)||!inside(base,downloaded)||base===downloaded||executable===downloaded)
  throw Error("Mise à jour refusée : les exécutables doivent rester dans le dossier choisi.");
 const marker=readMarker(base,fsImpl);
 if(path.basename(executable)!==marker.executable)
  throw Error("Le fichier cible ne correspond pas à l'exécutable enregistré dans l'installation.");
 if(!shaPattern.test(String(expectedSha256||"")))
  throw Error("Empreinte SHA256 du nouvel exécutable manquante ou incorrecte.");
 if(!safeVersion(version))throw Error("Numéro de version de mise à jour incorrect.");
 if(!Number.isSafeInteger(Number(pid))||Number(pid)<1)throw Error("PID du compagnon invalide.");
 if(!Number.isInteger(Number(port))||Number(port)<1||Number(port)>65535)
  throw Error("Port du compagnon invalide.");
 const backup=path.join(base,"updates","previous-companion.exe");
 const failed=path.join(base,"updates","failed-companion.exe");
 const lines=[
  "$ErrorActionPreference='Stop'",
  "$r="+q(base),
  "$exe="+q(executable),
  "$staged="+q(downloaded),
  "$backup="+q(backup),
  "$failed="+q(failed),
  "$statusFile="+q(updateStatusPath(base)),
  "$logFile="+q(updateLogPath(base)),
  "$expected="+q(String(expectedSha256).toLowerCase()),
  "$version="+q(String(version)),
  "$oldPid="+Number(pid),
  "$port="+Number(port),
  "$markerPath=Join-Path $r "+q(INSTALL_MARKER),
  "function Write-Update([string]$phase,[string]$message) {",
  " $at=(Get-Date).ToUniversalTime().ToString('o')",
  " try {",
  "  $data=@{phase=$phase;version=$version;at=$at;message=$message} | ConvertTo-Json -Compress",
  "  [System.IO.File]::WriteAllText($statusFile,$data,(New-Object System.Text.UTF8Encoding($false)))",
  "  Add-Content -LiteralPath $logFile -Encoding UTF8 -Value ($at+' ['+$phase+'] '+$message)",
  " } catch {}",
  "}",
  "$replaced=$false",
  "$launched=$null",
  "Write-Update 'waiting' 'Téléchargement verifie. Attente de la fermeture complete de la version precedente.'",
  "try {",
  " $old=Get-Process -Id $oldPid -ErrorAction SilentlyContinue",
  " if($null -ne $old) {",
  "  if(-not $old.WaitForExit(90000)){throw 'La précédente version ne se ferme pas (90 s).'}",
  " }",
  " if(!(Test-Path -LiteralPath $markerPath)){throw 'Manifeste portable absent.'}",
  " $manifest=Get-Content -LiteralPath $markerPath -Raw -Encoding UTF8 | ConvertFrom-Json",
  " if($manifest.id -ne "+q(INSTALL_ID)+" -or $manifest.instance -ne "+q(marker.instance)+
    " -or $manifest.path -ne $r -or $manifest.executable -ne (Split-Path -Leaf $exe)){throw 'Installation différente de celle sélectionnée.'}",
  " if(!(Test-Path -LiteralPath $staged)){throw 'Téléchargement temporaire absent.'}",
  " if(!(Test-Path -LiteralPath $exe)){throw 'Ancien exécutable introuvable.'}",
  " Write-Update 'verifying' 'Contrôle SHA256 du nouvel exécutable après fermeture.'",
  " $actual=(Get-FileHash -LiteralPath $staged -Algorithm SHA256).Hash.ToLowerInvariant()",
  " if($actual -ne $expected){throw 'SHA256 incorrect : mise à jour annulée.'}",
  " Write-Update 'replacing' 'Remplacement atomique et sauvegarde du fichier executable precedent.'",
  " $lastError=''",
  " for($i=0;$i -lt 25;$i++){",
  "  try {",
  "   if(Test-Path -LiteralPath $backup){Remove-Item -LiteralPath $backup -Force}",
  "   [System.IO.File]::Replace($staged,$exe,$backup,$true)",
  "   $replaced=$true",
  "   break",
  "  } catch {",
  "   $lastError=$_.Exception.Message",
  "   Start-Sleep -Milliseconds 700",
  "  }",
  " }",
  " if(-not $replaced){throw ('Impossible de remplacer le fichier executable : '+$lastError)}",
  " $written=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()",
  " if($written -ne $expected){throw 'Le nouveau fichier installé ne correspond pas au SHA256 prévu.'}",
  " Write-Update 'restarting' 'Nouvelle version installée. Vérification du gestionnaire local.'",
  " $launched=Start-Process -FilePath $exe -WorkingDirectory $r -PassThru",
  " $healthy=$false",
  " for($i=0;$i -lt 90;$i++){",
  "  Start-Sleep -Milliseconds 450",
  "  $instance=Get-Process -Id $launched.Id -ErrorAction SilentlyContinue",
  "  if($null -eq $instance -or $instance.HasExited){throw 'La nouvelle version ne demarre pas.'}",
  "  try {",
  "   $health=Invoke-RestMethod -Uri ('http://127.0.0.1:'+$port+'/api/health') -TimeoutSec 2",
  "   if($health.ok -eq $true -and $health.packaged -eq $true -and $health.version -eq $version){$healthy=$true;break}",
  "  } catch {}",
  " }",
  " if(-not $healthy){throw 'Le nouveau gestionnaire ne répond pas avec la bonne version.'}",
  " Write-Update 'success' ('Version '+$version+' installée et gestionnaire local redémarré.')",
  " try{if(Test-Path -LiteralPath $backup){Remove-Item -LiteralPath $backup -Force}}catch{}",
  " exit 0",
  "} catch {",
  " $errorText=$_.Exception.Message",
  " Write-Update 'failed' ('Mise à jour interrompue : '+$errorText)",
  " if($replaced -and $null -ne $launched) {",
  "  try { Stop-Process -Id $launched.Id -Force -ErrorAction SilentlyContinue",
  "   $launched.WaitForExit(10000) | Out-Null }catch{}",
  " }",
  " $restored=(-not $replaced)",
  " if($replaced -and (Test-Path -LiteralPath $backup)) {",
  "  try {",
  "   if(Test-Path -LiteralPath $failed){Remove-Item -LiteralPath $failed -Force}",
  "   [System.IO.File]::Replace($backup,$exe,$failed,$true)",
  "   $restored=$true",
  "  }catch {",
  "   Write-Update 'failed' ('La restauration a échoué : '+$_.Exception.Message+' ; sauvegarde : '+$backup)",
  "  }",
  " }",
  " if($restored -and (Test-Path -LiteralPath $exe)) {",
  "  try{",
  "   $original=Get-Process -Id $oldPid -ErrorAction SilentlyContinue",
  "   if($null -eq $original){Start-Process -FilePath $exe -WorkingDirectory $r | Out-Null}",
  "   Write-Update 'rolled-back' ('Mise à jour échouée : '+$errorText+' ; version précédente restaurée et redémarrée.')",
  "  }catch{Write-Update 'failed' ('Restauration présente mais redémarrage impossible : '+$_.Exception.Message)}",
  " }",
  " exit 1",
  "}"
 ];
 return lines.join("\n");
}
