// Rules implementations for the verified printings, separate from catalog text.
// Vendetta: https://playriftbound.com/en-us/news/announcements/the-vendetta-overview/
// Resonating Strike: https://playriftbound.com/en-us/news/announcements/vendetta-errata-updates/
import {canonicalCode} from "./precons.mjs";

const spells = Object.freeze({
 "OGN-008": Object.freeze({timing:"action",target:"field-unit",energy:2,power:1,domains:["Fury"],damageFromDiscard:true}),
 "OGN-058": Object.freeze({timing:"reaction",target:"unit",energy:2,power:0,might:2,draw:1}),
 "OGN-168": Object.freeze({timing:"action",target:"field-unit",energy:2,power:0,returnToBase:true}),
 "VEN-012": Object.freeze({timing:"main",target:"unit",energy:3,power:1,domains:["Fury"],
  ready:true,assault:3,flow:{energy:3,power:1,domains:["Fury"]}}),
 "VEN-031": Object.freeze({timing:"main",target:"friendly-unit",energy:1,power:0,
  might:1,shroud:true,flow:{energy:2,power:0}}),
 "VEN-008": Object.freeze({timing:"action",target:"field-unit",energy:3,power:0,damage:3,discardDamage:5}),
 "VEN-034": Object.freeze({timing:"reaction",target:"friendly-transfer",energy:2,power:1,domains:["Calm"],might:2}),
 "VEN-116": Object.freeze({timing:"main",target:"unit",energy:3,power:0,
  baseMight:5,flow:{energy:3,power:0}}),
 "VEN-126": Object.freeze({timing:"reaction",target:"unit",energy:2,power:1,domains:["Order"],prevention:7}),
 "VEN-127": Object.freeze({timing:"main",target:"unit",energy:2,power:1,domains:["Order"],
  disempower:true,killAtMost:3,flow:{energy:4,power:2,domains:["Order"]}})
});
export const printedCode=card=>canonicalCode(card?.code).replace(/^(VEN|OGN)-(\d{3})[A-Z]$/,"$1-$2");
export const verifiedSpell=card=>/^spell$/i.test(card?.type||"")?
 Object.hasOwn(spells,printedCode(card))?spells[printedCode(card)]:null:null;
export const handHammer=card=>printedCode(card)==="VEN-027"&&/^gear$/i.test(card.type);
export const fieldMusicians=card=>printedCode(card)==="VEN-026"&&/^unit$/i.test(card?.type||"");
export const pakaaProtector=card=>printedCode(card)==="VEN-033"&&/^unit$/i.test(card?.type||"");
export const shenLegend=card=>["VEN-147","VEN-193","VEN-193-STAR-166"].includes(printedCode(card))&&/^legend$/i.test(card?.type||"");
export const noxianEmissary=card=>printedCode(card)==="VEN-128"&&/^unit$/i.test(card?.type||"");
export const shadowAssassin=card=>printedCode(card)==="VEN-013";
export const mournfulWitness=card=>printedCode(card)==="VEN-028";
export const sacredProtector=card=>printedCode(card)==="VEN-129";
export const bladeTwirler=card=>printedCode(card)==="VEN-002";
export const soulspinner=card=>printedCode(card)==="VEN-123"&&/^unit$/i.test(card.type);
export const shadowDisciple=card=>printedCode(card)==="VEN-095";
export const zedChampion=card=>printedCode(card)==="VEN-112";
export const zedLegend=card=>printedCode(card)==="VEN-143";
export const shadowClone=card=>card?.code==="TOKEN-SHADOW-CLONE";
export const thresholdOfGray=card=>printedCode(card)==="VEN-166";
export const hiddenDisciple=card=>printedCode(card)==="VEN-117"&&/^unit$/i.test(card?.type||"");
export const hasHidden=card=>hiddenDisciple(card)||["VEN-034","OGN-168"].includes(printedCode(card))||/\[(?:Hidden|Caché)\]/i.test(card?.text||"");
