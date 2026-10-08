import type { DrawResult, HoldColor } from "./lottery";
import { isStMode, type Mode } from "./spec";
import { pickWeighted, randInt, type Rand } from "./rng";

/**
 * 変動の演出（シナリオ）。当否はもう決まっていて、ここではどう見せるかだけを決める。
 * 液晶はこのシナリオと経過時間だけを見て描く。
 */
export type ScenarioKind = "hazure" | "reach" | "sp" | "spsp" | "zenkaiten" | "sudden";
export type Cutin = "none" | "blue" | "red" | "gold";

export interface Scenario {
  kind: ScenarioKind;
  hit: boolean;
  /** 最後に揃う図柄 [左, 中, 右] */
  final: [number, number, number];
  /** 各リールが止まる時刻 [左, 中, 右]（変動開始からの秒） */
  stops: [number, number, number];
  duration: number;
  /** 左右がそろってリーチになる時刻 */
  reachAt?: number;
  /** SP リーチへ発展する時刻 */
  spAt?: number;
  /** SPSP（最終決戦）へ発展する時刻 */
  spspAt?: number;
  /** PUSH ボタンの受付開始。決着は stops[1] */
  pushAt?: number;
  /** 擬似連の「NEXT」が出る時刻 */
  pseudo: number[];
  cutin: Cutin;
  /** カットインを出す時刻 */
  cutinAt?: number;
  /** ST 中の速い変動 */
  fast: boolean;
}

const KIND_ON_HIT_LOW: Record<ScenarioKind, number> = { hazure: 0, reach: 8, sp: 30, spsp: 52, zenkaiten: 10, sudden: 0 };
const KIND_ON_MISS_LOW: Record<ScenarioKind, number> = { hazure: 90.2, reach: 7, sp: 2.2, spsp: 0.6, zenkaiten: 0, sudden: 0 };
const KIND_ON_HIT_FAST: Record<ScenarioKind, number> = { hazure: 0, reach: 25, sp: 25, spsp: 0, zenkaiten: 10, sudden: 40 };
const KIND_ON_MISS_FAST: Record<ScenarioKind, number> = { hazure: 92, reach: 7, sp: 1, spsp: 0, zenkaiten: 0, sudden: 0 };

const CUTIN_ON_HIT: Record<Cutin, number> = { none: 25, blue: 25, red: 35, gold: 15 };
const CUTIN_ON_MISS: Record<Cutin, number> = { none: 60, blue: 32, red: 8, gold: 0 };

/** 保留の色に見合う最低限の演出（赤保留なのに即ハズレ、を避ける） */
const MIN_KIND_FOR_COLOR: Record<HoldColor, ScenarioKind> = {
  white: "hazure",
  blue: "reach",
  green: "sp",
  red: "spsp",
  rainbow: "spsp",
};
const KIND_RANK: ScenarioKind[] = ["hazure", "reach", "sp", "spsp"];

export function buildScenario(
  result: DrawResult,
  mode: Mode,
  holdsLeft: number,
  color: HoldColor,
  rand: Rand,
): Scenario {
  const fast = isStMode(mode) || mode === "jitan";
  const table = result.hit ? (fast ? KIND_ON_HIT_FAST : KIND_ON_HIT_LOW) : fast ? KIND_ON_MISS_FAST : KIND_ON_MISS_LOW;
  let kind = pickWeighted(rand, table);
  if (!result.hit && !fast) {
    const min = MIN_KIND_FOR_COLOR[color];
    if (KIND_RANK.indexOf(kind) < KIND_RANK.indexOf(min)) kind = min;
  }
  if (result.hit && color === "rainbow") kind = "zenkaiten";

  const final = finalReels(result, kind, rand);
  const pseudo: number[] = [];
  if (kind !== "hazure" && kind !== "sudden" && kind !== "zenkaiten" && !fast) {
    const n = pickWeighted(
      rand,
      result.hit
        ? { "0": 30, "1": 25, "2": 25, "3": 20 }
        : kind === "reach"
          ? { "0": 75, "1": 20, "2": 5, "3": 0 }
          : { "0": 45, "1": 35, "2": 15, "3": 5 },
    );
    for (let i = 0; i < Number(n); i++) pseudo.push(2.2 + i * 2.4);
  }
  const pre = pseudo.length * 2.4;

  const base = {
    kind,
    hit: result.hit,
    final,
    pseudo,
    cutin: "none" as Cutin,
    fast,
  };

  if (kind === "hazure") {
    const d = fast ? 1.4 : holdsLeft >= 3 ? 3.0 : holdsLeft >= 1 ? 5.0 : 7.0;
    return { ...base, duration: d, stops: [d * 0.45, d * 0.92, d * 0.7] };
  }
  if (kind === "sudden") {
    return { ...base, duration: 2.8, stops: [2.2, 2.2, 2.2], cutin: "gold", cutinAt: 0.5 };
  }
  if (kind === "zenkaiten") {
    return { ...base, duration: 10, stops: [8.6, 8.6, 8.6] };
  }

  const cutin = pickWeighted(rand, result.hit ? CUTIN_ON_HIT : CUTIN_ON_MISS);
  const reachAt = (fast ? 1.0 : 3.2) + pre;
  const withCutin = (s: Scenario): Scenario =>
    cutin === "none" ? s : { ...s, cutin, cutinAt: (s.spAt ?? reachAt + 2) - 1.2 };

  if (kind === "reach") {
    const c = reachAt + (fast ? 4.5 : 7.5);
    return withCutin({ ...base, reachAt, duration: c + 0.8, stops: [reachAt - 1.2, c, reachAt] });
  }
  const spAt = reachAt + (fast ? 1.5 : 3.2);
  if (kind === "sp") {
    const c = spAt + (fast ? 8 : 12);
    const pushAt = rand() < 0.3 ? c - 2.5 : undefined;
    return withCutin({ ...base, reachAt, spAt, pushAt, duration: c + 1, stops: [reachAt - 1.2, c, reachAt] });
  }
  const spspAt = spAt + 9;
  const c = spspAt + 12;
  return withCutin({ ...base, reachAt, spAt, spspAt, pushAt: c - 3, duration: c + 1.2, stops: [reachAt - 1.2, c, reachAt] });
}

function finalReels(result: DrawResult, kind: ScenarioKind, rand: Rand): [number, number, number] {
  if (result.hit) return [result.number, result.number, result.number];
  const a = randInt(rand, 1, 9);
  if (kind === "hazure") {
    let b = randInt(rand, 1, 8);
    if (b >= a) b++;
    return [a, randInt(rand, 1, 9), b];
  }
  // リーチハズレ。多くは 1 コマずれで止める
  let c: number;
  if (rand() < 0.65) c = rand() < 0.5 ? (a % 9) + 1 : ((a + 7) % 9) + 1;
  else {
    c = randInt(rand, 1, 8);
    if (c >= a) c++;
  }
  return [a, c, a];
}
