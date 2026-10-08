import type { Scenario } from "../game/scenario";

/**
 * 液晶の図柄リールの動き。変動の経過時間 t から各リールの位置（コマ数）を出す。
 * 位置が整数 k のとき図柄 (k mod 9) + 1 が真ん中に来る。止まる時刻にちょうど
 * 最終図柄で止まるよう、止まる時刻から逆算して「あと何コマ進むか」で位置を決める。
 */

/** 速度が一定の割合で変わる区間 [t0, t1] で、速度は v0 から v1 へ */
interface Span {
  t0: number;
  t1: number;
  v0: number;
  v1: number;
}

export const FAST = 15;
const SLOW = 2.6;
const ZENKAITEN = 2.4;

export interface ReelPlan {
  spans: Span[][];
  targets: number[];
}

export function planReels(s: Scenario): ReelPlan {
  const spans: Span[][] = [];
  const targets: number[] = [];
  for (let i = 0; i < 3; i++) {
    const stop = s.stops[i];
    const isCenterReach = i === 1 && s.reachAt !== undefined;
    let list: Span[];
    if (s.kind === "zenkaiten") {
      list = [
        { t0: 0, t1: stop - 1.4, v0: ZENKAITEN, v1: ZENKAITEN },
        { t0: stop - 1.4, t1: stop, v0: ZENKAITEN, v1: 0 },
      ];
    } else if (isCenterReach) {
      const r = s.reachAt!;
      const decel = Math.min(1.4, (stop - r - 0.8) / 2);
      list = [
        { t0: 0, t1: r, v0: FAST, v1: FAST },
        { t0: r, t1: r + 0.8, v0: FAST, v1: SLOW },
        { t0: r + 0.8, t1: stop - decel, v0: SLOW, v1: SLOW },
        { t0: stop - decel, t1: stop, v0: SLOW, v1: 0 },
      ];
    } else {
      const d = s.fast ? 0.18 : 0.32;
      list = [
        { t0: 0, t1: stop - d, v0: FAST, v1: FAST },
        { t0: stop - d, t1: stop, v0: FAST, v1: 0 },
      ];
    }
    spans.push(list);
    // 全回転は 3 つのリールが同じ位置で回る
    targets.push(900 + s.final[i] - 1);
  }
  return { spans, targets };
}

/** t 以降に進む残りのコマ数 */
function remaining(spans: Span[], t: number): number {
  let sum = 0;
  for (const sp of spans) {
    if (t >= sp.t1) continue;
    const a = Math.max(t, sp.t0);
    const dur = sp.t1 - sp.t0;
    const va = dur > 0 ? sp.v0 + ((sp.v1 - sp.v0) * (a - sp.t0)) / dur : sp.v0;
    sum += ((va + sp.v1) / 2) * (sp.t1 - a);
  }
  return sum;
}

export function reelPos(plan: ReelPlan, i: number, t: number): number {
  return plan.targets[i] - remaining(plan.spans[i], t);
}

/** その時刻の速度 [コマ/秒]（ブラーのかけ具合に使う） */
export function reelSpeed(plan: ReelPlan, i: number, t: number): number {
  for (const sp of plan.spans[i]) {
    if (t >= sp.t0 && t < sp.t1) return sp.v0 + ((sp.v1 - sp.v0) * (t - sp.t0)) / (sp.t1 - sp.t0);
  }
  return 0;
}

/** 位置 pos のコマ k の図柄 */
export function symbolAt(k: number): number {
  return (((k % 9) + 9) % 9) + 1;
}
