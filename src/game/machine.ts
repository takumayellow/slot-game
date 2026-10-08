import { judge, makeHold, type DrawResult, type Hold, type HoldColor } from "./lottery";
import { buildScenario, type Scenario } from "./scenario";
import { hasSupport, isStMode, SPEC, type Mode } from "./spec";
import type { Rand } from "./rng";

/**
 * 台の制御（主基板 + 演出の進行）。物理からの入賞を受け取り、保留・変動・大当たり・
 * 電サポ・普図を進め、描画と音のためのイベントを出す。
 */

export type InputKind = "heso" | "denchu" | "attacker" | "pocket" | "gate";

export type Cue =
  | "reel-stop-l"
  | "reel-stop-r"
  | "reel-stop-c"
  | "reach"
  | "sp"
  | "spsp"
  | "cutin"
  | "pseudo"
  | "push-ready"
  | "sudden"
  | "zenkaiten";

export type MachineEvent =
  | { type: "payout"; n: number; source: InputKind }
  | { type: "hold"; kind: 1 | 2; color: HoldColor }
  | { type: "spin-start"; scenario: Scenario; kind: 1 | 2; color: HoldColor }
  | { type: "cue"; cue: Cue; scenario: Scenario }
  | { type: "push"; scenario: Scenario }
  | { type: "spin-end"; scenario: Scenario; result: DrawResult }
  | { type: "jackpot-start"; result: DrawResult }
  | { type: "round-start"; round: number; total: number }
  | { type: "round-end"; round: number; count: number }
  | { type: "jackpot-end"; result: DrawResult; payout: number }
  | { type: "mode"; mode: Mode; from: Mode }
  | { type: "futo"; hit: boolean }
  | { type: "denchu"; open: boolean }
  | { type: "attacker"; open: boolean };

export interface Spin {
  hold: Hold;
  result: DrawResult;
  scenario: Scenario;
  /** 変動を始めたときのモード（演出はこれで決める） */
  mode: Mode;
  t: number;
  pushed: boolean;
  cues: { t: number; cue: Cue }[];
  cueIdx: number;
}

export type JackpotPhase = "opening" | "open" | "interval" | "ending";

export interface Jackpot {
  result: DrawResult;
  phase: JackpotPhase;
  t: number;
  round: number;
  count: number;
  payout: number;
}

export interface HitRecord {
  /** 前回の当たりから何回転目か */
  spins: number;
  rounds: number;
  next: Mode;
  payout: number;
}

export interface Stats {
  totalSpins: number;
  spinsSinceHit: number;
  hits: HitRecord[];
  /** 今回の RUSH・LT で何連しているか */
  chain: number;
  maxChain: number;
}

/** 停止表示の時間。変動が止まってから次の変動まで */
const STOP_DISPLAY = 0.6;
const STOP_DISPLAY_FAST = 0.35;

const SPIN_CUES: { cue: Cue; at: (s: Scenario) => number | undefined }[] = [
  { cue: "reel-stop-l", at: (s) => s.stops[0] },
  { cue: "reel-stop-r", at: (s) => s.stops[2] },
  { cue: "reach", at: (s) => s.reachAt },
  { cue: "cutin", at: (s) => s.cutinAt },
  { cue: "sp", at: (s) => s.spAt },
  { cue: "spsp", at: (s) => s.spspAt },
  { cue: "push-ready", at: (s) => s.pushAt },
  { cue: "sudden", at: (s) => (s.kind === "sudden" ? 0.5 : undefined) },
  { cue: "zenkaiten", at: (s) => (s.kind === "zenkaiten" ? 0.3 : undefined) },
  { cue: "reel-stop-c", at: (s) => s.stops[1] },
];

function cueTimeline(s: Scenario): { t: number; cue: Cue }[] {
  const list: { t: number; cue: Cue }[] = s.pseudo.map((t) => ({ t, cue: "pseudo" as Cue }));
  for (const c of SPIN_CUES) {
    const t = c.at(s);
    if (t !== undefined) list.push({ t, cue: c.cue });
  }
  return list.sort((a, b) => a.t - b.t);
}

export class Machine {
  mode: Mode = "normal";
  /** ST・時短の残り回数 */
  spinsLeft = 0;
  holds1: Hold[] = [];
  holds2: Hold[] = [];
  spin: Spin | null = null;
  jackpot: Jackpot | null = null;
  balls = 0;
  /** 投資額 [円] */
  invested = 0;
  stats: Stats = { totalSpins: 0, spinsSinceHit: 0, hits: [], chain: 0, maxChain: 0 };

