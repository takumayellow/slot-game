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
      reason: `${reels[0].name} x3!`,
    };
  }

  const cherryCount = reels.filter((entry) => entry.key === "CHERRY").length;
  if (cherryCount >= 2) {
    const amount = RULES.cherryPairMultiplier * bet;
    return {
      win: amount,
      reason: "Cherry Pair!",
    };
  }

  return {
    win: 0,
    reason: "No Win",
  };
}

export class SlotEngine {
  constructor() {
    this.credit = RULES.startingCredit;
    this.bet = RULES.minBet;
    this.lastWin = 0;
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
    const result = evaluate(reels, this.bet);

    this.credit += result.win;
    this.lastWin = result.win;

    return {
      success: true,
      reels,
      win: result.win,
      reason: result.reason,
      credit: this.credit,
      bet: this.bet,
      lastWin: this.lastWin,
    };
  }
}

export { SYMBOLS, RULES };
