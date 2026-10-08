import { describe, expect, it } from "vitest";
import { judge, makeHold, type Hold } from "../src/game/lottery";
import { Machine, type MachineEvent } from "../src/game/machine";
import { mulberry32 } from "../src/game/rng";
import { buildScenario, type ScenarioKind } from "../src/game/scenario";
import { SPEC, type Mode } from "../src/game/spec";

function holdWith(kind: 1 | 2, r: number, sub: number, ltRoll = 0.5): Hold {
  return { kind, r, sub, ltRoll, color: "white" };
}

describe("lottery", () => {
  it("当選確率はモードの確率どおり", () => {
    const rand = mulberry32(1);
    const N = 400_000;
    for (const [mode, p] of [
      ["normal", SPEC.lowProb],
      ["rush", SPEC.stProb],
    ] as [Mode, number][]) {
      let hits = 0;
      for (let i = 0; i < N; i++) if (judge(makeHold(1, mode, rand), mode, rand).hit) hits++;
      const sd = Math.sqrt(N * p * (1 - p));
      expect(Math.abs(hits - N * p)).toBeLessThan(4 * sd);
    }
  });

  it("ヘソ当たりは 3R、半分が RUSH、残りは時短", () => {
    const rand = mulberry32(2);
    const rush = judge(holdWith(1, 0, 0.2), "normal", rand);
    const jitan = judge(holdWith(1, 0, 0.8), "normal", rand);
    expect(rush).toMatchObject({ hit: true, rounds: 3, next: "rush" });
    expect(jitan).toMatchObject({ hit: true, rounds: 3, next: "jitan" });
    expect(jitan.number % 2).toBe(0);
  });

  it("電チュー当たりは 10R が 3 割、LT は 2%、LT 中は 10R で LT 継続", () => {
    const rand = mulberry32(3);
    expect(judge(holdWith(2, 0, 0.1), "rush", rand).rounds).toBe(10);
    expect(judge(holdWith(2, 0, 0.9), "rush", rand)).toMatchObject({ rounds: 5, next: "rush" });
    expect(judge(holdWith(2, 0, 0.9, 0.01), "rush", rand)).toMatchObject({ rounds: 10, next: "lt", number: 7 });
    expect(judge(holdWith(2, 0, 0.9, 0.9), "lt", rand)).toMatchObject({ rounds: 10, next: "lt" });
  });

  it("RUSH 図柄に 7 は出ない（7 は LT 専用）", () => {
    const rand = mulberry32(4);
    for (let i = 0; i < 2000; i++) {
      const r = judge(holdWith(2, 0, rand(), 0.9), "rush", rand);
      expect(r.number).not.toBe(7);
      expect(r.number % 2).toBe(1);
    }
  });

  it("低確で当たる乱数は ST でも当たる（先読みと結果が食い違わない）", () => {
    const rand = mulberry32(5);
    const h = holdWith(1, SPEC.lowProb * 0.99, 0.1);
    expect(judge(h, "normal", rand).hit).toBe(true);
    expect(judge(h, "rush", rand).hit).toBe(true);
  });
});

describe("scenario", () => {
  it("当たりは 3 つ揃い、ハズレは揃わない。リーチなしは左右も揃わない", () => {
    const rand = mulberry32(6);
    for (let i = 0; i < 5000; i++) {
      const mode: Mode = rand() < 0.5 ? "normal" : "rush";
      const hold = makeHold(1, mode, rand);
      const result = judge(hold, mode, rand);
      const s = buildScenario(result, mode, Math.floor(rand() * 4), hold.color, rand);
      const [l, c, r] = s.final;
      if (s.hit) expect(l === c && c === r).toBe(true);
      else expect(l === c && c === r).toBe(false);
      if (!s.hit && s.kind === "hazure") expect(l).not.toBe(r);
      if (!s.hit && s.kind !== "hazure") expect(l).toBe(r);
      // 中リールが最後に止まり、変動はその後に終わる
      expect(s.stops[1]).toBeGreaterThanOrEqual(Math.max(s.stops[0], s.stops[2]));
      expect(s.duration).toBeGreaterThan(s.stops[1]);
    }
  });

  it("信頼度は リーチ < SP < SPSP の順に上がる", () => {
    const rand = mulberry32(7);
    const seen: Record<ScenarioKind, [number, number]> = {
      hazure: [0, 0],
      reach: [0, 0],
      sp: [0, 0],
      spsp: [0, 0],
      zenkaiten: [0, 0],
      sudden: [0, 0],
    };
    for (let i = 0; i < 300_000; i++) {
      const hold = makeHold(1, "normal", rand);
      const result = judge(hold, "normal", rand);
      const s = buildScenario(result, "normal", 1, hold.color, rand);
      seen[s.kind][result.hit ? 0 : 1]++;
    }
    const rate = (k: ScenarioKind) => seen[k][0] / (seen[k][0] + seen[k][1]);
    expect(rate("reach")).toBeLessThan(rate("sp"));
    expect(rate("sp")).toBeLessThan(rate("spsp"));
    expect(rate("zenkaiten")).toBe(1);
    expect(seen.hazure[0]).toBe(0);
  });
});