  private stopWait = 0;
  private futoHolds = 0;
  private futoT = 0;
  private futoSpinning = false;
  private openPlan: number[] = [];
  private openT = 0;
  private denchuOpen = false;
  private events: MachineEvent[] = [];
  private readonly rand: Rand;

  constructor(rand: Rand) {
    this.rand = rand;
  }

  get gimmicks(): { denchu: boolean; attacker: boolean } {
    return { denchu: this.denchuOpen, attacker: this.jackpot?.phase === "open" };
  }

  /** 右打ちを促すか（電サポ中・大当たり中） */
  get rightShoot(): boolean {
    return this.jackpot !== null || hasSupport(this.mode);
  }

  rent(): void {
    this.balls += SPEC.rent.balls;
    this.invested += SPEC.rent.yen;
  }

  /** 1 発打つ。玉が無ければ false */
  useBall(): boolean {
    if (this.balls <= 0) return false;
    this.balls--;
    return true;
  }

  /** 発射通路から戻ってきた玉（ファール）を上皿に返す */
  returnBall(): void {
    this.balls++;
  }

  /** 普図が変動中か（主基板の表示用） */
  get futoBusy(): boolean {
    return this.futoSpinning;
  }

  input(kind: InputKind): void {
    switch (kind) {
      case "heso":
        this.pay(SPEC.payout.heso, kind);
        this.addHold(1);
        break;
      case "denchu":
        this.pay(SPEC.payout.denchu, kind);
        this.addHold(2);
        break;
      case "attacker":
        this.pay(SPEC.payout.attacker, kind);
        if (this.jackpot) this.jackpot.payout += SPEC.payout.attacker;
        if (this.jackpot?.phase === "open") this.jackpot.count++;
        break;
      case "pocket":
        this.pay(SPEC.payout.pocket, kind);
        break;
      case "gate":
        if (this.futoHolds < SPEC.maxHold) this.futoHolds++;
        break;
    }
  }

  /** PUSH ボタン。受付中なら演出を前倒しで出す */
  push(): boolean {
    const s = this.spin;
    if (!s || s.pushed || s.scenario.pushAt === undefined) return false;
    if (s.t < s.scenario.pushAt || s.t >= s.scenario.stops[1]) return false;
    s.pushed = true;
    this.events.push({ type: "push", scenario: s.scenario });
    return true;
  }

  update(dt: number): MachineEvent[] {
    this.updateFuto(dt);
    if (this.jackpot) this.updateJackpot(dt);
    else this.updateSpin(dt);
    const out = this.events;
    this.events = [];
    return out;
  }

  private pay(n: number, source: InputKind): void {
    this.balls += n;
    this.events.push({ type: "payout", n, source });
  }

  private addHold(kind: 1 | 2): void {
    const list = kind === 1 ? this.holds1 : this.holds2;
    if (list.length >= SPEC.maxHold) return;
    const hold = makeHold(kind, this.mode, this.rand);
    list.push(hold);
    this.events.push({ type: "hold", kind, color: hold.color });
  }

  private updateSpin(dt: number): void {
    if (this.stopWait > 0) {
      this.stopWait -= dt;
      return;
    }
    if (!this.spin) {
      // 電チュー側（特図2）を優先して消化する
      const hold = this.holds2.shift() ?? this.holds1.shift();
      if (!hold) return;
      this.startSpin(hold);
      return;
    }
    const s = this.spin;
    s.t += dt;
    while (s.cueIdx < s.cues.length && s.t >= s.cues[s.cueIdx].t) {
      this.events.push({ type: "cue", cue: s.cues[s.cueIdx++].cue, scenario: s.scenario });
    }
    if (s.t >= s.scenario.duration) this.endSpin(s);
  }

  private startSpin(hold: Hold): void {
    const result = judge(hold, this.mode, this.rand);
    const holdsLeft = hold.kind === 1 ? this.holds1.length : this.holds2.length;
    const scenario = buildScenario(result, this.mode, holdsLeft, hold.color, this.rand);
    this.spin = {
      hold,
      result,
      scenario,
      mode: this.mode,
      t: 0,
      pushed: false,
      cues: cueTimeline(scenario),
      cueIdx: 0,
    };
    this.stats.totalSpins++;
    this.stats.spinsSinceHit++;
    this.events.push({ type: "spin-start", scenario, kind: hold.kind, color: hold.color });
  }

