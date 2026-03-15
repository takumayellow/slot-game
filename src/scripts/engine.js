import { RULES, SYMBOLS } from "./config.js";

function pickWeightedSymbol() {
  const total = SYMBOLS.reduce((sum, symbol) => sum + symbol.weight, 0);
  let roll = Math.random() * total;

  for (const symbol of SYMBOLS) {
    roll -= symbol.weight;
    if (roll <= 0) {
      return symbol;
    }
  }

  return SYMBOLS[SYMBOLS.length - 1];
}

function evaluate(reels, bet) {
  const allEqual = reels.every((entry) => entry.key === reels[0].key);
  if (allEqual) {
    const amount = reels[0].payout * bet;
    return {
      win: amount,
      reason: `${reels[0].name}3つ揃い`,
    };
  }

  const cherryCount = reels.filter((entry) => entry.key === "CHERRY").length;
  if (cherryCount >= 2) {
    const amount = RULES.cherryPairMultiplier * bet;
    return {
      win: amount,
      reason: "チェリー2個",
    };
  }

  return {
    win: 0,
    reason: "はずれ",
  };
}

// Win streak multipliers: streak count → payout multiplier
// streak 2: ×1.5, streak 3: ×2, streak 5+: ×3
function streakMultiplier(streak) {
  if (streak >= 5) return 3.0;
  if (streak >= 3) return 2.0;
  if (streak >= 2) return 1.5;
  return 1.0;
}

export class SlotEngine {
  constructor() {
    this.credit = RULES.startingCredit;
    this.bet = RULES.minBet;
    this.lastWin = 0;
    this.winStreak = 0;      // consecutive winning spins
    this.lastMultiplier = 1; // multiplier applied on the last spin
  }

  canSpin() {
    return this.credit >= this.bet;
  }

  increaseBet() {
    this.bet = Math.min(this.bet + 1, RULES.maxBet);
    return this.bet;
  }

  decreaseBet() {
    this.bet = Math.max(this.bet - 1, RULES.minBet);
    return this.bet;
  }

  reset() {
    this.credit = RULES.startingCredit;
    this.bet = RULES.minBet;
    this.lastWin = 0;
    this.winStreak = 0;
    this.lastMultiplier = 1;
  }

  spin() {
    if (!this.canSpin()) {
      return {
        success: false,
        error: "クレジット不足です．",
      };
    }

    this.credit -= this.bet;

    const reels = [pickWeightedSymbol(), pickWeightedSymbol(), pickWeightedSymbol()];
    const baseResult = evaluate(reels, this.bet);

    let finalWin = baseResult.win;
    let multiplier = 1;

    if (baseResult.win > 0) {
      // Apply streak multiplier from current streak BEFORE incrementing
      multiplier = streakMultiplier(this.winStreak);
      finalWin = Math.round(baseResult.win * multiplier);
      this.winStreak += 1;
    } else {
      this.winStreak = 0;
    }

    this.credit += finalWin;
    this.lastWin = finalWin;
    this.lastMultiplier = multiplier;

    return {
      success: true,
      reels,
      win: finalWin,
      baseWin: baseResult.win,
      reason: baseResult.reason,
      credit: this.credit,
      bet: this.bet,
      lastWin: this.lastWin,
      winStreak: this.winStreak,
      multiplier,
    };
  }

  // Returns the multiplier that would apply on the NEXT win.
  getStreakMultiplier() {
    return streakMultiplier(this.winStreak);
  }
}

export { SYMBOLS, RULES };
