import { describe, expect, it } from "vitest";
import { judge, makeHold } from "../src/game/lottery";
import { mulberry32 } from "../src/game/rng";
import { buildScenario } from "../src/game/scenario";
import type { Mode } from "../src/game/spec";
import { planReels, reelPos, reelSpeed, symbolAt } from "../src/lcd/reels";

describe("液晶のリール", () => {
  it("止まる時刻にちょうど最終図柄で止まり、途中で逆戻りしない", () => {
    const rand = mulberry32(21);
    for (let n = 0; n < 1200; n++) {
      const mode: Mode = (["normal", "rush", "jitan"] as Mode[])[n % 3];
      const hold = makeHold(n % 2 === 0 ? 1 : 2, mode, rand);
      const s = buildScenario(judge(hold, mode, rand), mode, n % 4, hold.color, rand);
      const plan = planReels(s);
      for (let i = 0; i < 3; i++) {
        const atStop = reelPos(plan, i, s.stops[i]);
        expect(Math.abs(atStop - Math.round(atStop))).toBeLessThan(1e-6);
        expect(symbolAt(Math.round(atStop))).toBe(s.final[i]);
        expect(reelPos(plan, i, s.duration)).toBeCloseTo(atStop, 9);
        let prev = -Infinity;
        for (let t = 0; t <= s.duration; t += 0.05) {
          const p = reelPos(plan, i, t);
          expect(p).toBeGreaterThanOrEqual(prev - 1e-9);
          prev = p;
        }
        expect(reelSpeed(plan, i, s.stops[i] + 0.01)).toBe(0);
      }
    }
  });

  it("全回転は 3 つのリールがそろって回る", () => {
    const rand = mulberry32(22);
    for (let n = 0; n < 200_000; n++) {
      const hold = makeHold(1, "normal", rand);
      const s = buildScenario(judge(hold, "normal", rand), "normal", 1, hold.color, rand);
      if (s.kind !== "zenkaiten") continue;
      const plan = planReels(s);
      for (let t = 0; t < s.duration; t += 0.3) {
        expect(symbolAt(Math.floor(reelPos(plan, 0, t)))).toBe(symbolAt(Math.floor(reelPos(plan, 2, t))));
      }
      return;
    }
    throw new Error("全回転が出なかった");
  });
});
