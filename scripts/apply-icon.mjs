// Build multi-resolution Windows icon from the same SVG used on the website.
// Icon tools are build-only; the released EXE has no npm / Node dependencies.
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const root=process.cwd(),dist=path.join(root,"dist");
const {Resvg}=require(path.join(dist,"icon-tools","node_modules","@resvg","resvg-js"));
const imported=require(path.join(dist,"icon-tools","node_modules","rcedit"));
const rcedit=imported.rcedit||imported;
if(typeof rcedit!=="function")throw Error("rcedit package did not expose an executable editor");
const svg=fs.readFileSync(path.join(root,"assets","companion-icon.svg"));
const sizes=[16,24,32,48,64,128,256];
const images=sizes.map(size=>new Resvg(svg,{
 fitTo:{mode:"width",value:size},
 font:{loadSystemFonts:false}
}).render().asPng());
const table=Buffer.alloc(6+sizes.length*16);
table.writeUInt16LE(0,0);table.writeUInt16LE(1,2);table.writeUInt16LE(sizes.length,4);
let offset=table.length;
images.forEach((png,i)=>{
 const o=6+i*16,size=sizes[i];
 table.writeUInt8(size===256?0:size,o);
 table.writeUInt8(size===256?0:size,o+1);
 table.writeUInt8(0,o+2);table.writeUInt8(0,o+3);
 table.writeUInt16LE(1,o+4);table.writeUInt16LE(32,o+6);
 table.writeUInt32LE(png.length,o+8);
 table.writeUInt32LE(offset,o+12);offset+=png.length;
});
const ico=path.join(dist,"companion.ico");
fs.writeFileSync(ico,Buffer.concat([table,...images]));
const exe=path.join(dist,"RiftboundCompanion.exe");
await rcedit(exe,{
 icon:ico,
 "file-version":"0.4.0.0",
 "product-version":"0.4.0.0",
 "version-string":{
  ProductName:"Riftbound Companion",
  FileDescription:"Compagnon visuel pour parties physiques",
  CompanyName:"Riftbound Companion Community",
  OriginalFilename:"RiftboundCompanion.exe",
  LegalCopyright:"Projet fan communautaire, non affilié à Riot Games"
 }
});
console.log("Applied branded 7-resolution Windows icon and executable metadata");
