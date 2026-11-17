// Rules implementations for the verified printings, separate from catalog text.
// Vendetta: https://playriftbound.com/en-us/news/announcements/the-vendetta-overview/
// Resonating Strike: https://playriftbound.com/en-us/news/announcements/vendetta-errata-updates/
import {canonicalCode} from "./precons.mjs";

const spells = Object.freeze({
 "OGN-058": Object.freeze({timing:"reaction",target:"unit",energy:2,power:0,might:2,draw:1}),
 "VEN-008": Object.freeze({timing:"action",target:"field-unit",energy:3,power:0,damage:3,discardDamage:5}),
 "VEN-034": Object.freeze({timing:"reaction",target:"friendly-transfer",energy:2,power:1,domains:["Calm"],might:2}),
 "VEN-126": Object.freeze({timing:"reaction",target:"unit",energy:2,power:1,domains:["Order"],prevention:7})
});
export const printedCode=card=>canonicalCode(card?.code).replace(/^(VEN|OGN)-(\d{3})[A-Z]$/,"$1-$2");
export const verifiedSpell=card=>/^spell$/i.test(card?.type||"")?
 Object.hasOwn(spells,printedCode(card))?spells[printedCode(card)]:null:null;
export const handHammer=card=>printedCode(card)==="VEN-027"&&/^gear$/i.test(card.type);
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
