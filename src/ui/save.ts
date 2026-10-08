import type { HitRecord, Machine } from "../game/machine";
import { SPEC, isStMode, type Mode } from "../game/spec";

/** 持ち玉・投資・大当たり履歴をブラウザに残す（同じ端末で続きから遊べる） */

const KEY = "tsumugi-pachinko:v3";
const MODES: readonly Mode[] = ["normal", "jitan", "rush", "lt"];
const MAX_SLUMP = 400;

export interface SaveData {
  balls: number;
  invested: number;
  mode: Mode;
  spinsLeft: number;
  totalSpins: number;
  spinsSinceHit: number;
  hits: HitRecord[];
  chain: number;
  maxChain: number;
  /** 収支 [円] の推移 */
  slump: number[];
}

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1e9;

function isHit(h: unknown): h is HitRecord {
  if (typeof h !== "object" || h === null) return false;
  const r = h as Record<string, unknown>;
  return isCount(r.spins) && isCount(r.rounds) && isCount(r.payout) && MODES.includes(r.next as Mode);
}

/** 壊れた値・書き換えられた値は捨てて最初から始める */
export function parseSave(raw: string | null): SaveData | null {
  if (!raw) return null;
  let d: unknown;
  try {
    d = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof d !== "object" || d === null) return null;
  const r = d as Record<string, unknown>;
  const counts = ["balls", "invested", "spinsLeft", "totalSpins", "spinsSinceHit", "chain", "maxChain"] as const;
  if (!counts.every((k) => isCount(r[k]))) return null;
  if (!MODES.includes(r.mode as Mode)) return null;
  if (!Array.isArray(r.hits) || !r.hits.every(isHit)) return null;
  if (!Array.isArray(r.slump) || !r.slump.every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  return {
    balls: r.balls as number,
    invested: r.invested as number,
    mode: r.mode as Mode,
    spinsLeft: r.spinsLeft as number,
    totalSpins: r.totalSpins as number,
    spinsSinceHit: r.spinsSinceHit as number,
    hits: (r.hits as HitRecord[]).slice(-500),
    chain: r.chain as number,
    maxChain: r.maxChain as number,
    slump: (r.slump as number[]).slice(-MAX_SLUMP),
  };
}

export function loadSave(): SaveData | null {
  try {
    return parseSave(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function writeSave(m: Machine, slump: readonly number[]): void {
  // 大当たり中に閉じたら、当たりは消化済みとして次のモードの頭から再開する
  const next = m.jackpot?.result.next;
  const data: SaveData = {
    balls: m.balls,
    invested: m.invested,
    mode: next ?? m.mode,
    spinsLeft: next ? (isStMode(next) ? SPEC.stSpins : SPEC.jitanSpins) : m.spinsLeft,
    totalSpins: m.stats.totalSpins,
    spinsSinceHit: m.stats.spinsSinceHit,
    hits: m.stats.hits.slice(-500),
    // 連チャン数は大当たりの終わりに数えるので、消化済みとして先に足しておく
    chain: next ? (isStMode(next) ? m.stats.chain + 1 : 0) : m.stats.chain,
    maxChain: next && isStMode(next) ? Math.max(m.stats.maxChain, m.stats.chain + 1) : m.stats.maxChain,
    slump: slump.slice(-MAX_SLUMP),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 保存できなくても遊べる
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 何もしない
  }
}

/** 保存データを台に戻す */
export function applySave(m: Machine, d: SaveData): void {
  m.balls = d.balls;
  m.invested = d.invested;
  m.mode = d.mode;
  m.spinsLeft = d.mode === "normal" ? 0 : Math.max(1, d.spinsLeft);
  m.stats = {
    totalSpins: d.totalSpins,
    spinsSinceHit: d.spinsSinceHit,
    hits: [...d.hits],
    chain: d.chain,
    maxChain: d.maxChain,
  };
}

/** スランプグラフの点を足す。多すぎたら間引く */
export function pushSlump(slump: readonly number[], v: number): number[] {
  const next = [...slump, v];
  if (next.length <= MAX_SLUMP) return next;
  return next.filter((_, i) => i % 2 === 0 || i === next.length - 1);
}
