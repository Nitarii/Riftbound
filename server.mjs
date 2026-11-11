// Local companion relay. Run with Node.js >=20: node server.mjs
// Never expose this HTTP server on a public host without TLS, firewalling,
// authentication and an explicit review of your security configuration.
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import os from "node:os";
import * as sea from "node:sea";
import {execFile} from "node:child_process";
import {createState,applyCommand,COMMANDS} from "./core.mjs";
import {CARD_SOURCE,CARD_SOURCE_BACKUP,decodeCards,searchCards} from "./catalog.mjs";
import {PRECONS,resolvePrecon} from "./precons.mjs";
const packaged=sea.isSea();
const root=packaged?path.dirname(process.execPath):path.dirname(fileURLToPath(import.meta.url));
const userData=packaged?path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),"AppData","Local"),"RiftboundTableCompanion"):root;
if(packaged)fs.mkdirSync(userData,{recursive:true});
const port=Number(process.env.PORT||8787);
const host="127.0.0.1";
const token=process.env.RIFTBOUND_TOKEN||crypto.randomBytes(24).toString("hex");
const stateFile=path.join(userData,".riftbound-local-state.json");
const allowedOrigin=(process.env.RIFTBOUND_ORIGIN||"https://nitarii.github.io").replace(/\/$/,"");
const clients=new Set(),tickets=new Map();
const catalogFile=path.join(userData,".riftbound-catalog-cache.json");
let catalogCache=null,catalogTime=0,catalogPending=null;
async function loadServerCatalog(force=false) {
  if(!catalogCache)try{
    const saved=JSON.parse(fs.readFileSync(catalogFile,"utf8"));
    if(Array.isArray(saved?.cards)&&saved.cards.length>500){catalogCache=saved.cards;catalogTime=saved.updatedAt||0;}
  }catch{}
  if(!force&&catalogCache&&Date.now()-catalogTime<24*3600*1000)return catalogCache;
  if(catalogPending)return catalogPending;
  catalogPending=(async()=>{
    for(const source of [CARD_SOURCE,CARD_SOURCE_BACKUP]){
      try{
        const response=await fetch(source,{signal:AbortSignal.timeout(12000)});
        if(!response.ok)throw Error("Catalogue HTTP "+response.status);
        const cards=decodeCards(await response.json());
        if(cards.length<500)throw Error("Catalogue incomplet");
        catalogCache=cards;catalogTime=Date.now();
        try{fs.writeFileSync(catalogFile,JSON.stringify({cards,updatedAt:catalogTime}));}catch{}
        return cards;
      }catch(e){console.warn("Chargement cartes :",e.message);}
    }
    if(catalogCache)return catalogCache;
    throw Error("Catalogue indisponible : vérifie la connexion puis réessaie");
  })().finally(()=>{catalogPending=null;});
  return catalogPending;
}
let state=createState();
try{state=JSON.parse(fs.readFileSync(stateFile,"utf8"));}catch{}
function save(){fs.writeFileSync(stateFile,JSON.stringify(state,null,2));}
function json(res,status,obj,req){
  headers(res,req);res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});
  res.end(JSON.stringify(obj));
}
function headers(res,req){
  const origin=req.headers.origin;
  if(origin&&(origin===allowedOrigin||/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin))){
    res.setHeader("Access-Control-Allow-Origin",origin);
    res.setHeader("Vary","Origin");
    res.setHeader("Access-Control-Allow-Headers","Authorization,Content-Type");
    res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
    if(req.headers["access-control-request-private-network"]==="true")res.setHeader("Access-Control-Allow-Private-Network","true");
  }
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Referrer-Policy","no-referrer");
}
function authorized(req){
  const h=req.headers.authorization||"";
  const candidate=h.startsWith("Bearer ")?h.slice(7):"";
  const a=Buffer.from(candidate),b=Buffer.from(token);
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
function msg(res,status,text,req){json(res,status,{error:text},req);}
function broadcast(){
  const payload="data: "+JSON.stringify({state})+"\n\n";
  for(const c of clients){try{c.write(payload);}catch{clients.delete(c);}}
}
function body(req){
  return new Promise((resolve,reject)=>{
    let text="";
    req.on("data",chunk=>{text+=chunk;if(text.length>750000){reject(Error("Payload trop volumineux"));req.destroy();}});
    req.on("end",()=>{try{resolve(JSON.parse(text))}catch{reject(Error("JSON invalide"))}});
    req.on("error",reject);
  });
}
const guide={
 name:"Riftbound Table Companion",version:"0.2.0",
 warning:"A human-supervised physical tabletop companion. This is not a competitive rules engine or an autonomous validated game simulator. Verify all rules and card effects against Riot's official documentation.",
 connect:"Provide Authorization: Bearer <TOKEN>. Never place the TOKEN in GitHub commits, prompts shared publicly, or publicly accessible URLs.",
 endpoints:{"GET /api/state":"State JSON, authenticated","GET /api/guide":"This guide, authenticated",
 "GET /api/catalog?q=...&type=...&limit=100":"Search or read cards (up to 2000), authenticated",
 "GET /api/decks":"Verified printed Fiora/Rumble deck recipe identifiers, authenticated",
 "POST /api/command":"One JSON command, authenticated","POST /api/events-ticket":"Short-lived one-use event ticket, authenticated",
 "GET /api/events?ticket=...":"SSE updates for an authorized browser session"},
 commands:{
 "select-precon":{type:"select-precon",id:"random",note:"Valid ids: fiora, rumble. The server draws four physical instances from the resulting shuffled 39-card main deck."},
 "setup-human|setup-ai":{legend:{name:"Shen, Eye of Twilight",type:"Legend"},champion:{name:"Shen",type:"Unit"},battlefield:{name:"Grove of the God-Willow",type:"Battlefield"},main:"required array for setup-ai",runes:"required array for setup-ai"},
 start:{type:"start",player:"human"},
 "next-turn":{type:"next-turn"},
 phase:{type:"phase",phase:"Main"},
 add:{type:"add",player:"ai",zone:"base",card:{name:"Card Name",type:"Unit",image:"optional HTTPS image URL"}},
 move:{type:"move",uid:"read from state.cards",zone:"battlefield",battlefield:0},
 exhaust:{type:"exhaust",uid:"read from state.cards"},
 ready:{type:"ready",uid:"read from state.cards"},
 damage:{type:"damage",uid:"read from state.cards",value:1},
 counter:{type:"counter",uid:"read from state.cards",key:"power",value:1},
 score:{type:"score",player:"human",value:1},
 draw:{type:"draw",player:"ai",count:1},
 channel:{type:"channel",player:"ai",count:1},
 "hand-count":{type:"hand-count",player:"human",value:4},
 note:{type:"note",text:"Human declared an action; verify and update the board."},
 remove:{type:"remove",uid:"read from state.cards"},
 reset:{type:"reset"}
 },
 allCommandTypes:COMMANDS
};
const WEB_ASSETS=new Set(["index.html","app.mjs","core.mjs","catalog.mjs","precons.mjs","narration.mjs","style.css"]);
function serveFile(req,res,url){
 const requested=url.pathname==="/"?"/index.html":url.pathname;
 if(!/^\/[a-z0-9._/-]+$/i.test(requested)||requested.includes("..")||requested.startsWith("/.")){
  msg(res,404,"Not found",req);return;
 }
 const name=requested.slice(1);
 if(!WEB_ASSETS.has(name)){msg(res,404,"Not found",req);return;}
 const ext=path.extname(name);
 const mime=ext===".css"?"text/css":ext===".html"?"text/html":ext===".mjs"?"text/javascript":"text/plain";
 try{
  let bytes;
  if(packaged)bytes=Buffer.from(sea.getAsset(name));
  else bytes=fs.readFileSync(path.join(root,name));
  headers(res,req);
  res.writeHead(200,{"Content-Type":mime+"; charset=utf-8","Cache-Control":"no-cache"});
  res.end(bytes);
 }catch(e){console.error("Static file:",name,e.message);msg(res,404,"Not found",req);}
}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url||"/","http://127.0.0.1");
  if(req.method==="OPTIONS"){headers(res,req);res.writeHead(204);res.end();return;}
  if(!url.pathname.startsWith("/api/")){if(req.method!=="GET"){msg(res,405,"Method not allowed",req);return;}serveFile(req,res,url);return;}
  if(url.pathname==="/api/events"){
    const ticket=url.searchParams.get("ticket");
    const expiry=tickets.get(ticket);
    if(!expiry||expiry<Date.now()){msg(res,401,"Ticket expiré",req);return;}
    tickets.delete(ticket);
    headers(res,req);
    res.writeHead(200,{"Content-Type":"text/event-stream; charset=utf-8","Cache-Control":"no-store","Connection":"keep-alive"});
    res.write("data: "+JSON.stringify({state})+"\n\n");clients.add(res);
    const heart=setInterval(()=>{try{res.write(":keepalive\n\n");}catch{}},15000);
    req.on("close",()=>{clients.delete(res);clearInterval(heart);});return;
  }
  if(req.method==="GET"&&url.pathname==="/api/health"){
    json(res,200,{ok:true,name:"Riftbound Companion",version:"0.3.0",packaged},req);return;
  }
  if(!authorized(req)){msg(res,401,"Jeton manquant ou incorrect",req);return;}
  if(req.method==="GET"&&url.pathname==="/api/state"){json(res,200,{state},req);return;}
  if(req.method==="GET"&&url.pathname==="/api/guide"){json(res,200,guide,req);return;}
  if(req.method==="GET"&&url.pathname==="/api/decks"){
    json(res,200,{decks:PRECONS.map(p=>({id:p.id,label:p.label,source:p.source,mainSize:p.main.reduce((sum,[,n])=>sum+n,0),runeSize:p.runes.reduce((sum,[,n])=>sum+n,0),battlefields:p.battlefields}))},req);return;
  }
  if(req.method==="GET"&&url.pathname==="/api/catalog"){
    try{
      const cards=await loadServerCatalog(url.searchParams.get("refresh")==="1");
      const q=url.searchParams.get("q")||"",type=url.searchParams.get("type")||"";
      const limit=Math.min(2000,Math.max(1,Number(url.searchParams.get("limit")||100)||100));
      const result=searchCards(cards,q,type,limit);
      json(res,200,{count:cards.length,returned:result.length,cards:result,source:CARD_SOURCE},req);
    }catch(e){msg(res,503,e.message,req);}return;
  }
  if(req.method==="POST"&&url.pathname==="/api/events-ticket"){
    const ticket=crypto.randomBytes(28).toString("hex");tickets.set(ticket,Date.now()+30000);
    if(tickets.size>200){for(const [k,v] of tickets)if(v<Date.now())tickets.delete(k);}
    json(res,200,{ticket},req);return;
  }
  if(req.method==="POST"&&url.pathname==="/api/command"){
    try{
      const input=await body(req);
      // Optional optimistic concurrency; client may use state.revision.
      if(Number.isInteger(input.ifRevision)&&input.ifRevision!==state.revision){msg(res,409,"Version obsolète; recharge /api/state",req);return;}
      let command=input;
      if(input.type==="select-precon"){
        const cards=await loadServerCatalog();
        const deck=resolvePrecon(cards,input.id||"random");
        command={type:"setup-ai",legend:deck.legend,champion:deck.champion,battlefield:deck.battlefield,
          battlefields:deck.battlefields,main:deck.main,runes:deck.runes,
          mainIncludesChampion:true,format:"preconstructed",deckName:deck.label};
      }
      const updated=applyCommand(state,command);state=updated;save();broadcast();json(res,200,{ok:true,state},req);
    }catch(e){msg(res,400,e.message,req);}return;
  }
  msg(res,404,"Endpoint inconnu",req);
});
server.on("error",err=>{
 console.error("Démarrage impossible :",err.code==="EADDRINUSE"?"Le port "+port+" est déjà utilisé. Ferme l'autre instance du module.":err.message);
 process.exitCode=1;
});
server.listen(port,host,()=>{
  console.log("\nRIFTBOUND TABLE COMPANION");
  console.log("Site local : http://"+host+":"+port);
  console.log("Jeton local : "+token);
  console.log("L'API est réservée à 127.0.0.1. Ne publie pas le jeton.\n");
  if(packaged&&process.platform==="win32"&&!process.argv.includes("--no-browser")&&process.env.RIFTBOUND_NO_BROWSER!=="1"){
    // URL fragment isn't sent in HTTP requests; the local UI consumes and removes it on load.
    const target="http://"+host+":"+port+"/#companion="+encodeURIComponent(token);
    execFile("powershell.exe",["-NoProfile","-NonInteractive","-WindowStyle","Hidden","-Command",
      "Start-Process '"+target+"'"],{windowsHide:true},err=>{
        if(err)console.log("Ouvre le site manuellement : http://"+host+":"+port);
      });
  }
});
