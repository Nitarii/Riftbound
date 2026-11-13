import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const js=fs.readFileSync(new URL("../app.mjs",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../style.css",import.meta.url),"utf8");
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
test("welcome screen appears first and board remains accessible",()=>{
 assert.match(html,/<body class="home-visible">/);
 assert.match(html,/id="welcome-screen"/);
 assert.match(html,/id="game-app"/);
 assert.match(css,/body\.home-visible #game-app\{display:none\}/);
 assert.match(js,/function showGame\(/);
 assert.match(js,/\$\("go-home"\)\.onclick=showHome/);
});
test("all homepage controls have unique IDs and handlers",()=>{
 assert.equal(ids.length,new Set(ids).size);
 for(const id of ["home-installed","home-download","home-connect","home-preview","home-create-game",
  "home-copy-prompt","home-human-legend","home-human-champion",
  "home-human-battlefield","home-ai-deck","home-first-player","home-server-url","home-server-token",
  "welcome-progress","home-feedback"]){
   assert.ok(ids.includes(id),"Missing id="+id);
   assert.ok(js.includes('"'+id+'"'),"Missing JS reference for "+id);
 }
});
test("direct Windows download is a single exe with no Node dependency for the player",()=>{
 assert.match(html,/https:\/\/github\.com\/Nitarii\/Riftbound\/releases\/download\/companion-latest\/RiftboundCompanion-v0\.\d+\.exe/);
 assert.match(html,/Un fichier Windows, sans dépendance/);
 assert.match(html,/programme n’est pas signé/);
 assert.doesNotMatch(html,/main\.zip/);
 assert.match(js,/function autoBootstrapCompanion\(/);
 assert.match(js,/sessionStorage\.setItem/);
});
test("the UI is honest about physical cards, AI access and fan status",()=>{
 assert.match(html,/non commercial/);
 assert.match(html,/cartes physiques/i);
 assert.match(html,/Une IA extérieure|une IA distante|IA distante|IA extérieure|agent externe|Un agent distant/i);
 assert.match(js,/const deck=resolvePrecon\(catalog,\$\("home-ai-deck"\)\.value\)/);
 assert.match(js,/type:"setup-human"/);
 assert.match(js,/type:"setup-ai"/);
 assert.match(js,/type:"start"/);
});

test("setup has one conditional page instead of a four-screen wizard",()=>{
 const steps=[...html.matchAll(/<section class="welcome-step" data-wizard-step="(\d)"[^>]*>/g)];
 assert.equal(steps.length,4,"Existing section IDs remain for compatibility");
 assert.match(html,/class="wizard-progress"[^>]*hidden/);
 assert.match(html,/class="wizard-navigation"[^>]*hidden/);
 assert.match(css,/\.welcome-steps\{display:flex;flex-direction:column/);
 assert.match(js,/const visible=!companionGate&&\(relay\?i>=2:onboarding\.preview\?i<=2:i<=1\)/);
 assert.match(js,/card\.hidden=!visible/);
 assert.match(js,/showGame\(\);/);
});
test("wizard requires confirmation before advancing, with a preview route",()=>{
 assert.match(js,/if\(!status\[wizardStep-1\]\)\{/);
 assert.match(js,/\$\("home-next"\)\.disabled=Boolean\(companionGate\)\|\|!steps\[wizardStep-1\]/);
 assert.match(js,/onboarding\.installed\|\|onboarding\.installSkipped/);
 assert.match(js,/onboarding\.installSkipped=true/);
 assert.match(js,/onboarding\.preview=true/);
 assert.match(js,/onboarding\.prompt/);
 assert.match(js,/onboarding\.wizardStep=wizardStep/);
});

test("game-like quest tick is keyboard accessible and linked to progress",()=>{
 assert.match(html,/class="welcome-step-check quest-check"/);
 assert.match(css,/\.quest-check input:focus-visible \+ \.quest-check-badge/);
 assert.match(css,/\.quest-check input:checked \+ \.quest-check-badge/);
 assert.match(html,/id="home-connection-label"/);
});

test("browser permission requires an explicit click and describes recovery",()=>{
 assert.match(html,/id="home-allow-local"/);
 assert.match(html,/id="home-permission-help"/);
 assert.match(html,/Accès au réseau local/);
 assert.match(js,/navigator\.permissions\.query\(\{name:"loopback-network"\}\)/);
 assert.match(js,/targetAddressSpace:"loopback"/);
 assert.match(js,/if\(!userInitiated&&permissionState!=="granted"\)return false;/);
 assert.match(js,/pairExistingHostedTab\(true\)/);
 assert.doesNotMatch(js,/setInterval\(\(\)=>\{if\(!relay\)pairExistingHostedTab\(\);\},1200\)/);
});

test("Remote AI works in one click without a second program download",()=>{
 assert.match(html,/id="home-start-remote"/);
 assert.match(html,/Activer l'accès et copier le prompt IA/);
 assert.match(html,/id="home-stop-remote"/);
 assert.match(html,/id="home-prompt-manual"/);
 assert.match(html,/id="home-prompt-text"/);
 assert.doesNotMatch(html,/cloudflared-windows-amd64\.exe/);
 assert.doesNotMatch(html,/Installe cloudflared/);
 assert.match(js,/async function copyAgentPrompt\(/);
 assert.match(js,/await copyAgentPrompt\(true,clipboard\)/);
 assert.match(js,/armClipboardOnClick/);
});
