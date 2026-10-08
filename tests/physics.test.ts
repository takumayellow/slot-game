import { describe, expect, it } from "vitest";
import { buildBoard } from "../src/sim/board";
import { PhysicsWorld } from "../src/sim/physics";
import { mulberry32 } from "../src/game/rng";

/** 実機と同じ 0.6 秒間隔で n 発打ち、行き先ごとの数を返す */
function run(strength: number, n: number, gimmicks = { denchu: false, attacker: false }) {
  const w = new PhysicsWorld(buildBoard(), mulberry32(Math.round(strength * 1e4)));
  w.gimmicks = gimmicks;
  const count: Record<string, number> = {};
  let launched = 0;
  let t = 0;
  for (; launched < n || w.count > 0; t += 1 / 60) {
    if (launched < n && t >= launched * 0.6) {
      w.launch(strength);
      launched++;
    }
    for (const e of w.advance(1 / 60)) {
      const key = e.type === "foul" ? "foul" : e.type === "sensor" ? e.sensor.kind : null;
      if (key) count[key] = (count[key] ?? 0) + 1;
    }
    if (t > n * 0.6 + 30) break;
  }
  return { count, stuck: w.count };
}

describe("盤面の物理", () => {
  it("左打ちで玉が詰まらず、ヘソ・入賞口・ワープに適度に入る", () => {
    const { count, stuck } = run(0.55, 150);
    expect(stuck).toBe(0);
    expect(count.foul ?? 0).toBe(0);
    const pct = (k: string) => ((count[k] ?? 0) / 150) * 100;
    expect(pct("heso")).toBeGreaterThan(3);
    expect(pct("heso")).toBeLessThan(20);
    expect(pct("pocket")).toBeLessThan(12);
    expect(pct("warp")).toBeGreaterThan(5);
  }, 60_000);

  it("弱すぎる玉はファールになって戻る", () => {
    const { count, stuck } = run(0.3, 20);
    expect(stuck).toBe(0);
    expect(count.foul).toBe(20);
  }, 60_000);

  it("右打ちはゲートを通り、開いたアタッカー・電チューに入る", () => {
    const att = run(0.85, 40, { denchu: false, attacker: true });
    expect(att.stuck).toBe(0);
    expect(att.count.gate).toBe(40);
    expect(att.count.attacker).toBeGreaterThanOrEqual(36);
    expect(att.count.heso ?? 0).toBe(0);
    const den = run(0.85, 40, { denchu: true, attacker: false });
    expect(den.count.denchu).toBeGreaterThanOrEqual(36);
  }, 60_000);
});
