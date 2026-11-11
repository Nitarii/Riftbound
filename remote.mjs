// Optional, explicitly activated remote agent gateway.
// Only a restricted API is reachable through the tunnel. Main localhost server,
// admin token and /api/pair are NEVER forwarded to the public URL.
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawn} from "node:child_process";
import * as sea from "node:sea";
import {brotliDecompressSync} from "node:zlib";

const LIVE_MS=4*60*60*1000;
const MAX_JSON=100000;
const CLOUDFLARED_HASH="2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343";
export function verifyEmbeddedTunnel(){
 if(!sea.isSea())throw Error("Tunnel verification only available in the packaged executable");
 const compressed=Buffer.from(sea.getAsset("cloudflared.exe.br"));
 const original=brotliDecompressSync(compressed);
 const hash=crypto.createHash("sha256").update(original).digest("hex");
 if(hash!==CLOUDFLARED_HASH)throw Error("Embedded Cloudflare binary integrity check failed");
 // Keep the Apache license available inside the packaged executable as well.
 if(!Buffer.from(sea.getAsset("licenses/cloudflared-APACHE-2.0.txt")).includes("Apache License"))
  throw Error("Missing bundled Cloudflare license");
 return {sha256:hash,bytes:original.length,packedBytes:compressed.length};
}

