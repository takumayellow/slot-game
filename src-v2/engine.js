/**
 * engine.js - V2 Pachislot Game Engine
 * Handles all game logic: reels, paylines, wins, bonuses, streak multipliers
 */

'use strict';

// ============================================================
// SYMBOLS
// Each symbol has: key, label (emoji), name, weight, payout
// ============================================================
const SYMBOLS = [
  { key: 'SEVEN',  label: '7',  name: '7',      weight: 3,  payout: 50  },
  { key: 'BAR',    label: 'BAR', name: 'BAR',   weight: 6,  payout: 20  },
  { key: 'BELL',   label: '🔔', name: 'ベル',   weight: 12, payout: 5   },
  { key: 'WATERMELON', label: '🍉', name: 'スイカ', weight: 14, payout: 10 },
  { key: 'CHERRY', label: '🍒', name: 'チェリー', weight: 20, payout: 2  },
  { key: 'GRAPE',  label: '🍇', name: 'ブドウ', weight: 22, payout: 3   },
  { key: 'LEMON',  label: '🍋', name: 'レモン', weight: 23, payout: 3   },
];

// Key lookup for fast access
const SYMBOL_MAP = Object.fromEntries(SYMBOLS.map(s => [s.key, s]));

// ============================================================
// RULES
// ============================================================
const RULES = {
  startingCredit: 100,
  minBet: 1,
  maxBet: 3,
  reelCount: 3,
  rowCount: 3,         // 3 visible rows per reel
  paylines: [
    // Each payline is an array of [reelIndex, rowIndex] positions
    // Payline 0: middle row (always active)
    [[0,1],[1,1],[2,1]],
    // Payline 1: top row
    [[0,0],[1,0],[2,0]],
    // Payline 2: bottom row
    [[0,2],[1,2],[2,2]],
    // Payline 3: diagonal top-left to bottom-right
    [[0,0],[1,1],[2,2]],
    // Payline 4: diagonal bottom-left to top-right
    [[0,2],[1,1],[2,0]],
  ],
  freeSpinTriggerKey: 'SEVEN',   // 3x SEVEN = jackpot free spins
  freeSpinCount: 15,
  cherryAnyPayout: 2,            // 1+ cherry anywhere = 2x bet
  // Streak multipliers
  streakThresholds: [
    { min: 5, mult: 3.0 },
    { min: 3, mult: 2.0 },
    { min: 2, mult: 1.5 },
  ],
};

// Reel strips - each reel has a strip of symbol keys
// Weighted by repeating symbols proportionally
function buildReelStrip() {
  const strip = [];
  for (const sym of SYMBOLS) {
    for (let i = 0; i < sym.weight; i++) {
      strip.push(sym.key);
    }
  }
  // Shuffle
  for (let i = strip.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [strip[i], strip[j]] = [strip[j], strip[i]];
  }
  return strip;
}

// ============================================================
// WEIGHTED RANDOM PICK
// ============================================================
function pickWeightedSymbol() {
  const total = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
  let roll = Math.random() * total;
  for (const sym of SYMBOLS) {
    roll -= sym.weight;
    if (roll <= 0) return sym;
  }
  return SYMBOLS[SYMBOLS.length - 1];
}

// Pick 3 symbols for one reel (the visible window: top, center, bottom)
function spinReel() {
  return [pickWeightedSymbol(), pickWeightedSymbol(), pickWeightedSymbol()];
}

// ============================================================
// STREAK MULTIPLIER
// ============================================================
function streakMultiplier(streak) {
  for (const { min, mult } of RULES.streakThresholds) {
    if (streak >= min) return mult;
  }
  return 1.0;
}

// ============================================================
// PAYLINE EVALUATION
// reelWindows: array of 3 arrays, each containing 3 symbols (rows 0,1,2)
// activePaylines: number of active paylines (1-5), based on bet
// bet: bet per payline
// ============================================================
function evaluatePaylines(reelWindows, activePaylines, betPerLine) {
  const wins = [];
  let totalWin = 0;
  let isJackpot = false;

  for (let pi = 0; pi < activePaylines; pi++) {
    const payline = RULES.paylines[pi];
    const symbols = payline.map(([r, row]) => reelWindows[r][row]);
    const keys = symbols.map(s => s.key);

    // Check all same
    if (keys[0] === keys[1] && keys[1] === keys[2]) {
      const sym = SYMBOL_MAP[keys[0]];
      const amount = sym.payout * betPerLine;
      totalWin += amount;
      wins.push({ paylineIndex: pi, symbols, key: keys[0], amount, type: 'match3' });
      if (keys[0] === RULES.freeSpinTriggerKey) {
        isJackpot = true;
      }
    } else {
      // Check cherry special: any cherry on this payline = small win
      const cherryCount = keys.filter(k => k === 'CHERRY').length;
      if (cherryCount >= 1 && pi === 0) { // Only on center payline for single cherry
        const amount = RULES.cherryAnyPayout * betPerLine;
        totalWin += amount;
        wins.push({ paylineIndex: pi, symbols, key: 'CHERRY', amount, type: 'cherry' });
      }
    }
  }

  return { wins, totalWin, isJackpot };
}

