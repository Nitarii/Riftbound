// Generates standalone Windows SEA bundling both source and static assets.
import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const dist=path.join(root,"dist");
fs.mkdirSync(dist,{recursive:true});
const assets={};
for(const name of ["index.html","style.css","app.mjs","core.mjs","catalog.mjs","precons.mjs","narration.mjs","picker.mjs","agent.html","agent.js","assets/companion-icon.svg"]){
 if(!fs.existsSync(path.join(root,name)))throw Error("Asset missing: "+name);
 assets[name]=path.join(root,name);
}
const tunnelBinary=path.join(dist,"cloudflared.exe");
if(fs.existsSync(tunnelBinary))assets["cloudflared.exe"]=tunnelBinary;
const conf={
 main:path.join(dist,"server.bundle.cjs"),
 mainFormat:"commonjs",
 output:path.join(dist,"RiftboundCompanion.exe"),
 disableExperimentalSEAWarning:true,
 useCodeCache:false,
 useSnapshot:false,
 assets
};
fs.writeFileSync(path.join(dist,"sea-config.json"),JSON.stringify(conf,null,2));
console.log("SEA config prepared for "+Object.keys(assets).length+" embedded files");
