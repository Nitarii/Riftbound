import fs from "node:fs/promises";
import path from "node:path";

const repository = "Nitarii/Riftbound";
async function latestPublished(){
 const response = await fetch(`https://api.github.com/repos/${repository}/releases?per_page=50`, {
  headers:{"User-Agent":"Riftbound-Companion-Pages","Accept":"application/vnd.github+json",
   ...(process.env.GITHUB_TOKEN?{Authorization:"Bearer "+process.env.GITHUB_TOKEN}:{})},
  signal:AbortSignal.timeout(15000)
 });
 if (!response.ok) throw Error("GitHub Releases HTTP " + response.status);
 const releases = await response.json();
 return releases.flatMap(release => {
  const match = /^desktop-v(\d+\.\d+\.\d+)$/.exec(release.tag_name);
  if (!match || release.draft || release.prerelease) return [];
  const version = match[1];
  const prefix = `https://github.com/${repository}/releases/download/${release.tag_name}/`;
  const url = prefix + `RiftboundCompanion-${version}-x64-Setup.exe`;
  return release.assets.some(asset => asset.browser_download_url === url && /^sha256:[a-f\d]{64}$/i.test(asset.digest))
   ? [{version,url}] : [];
 }).sort((a,b) => b.version.localeCompare(a.version,"en",{numeric:true}))[0];
}
async function localPreview(){
 const project=await fs.readFile("desktop/RiftboundCompanion.csproj","utf8");
 const version=project.match(/<Version>(\d+\.\d+\.\d+)<\/Version>/)?.[1];
 const filename=`RiftboundCompanion-${version}-x64-Setup.exe`;
 await fs.access(path.join("dist",filename));
 return {version:version+" · aperçu local",url:"../"+filename};
}
const selected=process.argv.includes("--preview")?await localPreview():await latestPublished();
const destination = path.resolve("dist/pages");
const template = await fs.readFile("pages/index.html","utf8");
await fs.mkdir(destination,{recursive:true});
const download=selected
 ? `<a class="download" href="${selected.url}">Télécharger pour Windows</a>`
 : '<span class="download unavailable">Téléchargement Windows à venir</span>';
await fs.writeFile(path.join(destination,"index.html"),template
 .replace("__DOWNLOAD__",download).replace("__RELEASE_VERSION__",selected?.version??""));
await fs.copyFile("assets/companion-icon.svg",path.join(destination,"companion-icon.svg"));
await fs.writeFile(path.join(destination,".nojekyll"),"");
