import "@fontsource/dela-gothic-one/index.css";
import "./style.css";
import { GameAudio } from "./audio/audio";
import type { Mood } from "./audio/bgm";
import { FONT_CHARS } from "./fontChars";
import { Machine, type InputKind, type MachineEvent } from "./game/machine";
import { isStMode } from "./game/spec";
import { PROMOTE_AT } from "./lcd/jackpotScene";
import { Lcd } from "./lcd/lcd";
import { drawBoardArt } from "./render/boardArt";
import { View, type LampName, type LedTheme } from "./render/view";
import { buildBoard } from "./sim/board";
import { PhysicsWorld, type PhysicsEvent } from "./sim/physics";
import { Hud, balance } from "./ui/hud";
import { applySave, clearSave, loadSave, pushSlump, writeSave } from "./ui/save";

/** 発射の間隔 [s]。実機は 1 分 100 発 */
const FIRE_INTERVAL = 0.6;
/** 右打ちの強さ */
const RIGHT = 0.86;
/** 右打ちとみなす強さ */
const RIGHT_FROM = 0.78;
const SLUMP_EVERY = 10;

async function loadPortrait(): Promise<HTMLImageElement | null> {
  const img = new Image();
  img.src = `${import.meta.env.BASE_URL}assets/tsumugi.webp`;
  try {
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

/** 看板と盤面の絵は一度しか描かないので、キャンバスを作る前にフォントを揃える */
async function loadFonts(): Promise<void> {
  const sample = `ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?/:%+-${FONT_CHARS}`;
  try {
    await Promise.race([
      document.fonts.load(`40px "Dela Gothic One"`, sample),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
  } catch {
    // 読めなくても代わりのフォントで動く
  }
}

/** ゲーム内の時刻で後から実行する（ボイスの間合い） */
class Timeline {
  private items: { at: number; fn: () => void }[] = [];
  add(at: number, fn: () => void): void {
    this.items.push({ at, fn });
  }
  clear(): void {
    this.items = [];
  }
  run(now: number): void {
    if (this.items.length === 0) return;
    const due = this.items.filter((i) => i.at <= now);
    this.items = this.items.filter((i) => i.at > now);
    due.forEach((i) => i.fn());
  }
}

async function boot(): Promise<void> {
  const [portrait] = await Promise.all([loadPortrait(), loadFonts()]);
  const layout = buildBoard();
  const world = new PhysicsWorld(layout);
  const m = new Machine(Math.random);
  const saved = loadSave();
  let slump: number[] = saved?.slump ?? [];
  if (saved) applySave(m, saved);

  const lcdScale = Math.min(window.innerWidth, window.innerHeight) < 700 ? 0.62 : 1;
  const lcd = new Lcd(portrait, lcdScale);
  const view = new View(document.getElementById("stage")!, layout, drawBoardArt(layout, portrait), lcd.canvas);
  const audio = new GameAudio();
  const later = new Timeline();

  let now = 0;
  let fireT = 0;
  let slumpT = 0;

  const hud = new Hud({
    start: () => {
      void audio.unlock().then(() => audio.voice("welcome"));
      // 初回は 500 円ぶん借りてから打ち始める
      if (m.balls === 0) m.rent();
    },
    rent: () => {
      void audio.unlock();
      m.rent();
      hud.toast(`玉貸 500 円 → ${m.balls.toLocaleString("ja-JP")} 玉`, now, 1.6);
    },
    push: () => {
      void audio.unlock();
      view.pressPush();
      m.push();
    },
    toggleSound: () => {
      audio.setMuted(!audio.isMuted);
      return !audio.isMuted;
    },
    toggleZoom: () => {
      view.setZoom(!view.zoomed);
      return view.zoomed;
    },
    reset: () => {
      clearSave();
      window.location.reload();
    },
  });
  if (saved) hud.toast(`続きから（持ち玉 ${m.balls.toLocaleString("ja-JP")} 玉）`, 0, 3);

  const strength = () => (hud.autoRight && m.rightShoot ? RIGHT : hud.handle);

  const onPhysics = (e: PhysicsEvent) => {
    switch (e.type) {
      case "sensor": {
        const kind = e.sensor.kind;
        if (kind === "out") return;
        if (kind !== "attacker") view.flashLamp(kind as LampName);
        if (kind === "warp") return;
        m.input(kind as InputKind);
        break;
      }
      case "foul":
        m.returnBall();
        break;
      case "nail":
        audio.nail(e.speed);
        break;
      case "stage-drop":
        break;
    }
  };

  const onMachine = (e: MachineEvent) => {
    lcd.onEvent(e);
    switch (e.type) {
      case "payout":
        if (e.source === "attacker") audio.attackerIn();
        else audio.payout(e.n);
        break;
      case "hold":
        audio.hold(e.color);
        break;
      case "cue":
        onCue(e.cue, e.scenario);
        break;
      case "push":
        audio.push();
        if (e.scenario.hit) {
          view.dropEmblem(now);
          audio.gimmick();
        }
        break;
      case "spin-end":
        if (e.result.hit) {
          audio.hit();
          view.kick(4);
          if (e.scenario.kind !== "sudden" && e.scenario.kind !== "zenkaiten") audio.voice("hit");
        } else if (e.scenario.kind !== "hazure") {
          audio.miss();
          audio.voice("miss");
        }
        break;
      case "jackpot-start":
        later.clear();
        if (m.mode === "normal") later.add(now + 2.7, () => audio.voice("rightShoot"));
        break;
      case "round-start":
        audio.round();
        if (e.round === 1) audio.voice("round");
        break;
      case "round-end": {
        const j = m.jackpot;
        if (!j || e.round < j.result.rounds) break;
        // エンディングの台詞（昇格は液晶が明かす瞬間に合わせる）
        const r = j.result;
        if (r.promote) {
          later.add(now + PROMOTE_AT, () => {
            audio.voice("promote");
            audio.rushIn();
            view.dropEmblem(now);
          });
        } else if (r.next === "lt") later.add(now + 0.6, () => (audio.voice("lt"), audio.rushIn()));
        else if (r.next === "rush") later.add(now + 0.6, () => (audio.voice(m.stats.chain > 0 ? "rushHit" : "rush"), audio.rushIn()));
        else later.add(now + 0.6, () => audio.voice("jitan"));
        break;
      }
      case "mode":
        if (e.mode === "normal") {
          if (isStMode(e.from)) {
            audio.voice("rushEnd");
            later.add(now + 2.6, () => audio.voice("leftShoot"));
          } else if (e.from === "jitan") audio.voice("leftShoot");
        }
        break;
      case "denchu":
        audio.denchu(e.open);
        break;
      default:
        break;
    }
  };

  const onCue = (cue: string, s: { cutin: "none" | "blue" | "red" | "gold"; hit: boolean; kind: string }) => {
    switch (cue) {
      case "reel-stop-l":
      case "reel-stop-r":
        audio.reelStop();
        break;
      case "reel-stop-c":
        audio.reelStop(true);
        break;
      case "reach":
        audio.reach();
        audio.voice("reach");
        break;
      case "pseudo":
        audio.pseudo();
        audio.voice("next");
        view.kick(1.5);
        break;
      case "cutin":
        if (s.cutin !== "none") {
          audio.cutin(s.cutin);
          audio.voice(s.cutin === "gold" ? "cutinGold" : s.cutin === "red" ? "cutinRed" : "cutinBlue");
        }
        break;
      case "sp":
        audio.voice("sp");
        // 当たりのときほど役物が落ちやすい
        if (Math.random() < (s.hit ? 0.45 : 0.08)) {
          view.dropEmblem(now);
          audio.gimmick();
        }
        break;
      case "spsp":
        audio.voice("spsp");
        view.kick(2);
        break;
      case "push-ready":
        audio.voice("push");
        break;
      case "sudden":
        audio.sudden();
        audio.voice("sudden");
        view.kick(6);
        break;
      case "zenkaiten":
        audio.voice("zenkaiten");
        view.dropEmblem(now);
        audio.gimmick();
        break;
      default:
        break;
    }
  };

  const ledTheme = (): LedTheme => {
    if (m.jackpot) return "jackpot";
    const sp = m.spin;
    if (sp) {
      const sc = sp.scenario;
      if (sc.spAt !== undefined && sp.t >= sc.spAt) return "sp";
      if (sc.reachAt !== undefined && sp.t >= sc.reachAt) return "reach";
    }
    return m.mode === "normal" ? "normal" : m.mode === "jitan" ? "jitan" : m.mode;
  };

  const mood = (): Mood => {
    if (m.jackpot) return "jackpot";
    const sp = m.spin;
    if (sp?.scenario.spAt !== undefined && sp.t >= sp.scenario.spAt) return "reach";
    return m.mode === "normal" ? "normal" : m.mode === "jitan" ? "chance" : m.mode;
  };

  let last = performance.now();
  let saveT = 0;
  const frame = (t: number) => {
    const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
    last = t;
    now += dt;

    if (hud.firing) {
      fireT += dt;
      if (fireT >= FIRE_INTERVAL) {
        fireT -= FIRE_INTERVAL;
        if (m.useBall()) {
          world.launch(strength());
          audio.launch();
        } else {
          hud.setFiring(false);
          hud.toast("玉がありません。玉貸（B）で 125 玉借りられます", now, 3.5);
        }
      }
    } else fireT = Math.min(fireT, FIRE_INTERVAL);

    world.gimmicks = m.gimmicks;
    for (const e of world.advance(dt)) onPhysics(e);
    // PUSH は押さなくても止まる直前に自動で出る
    const sp = m.spin;
    if (sp?.scenario.pushAt !== undefined && !sp.pushed && sp.t >= Math.max(sp.scenario.pushAt, sp.scenario.stops[1] - 0.5)) m.push();
    for (const e of m.update(dt)) onMachine(e);
    later.run(now);
    audio.setMood(mood());

    const cur = m.spin;
    const pushReady = !!cur && !cur.pushed && cur.scenario.pushAt !== undefined && cur.t >= cur.scenario.pushAt;
    lcd.draw({
      now,
      mode: m.mode,
      spinsLeft: m.spinsLeft,
      spin: m.spin,
      jackpot: m.jackpot,
      holds1: m.holds1,
      holds2: m.holds2,
      rightShoot: m.rightShoot,
      aimRight: strength() >= RIGHT_FROM,
      firing: hud.firing,
      chain: m.stats.chain + (m.jackpot && isStMode(m.mode) ? 1 : 0),
    });
    view.update({
      now,
      dt,
      balls: world.visibleBalls(),
      windmillAngle: world.windmillAngle,
      denchuOpen: m.gimmicks.denchu,
      attackerOpen: m.gimmicks.attacker,
      theme: ledTheme(),
      handle: hud.firing ? strength() : 0,
      pushReady,
      trayBalls: m.balls,
      status: {
        holds1: m.holds1.length,
        holds2: m.holds2.length,
        mode: m.mode,
        spinning: !!m.spin,
        futoHit: m.futoBusy,
      },
    });
    view.render();

    slumpT += dt;
    if (slumpT >= SLUMP_EVERY && (hud.firing || m.jackpot)) {
      slumpT = 0;
      slump = pushSlump(slump, balance(m));
    }
    hud.update(m, now, pushReady, slump);
    saveT += dt;
    if (saveT >= 5) {
      saveT = 0;
      writeSave(m, slump);
    }
    requestAnimationFrame(frame);
  };
  window.addEventListener("pagehide", () => writeSave(m, slump));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) writeSave(m, slump);
  });
  requestAnimationFrame(frame);
}

void boot();
