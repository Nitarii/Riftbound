// Shared with the GitHub Pages UI. A confirmed outdated companion may not
// launch a new physical game until updated. Offline status is explicit.
export const CURRENT_VERSION="0.26.0";
export const MINIMUM_COMPANION_VERSION=CURRENT_VERSION;
export const OFFICIAL_RELEASE="https://api.github.com/repos/Nitarii/Riftbound/releases/tags/companion-latest";
export const DOWNLOAD_URL="https://github.com/Nitarii/Riftbound/releases/download/companion-latest/RiftboundCompanion-v0.26.exe";
export function compareVersions(a,b){
 const parse=value=>String(value||"").replace(/^v/i,"").split(".").slice(0,3)
   .map(part=>/^\d+$/.test(part)?Number(part):0);
 const x=parse(a),y=parse(b);
 for(let i=0;i<3;i++)if((x[i]||0)!==(y[i]||0))return (x[i]||0)>(y[i]||0)?1:-1;
 return 0;
}
export function companionNeedsUpdate(installed,minimum=MINIMUM_COMPANION_VERSION){
 return !installed||!/^v?\d+\.\d+(?:\.\d+)?$/.test(String(installed))||
  compareVersions(installed,minimum)<0;
}
