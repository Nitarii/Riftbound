// Headless layout smoke test: no page-level scroll, readable independent panels.
// Launched by CI with the already-installed runner Chrome / Chromium browser.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright-core";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const contentType=file=>file.endsWith(".html")?"text/html":
 file.endsWith(".css")?"text/css":file.endsWith(".js")||file.endsWith(".mjs")?"text/javascript":
 file.endsWith(".svg")?"image/svg+xml":"text/plain";
const server=http.createServer((req,res)=>{
 const url=new URL(req.url||"/","http://127.0.0.1");
 const relative=decodeURIComponent(url.pathname==="/"?"/index.html":url.pathname);
 const file=path.resolve(root,"."+relative);
 if(!(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())){
  res.writeHead(404);res.end("Not found");return;
 }
 res.writeHead(200,{"Content-Type":contentType(file),"Cache-Control":"no-store"});
 fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const url="http://127.0.0.1:"+server.address().port;
let chromePath=["/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium"]
 .find(file=>fs.existsSync(file));
const browser=await chromium.launch({headless:true,
 ...(chromePath?{executablePath:chromePath}:{}),args:["--no-sandbox"]});
fs.mkdirSync(path.join(root,"artifacts"),{recursive:true});

function ensure(value,description){if(!value)throw Error(description);}
async function evaluateLayout(page,expectDesktop){
 const result=await page.evaluate(()=>{
  const read=selector=>{
   const el=document.querySelector(selector),rect=el.getBoundingClientRect(),
    styles=getComputedStyle(el);
   return {x:rect.x,y:rect.y,w:rect.width,h:rect.height,
    right:rect.right,bottom:rect.bottom,visible:styles.display!=="none"&&rect.width>0&&rect.height>0};
  };
  return {
   width:innerWidth,height:innerHeight,
   rootScrollHeight:document.documentElement.scrollHeight,
   rootScrollWidth:document.documentElement.scrollWidth,
   bodyScrollHeight:document.body.scrollHeight,
   view:document.getElementById("game-app").dataset.workspaceView,
   board:read("#game-app .board"),
   history:read("#game-app .bottom>.drawer"),
   chat:read("#game-app .bottom>.chat-panel"),
   topbar:read("#game-app .topbar")
  };
 });
 ensure(result.rootScrollHeight<=result.height+2,
  "Document scrolls at "+result.width+"px: scrollHeight="+result.rootScrollHeight+" viewport="+result.height);
 ensure(result.bodyScrollHeight<=result.height+2,"Body scrolls at "+result.width+"px");
 ensure(result.rootScrollWidth<=result.width+2,"Document scrolls horizontally at "+result.width+"px");
 const active=result.view==="chat"?result.chat:result.view==="history"?result.history:result.board;
 for(const panel of [result.topbar,...(expectDesktop?[result.history,result.board,result.chat]:[active])]){
  ensure(panel.visible&&panel.y>=-1&&panel.bottom<=result.height+2,
   "Panel clipped offscreen at "+result.width+"px: "+JSON.stringify(panel));
 }
 if(expectDesktop){
  ensure(result.history.right<=result.board.x+2,"History overlaps board");
  ensure(result.board.right<=result.chat.x+2,"Board overlaps chat");
 }
 return result;
}
try{
 for(const viewport of [{width:1792,height:900},{width:1440,height:900},{width:1280,height:720},{width:1024,height:768},{width:390,height:844}]){
  const page=await browser.newPage({viewport,deviceScaleFactor:1});
  const pageErrors=[];
  page.on("pageerror",error=>pageErrors.push(String(error)));
  await page.route("https://fonts.googleapis.com/**",route=>route.abort());
  await page.route("https://fonts.gstatic.com/**",route=>route.abort());
  await page.goto(url,{waitUntil:"domcontentloaded"});
  await page.evaluate(()=>document.body.classList.remove("home-visible"));
  await page.waitForTimeout(180);
  let result=await evaluateLayout(page,viewport.width>890);
  ensure(await page.locator("#language-select").count()===1,"Missing language selector");
  await page.locator("#language-select").selectOption("en");
  ensure(await page.locator("html").getAttribute("lang")==="en","Language toggle failed");
  await page.locator("#language-select").selectOption("fr");
  if(viewport.width>890){
   const original=await page.locator("#game-app .board").boundingBox();
   await page.locator("#drawer-collapse").click();
   const collapsed=await page.locator("#game-app .board").boundingBox();
   ensure(collapsed.width>original.width+60,"History collapse did not expand the table");
   await evaluateLayout(page,true);
   await page.locator("#drawer-collapse").click();
  }
  ensure(!pageErrors.length,"Browser runtime errors: "+pageErrors.join("; "));

  if(viewport.width<=890){
   for(const view of ["history","chat","board"]){
    await page.locator('.workspace-mobile [data-workspace-view="'+view+'"]').click();
    const visible=await page.locator(view==="board"?"#game-app .board":
      view==="history"?"#game-app .bottom>.drawer":"#game-app .bottom>.chat-panel").isVisible();
    ensure(visible,"Mobile view "+view+" is hidden after navigation");
    result=await evaluateLayout(page,false);
   }
  }
  // Render real-sized card art in every playmat zone, including exhausted cards.
  // This catches vertical clipping that the original no-scroll smoke test missed.
  if(viewport.width>=1000||viewport.width===390){
   const clipped=await page.evaluate(()=>{
    const card=(exhausted=false)=>{
     const el=document.createElement("div");
     el.className="card-tile"+(exhausted?" exhausted":"");
     const art=document.createElement("div");art.className="card-art";
     const image=document.createElement("div");image.className="card-back";image.textContent="R";
     art.append(image);el.append(art);
     const title=document.createElement("div");title.className="card-label";title.textContent="Loyal Poro";
     el.append(title);return el;
    };
    for(const id of ["ai-legend","ai-champion","human-legend","human-champion",
      "ai-hand","human-base","human-hand","ai-runes","human-runes","ai-trash","human-trash"]){
     const target=document.getElementById(id);
     if(!target)continue;
     const tapped=/runes|base/.test(id);
     target.replaceChildren(card(tapped));
    }
    const violations=[];
    const inspect=()=>{
     for(const element of document.querySelectorAll("#game-app .playmat .panel .card-tile")){
      const art=element.querySelector(".card-art").getBoundingClientRect();
      const zone=element.closest(".panel").getBoundingClientRect();
      if(art.top<zone.top-3||art.bottom>zone.bottom+3 ||
        art.left<zone.left-3||art.right>zone.right+3)
       violations.push({zone:element.closest(".panel").dataset.zone,art:{
         top:art.top,bottom:art.bottom,left:art.left,right:art.right},
        panel:{top:zone.top,bottom:zone.bottom,left:zone.left,right:zone.right}});
     }
    };inspect();return violations;
   });
   ensure(clipped.length===0,"Card artwork clipped at "+viewport.width+"x"+viewport.height+
    ": "+JSON.stringify(clipped.slice(0,4)));
  }
  if(viewport.width>=1000){
   // Dozens of card entries must be handled inside the board, not by the document.
   await page.evaluate(()=>{
    const target=document.getElementById("ai-base");
    for(let i=0;i<24;i++){
     const el=document.createElement("div");
     el.className="card-tile";
     el.innerHTML='<div class="card-back">R</div>';
     target.append(el);
    }
   });
   await evaluateLayout(page,true);
  }
  await page.screenshot({path:path.join(root,"artifacts","workspace-"+viewport.width+".png")});
  console.log("PASS",viewport.width+"x"+viewport.height,"no page scroll; board/chat/history accessible");
  await page.close();
 }
}finally{
 await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
