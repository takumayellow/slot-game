/**
 * 盤面の調整用シミュレーション。
 *   npm run sim                → 打ち出し強さごとの入賞率を表で出す
 *   npm run sim -- --dump out.json → 盤面と軌跡を JSON に書き出す（scripts/draw_board.py で画像化）
 *   npm run sim -- --open      → 電チュー・アタッカーを開けた状態で測る（--denchu / --attacker で片方だけ）
 *   npm run sim -- --detail    → 入賞口ごとの内訳と、行き先ごとの平均所要時間も出す
 */
import { writeFileSync } from "node:fs";
import { buildBoard } from "../src/sim/board";
import { PhysicsWorld } from "../src/sim/physics";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const args = process.argv.slice(2);
const dumpIdx = args.indexOf("--dump");
const openAll = args.includes("--open");
const openDenchu = openAll || args.includes("--denchu");
const openAttacker = openAll || args.includes("--attacker");
const detail = args.includes("--detail");
const layout = buildBoard();

if (dumpIdx >= 0) {
  const out = args[dumpIdx + 1] ?? "board.json";
  const strengths = args.includes("--left") ? [0.55, 0.6] : [0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1.0];
  const paths: { s: number; pts: [number, number][]; end: string }[] = [];
  for (const s of strengths) {
    for (let k = 0; k < (args.includes("--left") ? 12 : 4); k++) {
      const w = new PhysicsWorld(layout, mulberry32(k * 100 + Math.round(s * 1000)));
      w.gimmicks = { denchu: openDenchu, attacker: openAttacker };
      const b = w.launch(s)!;
      const pts: [number, number][] = [];
      let end = "timeout";
      for (let t = 0; t < 12 && end === "timeout"; t += 1 / 60) {
        const ev = w.advance(1 / 60);
        const cur = w.balls.find((x) => x.id === b.id);
        if (cur && cur.hiddenUntil <= w.time) pts.push([cur.x, cur.y]);
        for (const e of ev) {
          if (e.type === "foul") end = "foul";
          if (e.type === "sensor" && !e.sensor.passThrough && e.sensor.kind !== "warp") end = e.sensor.id;
        }
      }
      paths.push({ s, pts, end });
    }
  }
  writeFileSync(out, JSON.stringify({ layout, paths }));
  console.log(`wrote ${out}`);
} else {
  const N = Number(args.find((a: string) => /^\d+$/.test(a)) ?? 300);
  console.log(`strength | foul  heso  warp  denchu attack gate  pocket out   | avg s`);
  for (let s = 0.3; s <= 1.0001; s += 0.05) {
    const w = new PhysicsWorld(layout, mulberry32(Math.round(s * 1e4)));
    w.gimmicks = { denchu: openDenchu, attacker: openAttacker };
    const c: Record<string, number> = {};
    let launched = 0;
    let tsum = 0;
    let ended = 0;
    const born = new Map<number, number>();
    const byId: Record<string, number> = {};
    const tById: Record<string, number> = {};
    // 実機と同じ 100 発/分（0.6 秒に 1 発）で打つ
    for (let t = 0; launched < N || w.count > 0; t += 1 / 60) {
      if (launched < N && t >= launched * 0.6) {
        const b = w.launch(s);
        if (b) born.set(b.id, w.time);
        launched++;
      }
      for (const e of w.advance(1 / 60)) {
        let key: string | null = null;
        if (e.type === "foul") key = "foul";
        if (e.type === "sensor") key = e.sensor.kind;
        if (!key) continue;
        c[key] = (c[key] ?? 0) + 1;
        if (e.type !== "sensor" && e.type !== "foul") continue;
        if (e.type === "sensor" && e.sensor.passThrough) continue;
        if (key === "warp") continue;
        const b0 = born.get(e.ball.id);
        if (b0 !== undefined) {
          tsum += w.time - b0;
          ended++;
          const id = e.type === "foul" ? "foul" : e.sensor.id;
          byId[id] = (byId[id] ?? 0) + 1;
          tById[id] = (tById[id] ?? 0) + (w.time - b0);
        }
      }
      if (t > N * 0.6 + 60) break;
    }
    const pct = (k: string) => (((c[k] ?? 0) / N) * 100).toFixed(1).padStart(5);
    console.log(
      `${s.toFixed(2).padStart(8)} | ${pct("foul")} ${pct("heso")} ${pct("warp")} ${pct("denchu")}  ${pct("attacker")} ${pct("gate")} ${pct("pocket")}  ${pct("out")} | ${(tsum / Math.max(1, ended)).toFixed(2)} stuck=${w.count}`,
    );
    if (detail) {
      const parts = Object.keys(byId)
        .sort()
        .map((k) => `${k}:${byId[k]}/${(tById[k] / byId[k]).toFixed(1)}s`);
      console.log(`         | ${parts.join("  ")}`);
    }
  }
}
