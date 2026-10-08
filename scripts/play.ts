/**
 * 物理と台の制御をつないで、人が打つのと同じ流れを早回しで回す。
 *   npm run play -- [時間(分)] [左打ちの強さ] [種]
 * 回転率（1000 円あたりの回転数）、初当たり、RUSH の連チャン、収支を出す。
 */
import { buildBoard } from "../src/sim/board";
import { PhysicsWorld } from "../src/sim/physics";
import { Machine, type InputKind } from "../src/game/machine";
import { mulberry32 } from "../src/game/rng";
import { MODE_LABEL } from "../src/game/spec";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const minutes = Number(args[0] ?? 120);
const left = Number(args[1] ?? 0.55);
const seed = Number(args[2] ?? 1);
const RIGHT = 0.86;

const world = new PhysicsWorld(buildBoard(), mulberry32(seed));
const m = new Machine(mulberry32(seed + 1));
const DT = 1 / 60;
let launchT = 0;
let normalBalls = 0;
let normalSpins = 0;
let curChain = 0;
const firstHits: number[] = [];
let rushEntries = 0;
const chains: number[] = [];
const log: string[] = [];

for (let t = 0; t < minutes * 60; t += DT) {
  launchT += DT;
  if (launchT >= 0.6) {
    launchT -= 0.6;
    if (m.balls <= 0) m.rent();
    if (m.useBall()) {
      world.launch(m.rightShoot ? RIGHT : left);
      if (m.mode === "normal" && !m.jackpot) normalBalls++;
    }
  }
  world.gimmicks = m.gimmicks;
  for (const e of world.advance(DT)) {
    if (e.type === "sensor" && e.sensor.kind !== "out" && e.sensor.kind !== "warp") m.input(e.sensor.kind as InputKind);
  }
  for (const e of m.update(DT)) {
    if (e.type === "spin-start" && m.mode === "normal") normalSpins++;
    if (e.type === "jackpot-start" && m.mode === "normal") {
      firstHits.push(m.stats.spinsSinceHit);
    }
    if (e.type === "mode") {
      if ((e.mode === "rush" || e.mode === "lt") && (e.from === "normal" || e.from === "jitan")) rushEntries++;
      if (e.mode === "normal" && (e.from === "rush" || e.from === "lt")) {
        chains.push(curChain);
        curChain = 0;
      }
      log.push(`${(t / 60).toFixed(1)}分 ${MODE_LABEL[e.from]} → ${MODE_LABEL[e.mode]}  持ち玉 ${m.balls}  投資 ${m.invested}円`);
    }
    if (e.type === "jackpot-end" && (e.result.next === "rush" || e.result.next === "lt")) curChain++;
  }
}

const hits = m.stats.hits;
console.log(log.join("\n"));
console.log("---");
console.log(`打った時間 ${minutes}分 / 左打ち ${left}`);
console.log(`回転率 ${((normalSpins / Math.max(1, normalBalls)) * 250).toFixed(1)} 回転 / 1000円（通常時 ${normalSpins} 回転・${normalBalls} 発）`);
console.log(`大当たり ${hits.length} 回（初当たり ${firstHits.length} 回、RUSH 突入 ${rushEntries} 回）`);
console.log(`RUSH の連チャン ${chains.join(", ") || "-"}`);
console.log(`総回転 ${m.stats.totalSpins}  投資 ${m.invested}円  持ち玉 ${m.balls}  収支 ${m.balls * 4 - m.invested}円`);
