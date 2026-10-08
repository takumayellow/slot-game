/**
 * 機種のスペック。実機の「ライトミドルの ST 機」を下敷きにした架空の台。
 * 数値はすべてここに集め、ロジックと演出からはここを読む。
 */

export type Mode = "normal" | "jitan" | "rush" | "lt";

export const MODE_LABEL: Record<Mode, string> = {
  normal: "通常",
  jitan: "チャンスタイム",
  rush: "つむぎRUSH",
  lt: "極・つむぎRUSH",
};

export const SPEC = {
  /** 大当たり確率（低確率 = 通常・時短） */
  lowProb: 1 / 99.9,
  /** 大当たり確率（ST 中） */
  stProb: 1 / 39.9,
  /** ST の回数（RUSH・LT とも）。継続率は 1 - (1 - 1/39.9)^40 ≒ 64% */
  stSpins: 40,
  /** ヘソの通常当たり後の時短回数（引き戻し率 ≒ 26%） */
  jitanSpins: 30,

  /** ヘソ当たりで RUSH に入る割合（残りは通常当たり + 時短） */
  hesoRushRate: 0.5,
  /** ヘソ当たりのラウンド数 */
  hesoRounds: 3,
  /** 電チュー当たりの 10R 割合（残りは 5R） */
  denchu10RRate: 0.3,
  /** RUSH 中の電チュー当たりで LT に昇格する割合 */
  ltRate: 0.02,

  /** 保留の上限（特図1・特図2・普図とも） */
  maxHold: 4,

  /** 賞球 */
  payout: { heso: 1, denchu: 1, attacker: 10, pocket: 3 },

  /** 1 ラウンドのカウント数と最長開放時間 [s] */
  roundCount: 10,
  roundMaxOpen: 25,
  /** ラウンド間のインターバル・オープニング・エンディング [s] */
  roundInterval: 1.6,
  opening: 4.5,
  ending: 5.5,

  /** 普図: 低確（電サポなし）と電サポ中 */
  futo: {
    lowProb: 1 / 12,
    lowSpin: 12,
    lowOpen: [0.15],
    supportProb: 255 / 256,
    supportSpin: 0.8,
    supportOpen: [1.4, 1.4, 1.4],
    openGap: 0.5,
  },

  /** 玉貸し: 500 円で 125 玉（4 円パチンコ） */
  rent: { yen: 500, balls: 125 },
} as const;

export function isStMode(mode: Mode): boolean {
  return mode === "rush" || mode === "lt";
}

/** 電サポ（電チューが頻繁に開く状態）があるか */
export function hasSupport(mode: Mode): boolean {
  return mode !== "normal";
}

export function hitProb(mode: Mode): number {
  return isStMode(mode) ? SPEC.stProb : SPEC.lowProb;
}
