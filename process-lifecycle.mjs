// Stop only child processes spawned and held by Riftbound Companion.
// On Windows, /T removes descendants as well (for example llama.cpp workers).
// Never use image-name based process termination; that can kill other apps.
import {spawnSync} from "node:child_process";

export function stopOwnedProcess(child,{
 platform=process.platform,spawnSyncImpl=spawnSync
}={}){
 if(!child)return false;
 if(child.exitCode!==null&&child.exitCode!==undefined)return false;
 if(child.signalCode!==null&&child.signalCode!==undefined)return false;
 if(platform==="win32"&&Number.isSafeInteger(child.pid)&&child.pid>0){
  try{
   const result=spawnSyncImpl("taskkill.exe",["/PID",String(child.pid),"/T","/F"],{
    windowsHide:true,stdio:"ignore",timeout:6000
   });
   if(result?.status===0)return true;
  }catch{}
 }
 try{child.kill();return true;}catch{return false;}
}
