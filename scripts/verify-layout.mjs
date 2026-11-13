// Headless layout smoke test: no page-level scroll, readable independent panels.
// Launched by CI with the already-installed runner Chrome / Chromium browser.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright-core";
import {createState} from "../core.mjs";

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
  const structure=await page.evaluate(()=>{
   const ai=document.querySelector("#game-app .side.opponent .playmat");
   const player=document.querySelector("#game-app .side.player .playmat");
   const rune=document.querySelector("#human-runes").closest(".panel").getBoundingClientRect();
   const legend=document.querySelector("#human-legend").closest(".panel").getBoundingClientRect();
   const history=document.querySelector("#game-app .live-history").getBoundingClientRect();
   const tools=document.querySelector("#game-app #tab-setup").getBoundingClientRect();
   return {
    ai:getComputedStyle(ai).gridTemplateAreas,
    player:getComputedStyle(player).gridTemplateAreas,
    inlineTyping:document.querySelector("#chat-typing").parentElement.id==="chat-messages",
    autoSend:document.querySelector("#voice-auto-send").checked,
    hasJump:!!document.querySelector("#chat-jump"),
    runeWidth:rune.width,legendWidth:legend.width,
    historyHeight:history.height,toolsHeight:tools.height
   };
  });
  ensure(structure.ai.includes('"runes runes runes hand trash"')&&
    structure.player.includes('"legend champion base base piles"'),
    "Both physical playmats must mirror each other");
  ensure(structure.inlineTyping&&structure.autoSend&&structure.hasJump,
    "Messenger typing, jump and hands-free controls missing");
  if(viewport.width>=1200){
   ensure(structure.runeWidth>structure.legendWidth*2,
    "Rune row too narrow for visible cards");
   ensure(structure.historyHeight>structure.toolsHeight,
    "History should be larger than tool panel");
  }
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
  // Regression: a shown rule notification must not become an implicit grid
  // column, collapsing the entire table to a narrow vertical strip.
  const notificationGeometry=await page.evaluate(()=>{
   const board=document.querySelector("#game-app .board");
   const rect=()=>board.getBoundingClientRect();
   const before=rect();
   const pending=document.querySelector("#pending-effect-panel");
   document.querySelector("#pending-effect-card").textContent="Disciple of Shen";
   document.querySelector("#pending-effect-description").textContent=
    "I have [Shield 3] while I'm at a battlefield with exactly one other unit you control.";
   pending.hidden=false;
   const effect=pending.getBoundingClientRect();
   const boardWithEffect=rect();
   const effectPosition=getComputedStyle(pending).position;
   pending.hidden=true;
   const victory=document.querySelector("#game-victory");
   victory.hidden=false;
   const win=victory.getBoundingClientRect();
   const boardWithVictory=rect();
   const victoryPosition=getComputedStyle(victory).position;
   victory.hidden=true;
   return {effectWidth:effect.width,effectHeight:effect.height,
    effectLeft:effect.left,effectRight:effect.right,effectPosition,
    winWidth:win.width,winLeft:win.left,winRight:win.right,victoryPosition,
    boardShift:Math.max(Math.abs(before.width-boardWithEffect.width),
     Math.abs(before.left-boardWithEffect.left),
     Math.abs(before.width-boardWithVictory.width),
     Math.abs(before.left-boardWithVictory.left))};
  });
  ensure(notificationGeometry.effectPosition==="absolute"&&
   notificationGeometry.victoryPosition==="absolute",
   "Rule prompt or winner banner incorrectly participates in the three-column grid");
  ensure(notificationGeometry.effectWidth>Math.min(300,viewport.width*.65)&&
   notificationGeometry.effectHeight<viewport.height*.6&&
   notificationGeometry.effectLeft>=0&&notificationGeometry.effectRight<=viewport.width+2,
   "Pending ability panel is squeezed or cropped: "+JSON.stringify(notificationGeometry));
  ensure(notificationGeometry.boardShift<2,
   "Displaying an effect or victory changed board dimensions: "+JSON.stringify(notificationGeometry));


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
      "ai-hand","human-base","human-hand","ai-runes","human-runes","ai-trash","human-trash",
      "bf-image-0","bf-image-1","units-0","units-1"]){
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
     for(const artElement of document.querySelectorAll("#game-app .battlefield .card-tile .card-art")){
      const art=artElement.getBoundingClientRect();
      const field=artElement.closest(".battlefield").getBoundingClientRect();
      if(art.top<field.top-3||art.bottom>field.bottom+3 ||
         art.left<field.left-3||art.right>field.right+3)
       violations.push({zone:"battlefield",art:{top:art.top,bottom:art.bottom,left:art.left,right:art.right},
        panel:{top:field.top,bottom:field.bottom,left:field.left,right:field.right}});
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
 // UI integration regression: the manager MUST show the updater screen
 // before allowing game launch when an old release is installed.
 const managerPage=await browser.newPage({viewport:{width:1024,height:820}});
 let upToDate=false,uninstallCalls=0,managerApiRequests=0;
 const managerPayload=()=>({
  version:upToDate?"0.38.0":"0.26.0",portable:true,
  path:"C:\\Portable\\Riftbound",updateState:upToDate?"current":"outdated",
  canLaunch:upToDate,mustUpdate:!upToDate,
  availableVersion:upToDate?null:"0.38.0",progress:0,
  error:"",updating:false,shuttingDown:false
 });
 await managerPage.route("**/api/**",async route=>{
  const pathname=new URL(route.request().url()).pathname;
  managerApiRequests++;
  const response=pathname==="/api/manager/uninstall"?
   (uninstallCalls++,{ok:true,uninstalling:true,message:"Cleanup authorized"}):
   pathname==="/api/manager/status"?managerPayload():
   pathname==="/api/ai/free/status"?{ready:false,running:false,message:"IA arrêtée"}:
   pathname==="/api/speech/status"?{installed:false,running:false,message:"Whisper absent"}:
   pathname==="/api/manager/processes"?{
    companion:{active:true,pid:123},scope:"companion-only",
    qwen:{active:false,installed:true,enabled:false,installing:false},
    whisper:{active:false,installed:true,enabled:true,model:"base",installing:false},
    tunnel:{active:false,starting:false}
   }:{};
 
  await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(response)});
 });
 const errors=[];
 managerPage.on("pageerror",err=>errors.push(String(err)));
 await managerPage.goto(url+"/manager.html#access=layout-qa",{waitUntil:"domcontentloaded"});
 await managerPage.waitForFunction(()=>
  document.querySelector("#startup-screen")?.hidden===false&&
  document.querySelector("#startup-update")?.hidden===false);
 ensure(await managerPage.locator("#manager-dashboard").isHidden(),
  "Outdated companion exposes game launch controls instead of the updater");
 ensure(await managerPage.locator("#manager-stop").isVisible(),
  "Process stop must remain reachable before an update");
 ensure(await managerPage.locator("#process-dashboard").isVisible(),
  "Process status must remain visible during mandatory version updates");
 ensure(await managerPage.locator("#process-qwen-status").textContent().then(v=>v.includes("Installé")),
  "Manager should distinguish installed Qwen from an active Qwen process");
 ensure(await managerPage.locator("#process-whisper-status").textContent().then(v=>v.includes("repos")),
  "Idle Whisper should not be marked as a permanent running process");
 ensure(await managerPage.locator("#process-stop-all").isVisible(),
  "Emergency stop-all control is unavailable");

 upToDate=true;
 await managerPage.evaluate(()=>refresh());
 ensure(await managerPage.locator("#manager-dashboard").isVisible(),
  "Updated companion should expose its normal manager");
 ensure(await managerPage.locator("#startup-screen").isHidden(),
  "Updated companion should hide its update-only splash screen");
 ensure(!errors.length,"Manager script errors: "+errors.join("; "));
 console.log("PASS manager update-first screen and permanent process-stop button");
 // Mock an accepted uninstall handoff and simulate that localhost disappears.
 // The page must remain readable, hide stale process panels, and stop polling.
 managerPage.on("dialog",dialog=>dialog.accept());
 ensure(await managerPage.locator(".manager-advanced").isVisible(),
  "Maintenance must be visible without a dropdown or accordion");
 ensure(await managerPage.locator("#process-dashboard").isVisible(),
  "Process dashboard must remain visible without a dropdown");
 ensure(await managerPage.locator("#model-choices button").count()===2,
  "Both local models must be visible as buttons");
 ensure(await managerPage.locator("#manager-dashboard details").count()===0,
  "Manager still contains collapsed menus");
 await managerPage.locator('[data-ai-model="qwen3.5:9b-q4km"]').click();
 ensure(await managerPage.locator("#ai-profile").inputValue()==="qwen3.5:9b-q4km",
  "Model-choice button did not update the pending install");
 ensure(await managerPage.locator('[data-ai-model="qwen3.5:9b-q4km"]').getAttribute("aria-pressed")==="true",
  "Selection state not visible for the model button");
 await managerPage.locator("#uninstall").click();
 await managerPage.waitForFunction(()=>
  document.querySelector("#startup-title")?.textContent?.includes("tu peux fermer cet onglet"));
 ensure(uninstallCalls===1,"The manager did not submit exactly one uninstall request");
 ensure(await managerPage.locator("#process-dashboard").isHidden(),
  "Process dashboard still visible after the Windows server closes");
 ensure(await managerPage.locator("#startup-retry").isHidden(),
  "The exit screen still offers a broken reconnection button");
 ensure((await managerPage.locator("#startup-details").textContent()).includes("127.0.0.1"),
  "Exit screen does not explain normal localhost connection refusal");
 const callsAfterUninstall=managerApiRequests;
 await managerPage.evaluate(()=>refresh());
 ensure(managerApiRequests===callsAfterUninstall,
  "Closed companion keeps polling a no-longer-existent server");
 ensure(!errors.length,"Manager script errors: "+errors.join("; "));
 console.log("PASS accepted uninstall shows a stable post-exit screen without localhost polling");
 await managerPage.close();

 // The hosted game's UI must refuse to open an outdated local companion.
 const gamePage=await browser.newPage({viewport:{width:1440,height:900}});
 let installedVersion="0.26.0";
 const localState=createState();
 await gamePage.route("http://127.0.0.1:8787/api/**",async route=>{
  const pathname=new URL(route.request().url()).pathname;
  const body=pathname==="/api/state"?{state:localState}:
   pathname==="/api/health"?{ok:true,name:"Riftbound Companion",version:installedVersion}:
   pathname==="/api/manager/status"?{canLaunch:installedVersion==="0.38.0",
    updateState:installedVersion==="0.38.0"?"current":"outdated",
    mustUpdate:installedVersion!=="0.38.0",availableVersion:"0.26.0"}:
   pathname==="/api/messages"?{messages:[],lastId:0,session:"smoke"}:
   pathname==="/api/events-ticket"?{ticket:"smoke"}:{};
  await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(body),
   headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type"}});
 });
 const gameErrors=[];
 gamePage.on("pageerror",err=>gameErrors.push(String(err)));
 await gamePage.goto(url,{waitUntil:"domcontentloaded"});
 await gamePage.evaluate(()=>{
  document.querySelector("#relay-url").value="http://127.0.0.1:8787";
  document.querySelector("#relay-token").value="layout-qa";
  document.querySelector("#connect-relay").click();
 });
 await gamePage.waitForFunction(()=>!document.querySelector("#companion-version-gate")?.hidden,{timeout:10000});
 ensure(await gamePage.locator("#home-next").isDisabled(),
  "Outdated companion still permits skipping the install wizard");
 ensure(await gamePage.locator("#manager-open").count()===1,
  "Manager button missing from the main header");
 installedVersion="0.38.0";
 await gamePage.evaluate(()=>document.querySelector("#connect-relay").click());
 await gamePage.waitForFunction(()=>document.querySelector("#companion-version-gate")?.hidden===true,{timeout:10000});
 ensure(!gameErrors.length,"Game startup version gate script errors: "+gameErrors.join("; "));
 console.log("PASS site redirects old companion to first installation step");
 // From the welcome screen the manager must remain visible and take the user
 // back to the same authenticated manager tab, not spawn a second window.
 ensure(await gamePage.locator("#manager-open").isVisible(),
  "The welcome screen hides its return-to-manager button");
 await gamePage.route("http://127.0.0.1:8787/manager.html",route=>route.fulfill({
  status:200,contentType:"text/html",body:"<!doctype html><title>Manager test destination</title>"
 }));
 await gamePage.locator("#manager-open").click();
 await gamePage.waitForURL("http://127.0.0.1:8787/manager.html#access=layout-qa",{timeout:10000});
 console.log("PASS welcome manager navigation returns to the same authenticated tab");
 await gamePage.close();
}finally{
 await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