function safeEqual(input,expected){
 const a=Buffer.from(String(input||"")),b=Buffer.from(String(expected||""));
 return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
function send(res,status,value){
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer","Access-Control-Allow-Origin":"null"});
 res.end(JSON.stringify(value));
}
async function readInput(req){
 let raw="";
 for await(const chunk of req){
  raw+=chunk.toString();
  if(raw.length>MAX_JSON)throw Error("Commande trop volumineuse");
 }
 return JSON.parse(raw);
}
export function createRemoteAccess({
 userData,
 getState,
 performCommand,
 getCatalog,
 getDecks,
 getGuide,
 getMessages=()=>({messages:[],lastId:0}),
 sendMessage=()=>{throw Error("Discussion indisponible");},
 markAgentPoll=()=>{},
 onStatus=()=>{},
 launchTunnel=spawn,
 onGatewayReady=()=>{}
}){
 let gateway=null,child=null,active=null,expiryTimer=null,pending=null;
 const status=(includeSecret=false)=>({
  active:Boolean(active?.url&&gateway&&child&&!child.killed&&Date.now()<active.expiresAt),
  starting:Boolean(pending&&!active?.url),url:active?.url||"",
  expiresAt:active?.expiresAt||null,
  ...(includeSecret&&active?.url?{agentToken:active.agentToken}:{})
 });
 function stop(){
  if(expiryTimer)clearTimeout(expiryTimer);
  expiryTimer=null;
  if(child){try{child.kill();}catch{}child=null;}
  if(gateway){try{gateway.close();}catch{}gateway=null;}
  active=null;onStatus(status());
 }
 const gatewayHandler=async(req,res)=>{
  // The console itself contains no secrets. Its URL fragment provides an
  // optional session key to the browser without sending that key in HTTP.
  if(req.method==="GET"&&(req.url==="/agent"||req.url==="/agent/"||req.url==="/agent.js")){
   const name=req.url==="/agent.js"?"agent.js":"agent.html";
   try{
    const content=sea.isSea()?Buffer.from(sea.getAsset(name)):
     fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),name));
    res.writeHead(200,{"Content-Type":name.endsWith(".js")?"text/javascript; charset=utf-8":"text/html; charset=utf-8",
     "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
     "Referrer-Policy":"no-referrer",
     "Content-Security-Policy":"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'"});
    res.end(content);
   }catch{send(res,404,{error:"Console agent indisponible"});}
   return;
  }
  // A remote agent token is separate from the user's main local admin token.
  if(!active||Date.now()>=active.expiresAt){
   send(res,403,{error:"Session distante fermée ou expirée"});return;
  }
  const auth=String(req.headers.authorization||"");
  if(!auth.startsWith("Bearer ")||!safeEqual(auth.slice(7),active.agentToken)){
   send(res,401,{error:"Jeton temporaire manquant ou incorrect"});return;
  }
  let url;
  try{url=new URL(req.url||"/","http://127.0.0.1");}
  catch{send(res,400,{error:"URL invalide"});return;}
  const name=url.pathname;
  try{
   if(req.method==="GET"&&name==="/openapi.json"){
    send(res,200,{
     openapi:"3.0.3",
     info:{title:"Riftbound Physical Game Agent API",version:"0.10.0",
      description:"Requires a bearer token. This tracks a physical game, not a full rules engine."},
     security:[{sessionToken:[]}],
     components:{securitySchemes:{sessionToken:{type:"http",scheme:"bearer"}}},
     paths:{
      "/api/guide":{get:{summary:"Read supported game commands"}},
      "/api/state":{get:{summary:"Read shared board and card state"}},
      "/api/messages":{get:{summary:"Poll announcements from the physical player. Use after=lastId."},
       post:{summary:"Send an AI reply to the player's chat box",requestBody:{
        content:{"application/json":{schema:{type:"object",properties:{text:{type:"string"}}}}}}}},
      "/api/decks":{get:{summary:"Available prebuilt AI decks"}},
      "/api/catalog":{get:{summary:"Look up official card identifiers and effects"}},
      "/api/command":{post:{summary:"Update the physical game's visual board (JSON command)"}}
     }
    });return;
   }
   if(req.method==="GET"&&name==="/api/messages"){
    markAgentPoll();
    send(res,200,getMessages(url.searchParams.get("after")||"0"));return;
   }
   if(req.method==="POST"&&name==="/api/messages"){
    const input=await readInput(req);
    send(res,200,{ok:true,message:sendMessage(input?.text)});return;
   }
   if(req.method==="GET"&&name==="/api/state"){
    const state=getState();
    // Expose the in-game state only. Never reveal local service credentials.
    send(res,200,{state});return;
   }
   if(req.method==="GET"&&name==="/api/guide"){
    send(res,200,{...getGuide(),
      remote:true,
      note:"Use this temporary HTTPS URL with Bearer token, never localhost. Poll GET /api/messages?after=ID for human actions. Respond via POST /api/messages and move cards with POST /api/command. No local admin or tunnel controls exposed."});return;
   }
   if(req.method==="GET"&&name==="/api/decks"){
    send(res,200,{decks:getDecks()});return;
   }
   if(req.method==="GET"&&name==="/api/catalog"){
    const cards=await getCatalog();
    const q=(url.searchParams.get("q")||"").slice(0,150).toLowerCase();
    const type=(url.searchParams.get("type")||"").slice(0,70).toLowerCase();
    const limit=Math.min(50,Math.max(1,Number(url.searchParams.get("limit"))||20));
    const match=cards.filter(c=>(!q||String(c.name).toLowerCase().includes(q)||
     String(c.code).toLowerCase().includes(q))&&(!type||String(c.type).toLowerCase().includes(type)));
    send(res,200,{count:cards.length,returned:Math.min(match.length,limit),cards:match.slice(0,limit)});return;
   }
   if(req.method==="POST"&&name==="/api/command"){
    const input=await readInput(req);
    if(!input||typeof input!=="object"||Array.isArray(input)){
      send(res,400,{error:"Commande JSON invalide"});return;
    }
    // In a physical game the agent must never reset the player's session or
    // rewrite the player's private setup through remote access.
    if(["reset","setup-human"].includes(input.type)){
      send(res,403,{error:"Cette action appartient au joueur local"});return;
    }
    const state=await performCommand(input);
    send(res,200,{ok:true,state});return;
   }
   send(res,404,{error:"Route distante indisponible"});return;
  }catch(e){send(res,400,{error:e.message||"Erreur de commande"});}
 };
 // Pinned vendor release verified during GitHub Actions. Also verified here
 // before extracting or running. No runtime download and no user installation.

 function getBinary(){
  if(!sea.isSea()){
   // Source/developer mode can still use locally installed cloudflared.
   return process.env.RIFTBOUND_CLOUDFLARED||"cloudflared";
  }
  let compressed;
  try{compressed=Buffer.from(sea.getAsset("cloudflared.exe.br"));}
  catch{
   throw Error("Ce module est incomplet : le tunnel distant n'a pas été inclus lors de la compilation.");
  }
  const bundleHash=crypto.createHash("sha256").update(compressed).digest("hex").slice(0,16);
  const output=path.join(userData,"cloudflared-"+bundleHash+".exe");
  const verify=data=>crypto.createHash("sha256").update(data).digest("hex")===CLOUDFLARED_HASH;
  try{
   const installed=fs.readFileSync(output);
   if(verify(installed))return output;
  }catch{}
  const raw=brotliDecompressSync(compressed);
  if(!verify(raw))throw Error("Le composant distant intégré a échoué au contrôle d'intégrité.");
  // Write atomically. Never execute an existing unverified userData file.
  const temp=output+"-"+crypto.randomBytes(5).toString("hex")+".tmp";
  try{
   fs.writeFileSync(temp,raw,{flag:"wx",mode:0o700});
   fs.renameSync(temp,output);
  }finally{
   try{fs.unlinkSync(temp);}catch{}
  }
  return output;
 }
 async function start(){
  if(status().active)return {...status(),agentToken:active.agentToken};
  if(pending)return pending;
  pending=(async()=>{
   if(!["win32","linux","darwin"].includes(process.platform))throw Error("Système non pris en charge");
   // This loopback gateway cannot be reached by other devices without the
   // separately launched, explicitly consented-to tunnel.
   gateway=http.createServer(gatewayHandler);
   await new Promise((resolve,reject)=>{
    gateway.once("error",reject);
    gateway.listen(0,"127.0.0.1",resolve);
   });
   const localPort=gateway.address().port;
   onGatewayReady(localPort);
   active={url:"",agentToken:crypto.randomBytes(32).toString("hex"),
     expiresAt:Date.now()+LIVE_MS};
   const binary=getBinary();
   const proc=launchTunnel(binary,["tunnel","--url","http://127.0.0.1:"+localPort],{
    windowsHide:true,stdio:["ignore","pipe","pipe"],env:process.env
   });
   child=proc;
   const origin=await new Promise((resolve,reject)=>{
    let settled=false,tail="";
    const success=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);};
    const fail=e=>{if(settled)return;settled=true;clearTimeout(timer);reject(e);};
    const onData=data=>{
     tail=(tail+data.toString()).slice(-12000);
     const found=tail.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
     if(found)success(found[0]);
    };
    proc.stdout.on("data",onData);proc.stderr.on("data",onData);
    proc.on("error",fail);
    proc.on("exit",code=>fail(Error("Tunnel arrêté (code "+code+"). Vérifie la connexion Internet.")));
    const timer=setTimeout(()=>fail(Error("Délai de création du tunnel dépassé (35 s).")),35000);
   });
   if(child!==proc)throw Error("Tunnel annulé");
   active.url=origin;
   expiryTimer=setTimeout(stop,LIVE_MS);
   expiryTimer.unref?.();
   proc.once("exit",()=>{if(child===proc)stop();});
   onStatus(status());
   return {...status(),agentToken:active.agentToken};
  })().catch(err=>{
    stop();
    const absent=err?.code==="ENOENT";
    throw absent?Error("Le module distant intégré est introuvable. Vérifie que tu utilises le nouvel exécutable officiel."):err;
  }).finally(()=>{pending=null;});
  return pending;
 }
 return {start,stop,status};
}