// ============================================================
// SLOT ENGINE CLASS
// ============================================================
class SlotEngine {
  constructor() {
    this.credit = RULES.startingCredit;
    this.bet = RULES.minBet;          // bet = number of lines (1-3 maps to 1-5 paylines)
    this.lastWin = 0;
    this.winStreak = 0;
    this.lastMultiplier = 1;
    this.isFreeSpinMode = false;
    this.freeSpinsLeft = 0;
    this.totalWon = 0;
    this.totalSpun = 0;
    this.biggestWin = 0;
    // Store last reel windows for display
    this.lastReelWindows = null;
    this.lastPaylineResult = null;
  }

  // Active paylines = bet count (1 bet = 1 line, 2 = 3 lines, 3 = 5 lines)
  getActivePaylines() {
    if (this.bet === 1) return 1;
    if (this.bet === 2) return 3;
    return 5;
  }

  getBetPerLine() {
    return 1; // always 1 credit per active payline
  }

  getTotalBetCost() {
    if (this.isFreeSpinMode) return 0;
    return this.getActivePaylines() * this.getBetPerLine();
  }

  canSpin() {
    return this.isFreeSpinMode || this.credit >= this.getTotalBetCost();
  }

  setBet(value) {
    this.bet = Math.max(RULES.minBet, Math.min(RULES.maxBet, value));
    return this.bet;
  }

  increaseBet() {
    return this.setBet(this.bet + 1);
  }

  decreaseBet() {
    return this.setBet(this.bet - 1);
  }

  setMaxBet() {
    return this.setBet(RULES.maxBet);
  }

  getStreakMultiplier() {
    return streakMultiplier(this.winStreak);
  }

  reset() {
    this.credit = RULES.startingCredit;
    this.bet = RULES.minBet;
    this.lastWin = 0;
    this.winStreak = 0;
    this.lastMultiplier = 1;
    this.isFreeSpinMode = false;
    this.freeSpinsLeft = 0;
    this.totalWon = 0;
    this.totalSpun = 0;
    this.biggestWin = 0;
    this.lastReelWindows = null;
    this.lastPaylineResult = null;
  }

  spin() {
    if (!this.canSpin()) {
      return { success: false, error: 'クレジット不足です。ベットを下げてください。' };
    }

    const isFree = this.isFreeSpinMode;
    const cost = this.getTotalBetCost();
    const activePaylines = this.getActivePaylines();
    const betPerLine = this.getBetPerLine();

    if (!isFree) {
      this.credit -= cost;
    }

    this.totalSpun++;

    // Spin all reels: each reel returns [topSymbol, midSymbol, bottomSymbol]
    const reelWindows = [spinReel(), spinReel(), spinReel()];
    this.lastReelWindows = reelWindows;

    // Evaluate paylines
    const { wins, totalWin: baseWin, isJackpot } = evaluatePaylines(reelWindows, activePaylines, betPerLine);
    this.lastPaylineResult = { wins, isJackpot };

    // Apply streak multiplier
    let multiplier = 1;
    let finalWin = baseWin;

    if (baseWin > 0) {
      multiplier = streakMultiplier(this.winStreak);
      finalWin = Math.round(baseWin * multiplier);
      this.winStreak++;
    } else {
      this.winStreak = 0;
    }

    this.credit += finalWin;
    this.lastWin = finalWin;
    this.lastMultiplier = multiplier;
    this.totalWon += finalWin;

    if (finalWin > this.biggestWin) this.biggestWin = finalWin;

    // Handle jackpot / free spin trigger
    let freeSpinTriggered = false;
    if (isJackpot && !isFree) {
      this.isFreeSpinMode = true;
      this.freeSpinsLeft = RULES.freeSpinCount;
      freeSpinTriggered = true;
    }

    // Decrement free spins
    if (isFree) {
      this.freeSpinsLeft = Math.max(0, this.freeSpinsLeft - 1);
      if (this.freeSpinsLeft === 0) {
        this.isFreeSpinMode = false;
      }
    }

    // Classify win level
    let winLevel = 'none';
    if (isJackpot) winLevel = 'jackpot';
    else if (finalWin >= cost * 20) winLevel = 'bigwin';
    else if (finalWin >= cost * 5) winLevel = 'win';
    else if (finalWin > 0) winLevel = 'small';

    return {
      success: true,
      reelWindows,
      wins,
      win: finalWin,
      baseWin,
      multiplier,
      winLevel,
      isJackpot,
      isFree,
      freeSpinTriggered,
      freeSpinsLeft: this.freeSpinsLeft,
      isFreeSpinMode: this.isFreeSpinMode,
      credit: this.credit,
      bet: this.bet,
      activePaylines,
      winStreak: this.winStreak,
      cost,
    };
  }
}

// Export for use in ui.js
window.SlotEngineV2 = SlotEngine;
window.SlotSymbolsV2 = SYMBOLS;
window.SlotRulesV2 = RULES;
