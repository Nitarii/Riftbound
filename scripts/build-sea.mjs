// Generates standalone Windows SEA bundling both source and static assets.
import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const dist=path.join(root,"dist");
const desktop=process.argv.includes("--desktop");
fs.mkdirSync(dist,{recursive:true});
const assets={};
for(const name of ["index.html","manager.html","style.css","app.mjs","release-policy.mjs","process-lifecycle.mjs","chat-scrolling.mjs","battlefield-rules.mjs","combat-engine.mjs","combat-voice.mjs","rune-payment.mjs","play-effects.mjs","effect-engine.mjs","effect-runtime.mjs","draw-rules.mjs","priority-chain.mjs","player-sequence.mjs","turn-upkeep.mjs","local-voice.mjs","portable.mjs","update-transaction.mjs","portable-manager.mjs","whisper-local.mjs","core.mjs","catalog.mjs","precons.mjs","narration.mjs","picker.mjs","manual-bridge.mjs","conversation.mjs","integrated-ai.mjs","game-knowledge.mjs","rules-compendium.mjs","free-ai.mjs","local-ai-profiles.mjs","player-actions.mjs","clarification.mjs","ai-turn.mjs","voice-session.mjs","agent.html","agent.js","assets/companion-icon.svg","licenses/cloudflared-APACHE-2.0.txt"]){
 if(desktop&&name==="manager.html")continue;
 if(!fs.existsSync(path.join(root,name)))throw Error("Asset missing: "+name);
 assets[name]=path.join(root,name);
}
assets["verified-cards.mjs"]=path.join(root,"verified-cards.mjs");
assets["public-table.mjs"]=path.join(root,"public-table.mjs");
assets["card-voice.mjs"]=path.join(root,"card-voice.mjs");
// Bundle a compressed copy of the official cloudflared Windows client.
// Compression happens once on CI, not when the player starts a game.
const tunnelBinary=path.join(dist,"cloudflared.exe");
if(!fs.existsSync(tunnelBinary))throw Error("Missing verified Cloudflare tunnel client");
const zlib=await import("node:zlib");
const raw=fs.readFileSync(tunnelBinary);
const packed=zlib.brotliCompressSync(raw,{params:{
 [zlib.constants.BROTLI_PARAM_QUALITY]:9,
 [zlib.constants.BROTLI_PARAM_MODE]:zlib.constants.BROTLI_MODE_GENERIC
}});
const packedFile=path.join(dist,"cloudflared.exe.br");
fs.writeFileSync(packedFile,packed);
assets["cloudflared.exe.br"]=packedFile;
console.log("Embedded Cloudflare client compressed:",(raw.length/1024/1024).toFixed(1),
 "MiB ->",(packed.length/1024/1024).toFixed(1),"MiB");

const conf={
 main:path.join(dist,desktop?"desktop-engine.cjs":"server.bundle.cjs"),
 mainFormat:"commonjs",
 output:path.join(dist,desktop?"desktop-publish/engine/RiftboundEngine.exe":"RiftboundCompanion.exe"),
 disableExperimentalSEAWarning:true,
 useCodeCache:false,
 useSnapshot:false,
 assets
};
fs.writeFileSync(path.join(dist,desktop?"desktop-sea-config.json":"sea-config.json"),JSON.stringify(conf,null,2));
console.log("SEA config prepared for "+Object.keys(assets).length+" embedded files");
