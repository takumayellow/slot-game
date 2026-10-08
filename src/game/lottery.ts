import { hitProb, isStMode, SPEC, type Mode } from "./spec";
import { pickWeighted, randInt, type Rand } from "./rng";

/** 保留の色（先読み）。後ろほど熱い */
export type HoldColor = "white" | "blue" | "green" | "red" | "rainbow";
export const HOLD_COLORS: HoldColor[] = ["white", "blue", "green", "red", "rainbow"];

/** 保留 1 個。入賞した時点で乱数を取得しておく（実機と同じ「事前判定」） */
export interface Hold {
  /** 1 = ヘソ（特図1）、2 = 電チュー（特図2） */
  kind: 1 | 2;
  /** 当否判定に使う乱数。消化時のモードの確率と比べる */
  r: number;
  /** 振り分け用の乱数 */
  sub: number;
  ltRoll: number;
  color: HoldColor;
}

export interface DrawResult {
  hit: boolean;
  rounds: number;
  /** 大当たり後に移るモード */
  next: Mode;
  /** 図柄。奇数は RUSH（7 だけは LT）、偶数は通常 */
  number: number;
  /** 偶数図柄で当たり、エンディングで RUSH に昇格する */
  promote: boolean;
}

const HOLD_COLOR_ON_HIT: Record<HoldColor, number> = { white: 34, blue: 24, green: 18, red: 19, rainbow: 5 };
const HOLD_COLOR_ON_MISS: Record<HoldColor, number> = { white: 93, blue: 5, green: 1.5, red: 0.5, rainbow: 0 };

/** 入賞時に保留を作る。先読みの色はそのときのモードで当否を見て決める */
export function makeHold(kind: 1 | 2, mode: Mode, rand: Rand): Hold {
  const r = rand();
  const sub = rand();
  const ltRoll = rand();
  const willHit = r < hitProb(mode);
  // ST 中は保留がすぐ消化されるので、先読みはほとんど出さない
  const color =
    isStMode(mode) && !willHit
      ? "white"
      : pickWeighted(rand, willHit ? HOLD_COLOR_ON_HIT : HOLD_COLOR_ON_MISS);
  return { kind, r, sub, ltRoll, color };
}

export function judge(hold: Hold, mode: Mode, rand: Rand): DrawResult {
  const hit = hold.r < hitProb(mode);
  if (!hit) return { hit: false, rounds: 0, next: mode, number: 0, promote: false };

  if (hold.kind === 1) {
    const toRush = hold.sub < SPEC.hesoRushRate || isStMode(mode);
    const next: Mode = mode === "lt" ? "lt" : toRush ? "rush" : "jitan";
    if (next === "jitan") return { hit, rounds: SPEC.hesoRounds, next, number: evenNumber(rand), promote: false };
    // RUSH 当たりの 3 割は偶数図柄で見せ、エンディングで昇格させる
    const promote = next === "rush" && rand() < 0.3;
    return { hit, rounds: SPEC.hesoRounds, next, number: promote ? evenNumber(rand) : oddNumber(rand), promote };
  }

  const next: Mode = mode === "lt" || hold.ltRoll < SPEC.ltRate ? "lt" : "rush";
  const rounds = next === "lt" || hold.sub < SPEC.denchu10RRate ? 10 : 5;
  return { hit, rounds, next, number: next === "lt" ? 7 : oddNumber(rand), promote: false };
}

/** RUSH の図柄。7 は LT 専用にとっておく */
function oddNumber(rand: Rand): number {
  return [1, 3, 5, 9][randInt(rand, 0, 3)];
}

function evenNumber(rand: Rand): number {
  return [2, 4, 6, 8][randInt(rand, 0, 3)];
}
