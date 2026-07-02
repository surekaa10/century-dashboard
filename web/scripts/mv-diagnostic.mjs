import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = dirname(fileURLToPath(import.meta.url));
const snap = JSON.parse(readFileSync(join(root, "../public/snapshot.local.json"), "utf8"));
const pos = snap.positions;

const unsignedMV = (p) => p.Volume * p["Current Price"];
const signedMV = (p) => (p.Direction === "Short" ? -1 : 1) * p.Volume * p["Current Price"];

let netUnsigned = 0, longExp = 0, shortExp = 0;

console.log("=== SHORT POSITION MARKET VALUE DIAGNOSTIC ===\n");
for (const p of pos) {
  const u = unsignedMV(p);
  const stored = p["Market Value"];
  if (p.Direction === "Short") {
    console.log(`${p.Symbol} (Short)`);
    console.log(`  Snapshot MV:     ${stored}`);
    console.log(`  volume × price:  ${u.toFixed(2)}  (mt5_connector formula — always positive)`);
    console.log(`  signed formula:  ${signedMV(p).toFixed(2)}`);
  }
  netUnsigned += u;
  if (p.Direction === "Long") longExp += Math.abs(stored);
  else shortExp += Math.abs(stored);
}

console.log("\n=== EXPOSURE IF YOU SUM RAW volume×price ===");
console.log(`Net exposure: ${netUnsigned.toFixed(2)}  ← shorts add positive, overstating net long`);
console.log(`Web-style net (long − short): ${(longExp - shortExp).toFixed(2)}`);

const rhmg = pos.find((p) => p.Symbol === "RHMG");
if (rhmg) {
  const qty = Math.abs(rhmg["Market Value"]) / rhmg["Current Price"];
  console.log("\n=== CONTRACT SIZE (RHMG) ===");
  console.log(`Lots: ${rhmg.Volume}, implied qty from |MV|/price: ${qty.toFixed(4)}`);
  console.log(`entry×volume cost basis: ${(rhmg["Entry Price"] * rhmg.Volume).toFixed(2)}`);
  console.log(`MT5 P&L: ${rhmg["Unrealized P&L"]}`);
  console.log(`P&L / (entry−current): ${(rhmg["Unrealized P&L"] / (rhmg["Entry Price"] - rhmg["Current Price"])).toFixed(2)}`);
}