describe("machine", () => {
  /** 当たるまでヘソに入れ続け、大当たりを最後まで消化する */
  function playUntilJackpotEnds(m: Machine, attackerPerRound: number = SPEC.roundCount): MachineEvent[] {
    const all: MachineEvent[] = [];
    for (let t = 0; t < 20_000; t += 0.05) {
      if (!m.jackpot && m.holds1.length < 2) m.input("heso");
      if (m.gimmicks.attacker && attackerPerRound > 0) for (let i = 0; i < attackerPerRound; i++) m.input("attacker");
      const ev = m.update(0.05);
      all.push(...ev);
      if (ev.some((e) => e.type === "jackpot-end")) return all;
    }
    throw new Error("jackpot never ended");
  }

  it("ヘソ入賞 → 変動 → 大当たり → ラウンド消化 → モード移行", () => {
    const m = new Machine(mulberry32(8));
    const ev = playUntilJackpotEnds(m);
    const start = ev.find((e) => e.type === "jackpot-start");
    const end = ev.find((e) => e.type === "jackpot-end");
    expect(start && end).toBeTruthy();
    if (start?.type !== "jackpot-start" || end?.type !== "jackpot-end") return;
    const rounds = ev.filter((e) => e.type === "round-start").length;
    expect(rounds).toBe(start.result.rounds);
    expect(end.payout).toBe(rounds * SPEC.roundCount * SPEC.payout.attacker);
    expect(m.mode).toBe(start.result.next);
    expect(m.spinsLeft).toBe(m.mode === "jitan" ? SPEC.jitanSpins : SPEC.stSpins);
    expect(m.stats.hits).toHaveLength(1);
  });

  it("アタッカーに入らないラウンドは最長開放時間で閉じる", () => {
    const m = new Machine(mulberry32(9));
    const ev = playUntilJackpotEnds(m, 0);
    const ends = ev.filter((e) => e.type === "round-end");
    expect(ends.length).toBeGreaterThan(0);
    for (const e of ends) if (e.type === "round-end") expect(e.count).toBe(0);
  });

  it("保留は 4 個まで", () => {
    const m = new Machine(mulberry32(10));
    for (let i = 0; i < 10; i++) m.input("heso");
    expect(m.holds1).toHaveLength(SPEC.maxHold);
    expect(m.balls).toBe(10 * SPEC.payout.heso);
  });

  it("電サポ中はゲート通過で電チューが開き、ST は 50 回で終わる", () => {
    const m = new Machine(mulberry32(11));
    m.mode = "rush";
    m.spinsLeft = SPEC.stSpins;
    m.input("gate");
    const opened: boolean[] = [];
    for (let t = 0; t < 8; t += 0.02) for (const e of m.update(0.02)) if (e.type === "denchu") opened.push(e.open);
    expect(opened[0]).toBe(true);
    expect(opened[opened.length - 1]).toBe(false);
    expect(opened.filter((o) => o)).toHaveLength(SPEC.futo.supportOpen.length);

    // 特図2 をハズレ固定で 50 回消化させると通常に戻る
    const miss = new Machine(() => 0.999);
    miss.mode = "rush";
    miss.spinsLeft = SPEC.stSpins;
    let spins = 0;
    for (let t = 0; t < 2000 && miss.mode === "rush"; t += 0.05) {
      if (miss.holds2.length < 1) miss.input("denchu");
      for (const e of miss.update(0.05)) if (e.type === "spin-end") spins++;
    }
    expect(miss.mode).toBe("normal");
    expect(spins).toBe(SPEC.stSpins);
  });

  it("特図2 を優先して消化する", () => {
    const m = new Machine(mulberry32(12));
    m.input("heso");
    m.input("denchu");
    const ev = m.update(0.01);
    const start = ev.find((e) => e.type === "spin-start");
    expect(start?.type === "spin-start" && start.kind).toBe(2);
  });

  it("PUSH は受付中だけ効く", () => {
    const m = new Machine(mulberry32(13));
    expect(m.push()).toBe(false);
  });

  it("玉貸しと発射", () => {
    const m = new Machine(mulberry32(14));
    expect(m.useBall()).toBe(false);
    m.rent();
    expect(m.balls).toBe(SPEC.rent.balls);
    expect(m.invested).toBe(SPEC.rent.yen);
    expect(m.useBall()).toBe(true);
    expect(m.balls).toBe(SPEC.rent.balls - 1);
  });
});
