// Local companion relay. Run with Node.js >=20: node server.mjs
// Never expose this HTTP server on a public host without TLS, firewalling,
// authentication and an explicit review of your security configuration.
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createState,applyCommand,COMMANDS} from "./core.mjs";
const root=path.dirname(fileURLToPath(import.meta.url)),port=Number(process.env.PORT||8787);
const host="127.0.0.1";
const token=process.env.RIFTBOUND_TOKEN||crypto.randomBytes(24).toString("hex");
const stateFile=path.join(root,".riftbound-local-state.json");
const allowedOrigin=(process.env.RIFTBOUND_ORIGIN||"").replace(/\/$/,"");
const clients=new Set(),tickets=new Map();
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
 name:"Riftbound Table Companion",version:"0.1.0",
 warning:"A human-supervised physical tabletop companion. This is not a competitive rules engine or an autonomous validated game simulator. Verify all rules and card effects against Riot's official documentation.",
 connect:"Provide Authorization: Bearer <TOKEN>. Never place the TOKEN in GitHub commits, prompts shared publicly, or publicly accessible URLs.",
 endpoints:{"GET /api/state":"State JSON, authenticated","GET /api/guide":"This guide, authenticated",
 "GET /api/catalog":"Catalog status; cards are managed in the browser, authenticated",
 "POST /api/command":"One JSON command, authenticated","POST /api/events-ticket":"Short-lived one-use event ticket, authenticated",
 "GET /api/events?ticket=...":"SSE updates for an authorized browser session"},
 commands:{
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
function serveFile(req,res,url){
  let relative=url.pathname==="/"?"/index.html":url.pathname;
  if(!/^\/[a-z0-9._/-]+$/i.test(relative)||relative.includes("..")||relative.startsWith("/.")){msg(res,404,"Not found",req);return;}
  const file=path.join(root,relative);
  if(!["index.html","app.mjs","core.mjs","catalog.mjs","style.css"].includes(path.basename(file))){msg(res,404,"Not found",req);return;}
  const ext=path.extname(file);
  const contentType=ext===".css"?"text/css":ext===".html"?"text/html":ext===".mjs"?"text/javascript":"text/plain";
  try{headers(res,req);res.writeHead(200,{"Content-Type":contentType+"; charset=utf-8"});fs.createReadStream(file).pipe(res);}
  catch{msg(res,404,"Not found",req);}
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
  if(!authorized(req)){msg(res,401,"Jeton manquant ou incorrect",req);return;}
  if(req.method==="GET"&&url.pathname==="/api/state"){json(res,200,{state},req);return;}
  if(req.method==="GET"&&url.pathname==="/api/guide"){json(res,200,guide,req);return;}
  if(req.method==="GET"&&url.pathname==="/api/catalog"){json(res,200,{source:"browser",message:"The catalog is imported directly into the browser and is not currently synchronized with the relay.",count:null},req);return;}
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
      const updated=applyCommand(state,input);state=updated;save();broadcast();json(res,200,{ok:true,state},req);
    }catch(e){msg(res,400,e.message,req);}return;
  }
  msg(res,404,"Endpoint inconnu",req);
});
server.listen(port,host,()=>{
  console.log("\nRIFTBOUND TABLE COMPANION");
  console.log("Site local : http://"+host+":"+port);
  console.log("Jeton local : "+token);
  console.log("L'API est réservée à 127.0.0.1. Ne publie pas le jeton.\n");
});