  private endSpin(s: Spin): void {
    this.spin = null;
    this.events.push({ type: "spin-end", scenario: s.scenario, result: s.result });
    this.stopWait = s.scenario.fast ? STOP_DISPLAY_FAST : STOP_DISPLAY;
    if (s.result.hit) {
      this.startJackpot(s.result);
      return;
    }
    if (this.mode !== "normal") {
      this.spinsLeft--;
      if (this.spinsLeft <= 0) this.setMode("normal");
    }
  }

  private startJackpot(result: DrawResult): void {
    this.jackpot = { result, phase: "opening", t: 0, round: 0, count: 0, payout: 0 };
    // 大当たり中は電サポを切る（電チューが開くとアタッカーへ行く玉を取られる）
    this.openPlan = [];
    this.setDenchu(false);
    this.events.push({ type: "jackpot-start", result });
  }

  private updateJackpot(dt: number): void {
    const j = this.jackpot!;
    j.t += dt;
    switch (j.phase) {
      case "opening":
        if (j.t >= SPEC.opening) this.openRound(j);
        break;
      case "open":
        if (j.count >= SPEC.roundCount || j.t >= SPEC.roundMaxOpen) {
          this.events.push({ type: "round-end", round: j.round, count: j.count });
          this.events.push({ type: "attacker", open: false });
          j.phase = j.round >= j.result.rounds ? "ending" : "interval";
          j.t = 0;
        }
        break;
      case "interval":
        if (j.t >= SPEC.roundInterval) this.openRound(j);
        break;
      case "ending":
        if (j.t >= SPEC.ending) this.finishJackpot(j);
        break;
    }
  }

  private openRound(j: Jackpot): void {
    j.round++;
    j.count = 0;
    j.t = 0;
    j.phase = "open";
    this.events.push({ type: "round-start", round: j.round, total: j.result.rounds });
    this.events.push({ type: "attacker", open: true });
  }

  private finishJackpot(j: Jackpot): void {
    this.jackpot = null;
    const r = j.result;
    this.stats.hits.push({ spins: this.stats.spinsSinceHit, rounds: r.rounds, next: r.next, payout: j.payout });
    this.stats.spinsSinceHit = 0;
    this.stats.chain = isStMode(r.next) ? this.stats.chain + 1 : 0;
    this.stats.maxChain = Math.max(this.stats.maxChain, this.stats.chain);
    this.events.push({ type: "jackpot-end", result: r, payout: j.payout });
    this.setMode(r.next);
    this.spinsLeft = isStMode(r.next) ? SPEC.stSpins : SPEC.jitanSpins;
  }

  private setMode(mode: Mode): void {
    const from = this.mode;
    this.mode = mode;
    if (mode === "normal") {
      this.spinsLeft = 0;
      this.stats.chain = 0;
    }
    this.events.push({ type: "mode", mode, from });
  }

  private updateFuto(dt: number): void {
    // 大当たり中は普図を止める（電チューが開いてアタッカー狙いの玉を拾わないように）
    if (this.jackpot) return;
    const support = hasSupport(this.mode);
    if (this.openPlan.length > 0) {
      this.openT -= dt;
      if (this.openT <= 0) {
        // 開放と閉鎖を交互に進める。openPlan は [開, 閉, 開, 閉, ...] で、長さが偶数のとき先頭は「開」
        this.openPlan.shift();
        this.setDenchu(this.openPlan.length > 0 && this.openPlan.length % 2 === 0);
        if (this.openPlan.length > 0) this.openT = this.openPlan[0];
      }
      return;
    }
    if (this.futoSpinning) {
      this.futoT -= dt;
      if (this.futoT > 0) return;
      this.futoSpinning = false;
      const hit = this.rand() < (support ? SPEC.futo.supportProb : SPEC.futo.lowProb);
      this.events.push({ type: "futo", hit });
      if (hit) this.planOpen(support ? SPEC.futo.supportOpen : SPEC.futo.lowOpen);
      return;
    }
    if (this.futoHolds > 0) {
      this.futoHolds--;
      this.futoSpinning = true;
      this.futoT = support ? SPEC.futo.supportSpin : SPEC.futo.lowSpin;
    }
  }

  private planOpen(opens: readonly number[]): void {
    const plan: number[] = [];
    opens.forEach((o, i) => {
      plan.push(o);
      plan.push(i < opens.length - 1 ? SPEC.futo.openGap : 0.01);
    });
    this.openPlan = plan;
    this.openT = plan[0];
    this.setDenchu(true);
  }

  private setDenchu(open: boolean): void {
    if (this.denchuOpen === open) return;
    this.denchuOpen = open;
    this.events.push({ type: "denchu", open });
  }
}
