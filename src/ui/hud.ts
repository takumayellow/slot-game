import type { HitRecord, Machine } from "../game/machine";
import { MODE_LABEL, type Mode } from "../game/spec";

/** 画面の操作部とデータカウンタ */

export interface HudActions {
  start(): void;
  rent(): void;
  push(): void;
  toggleSound(): boolean;
  toggleZoom(): boolean;
  reset(): void;
}

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} がありません`);
  return el as T;
};

const yen = (n: number) => `${n < 0 ? "−" : n > 0 ? "+" : ""}${Math.abs(n).toLocaleString("ja-JP")} 円`;

const MODE_CLASS: Record<Mode, string> = { normal: "normal", jitan: "jitan", rush: "rush", lt: "lt" };

export class Hud {
  firing = false;
  autoRight = true;
  /** ハンドルの強さ 0.3..1 */
  handle = 0.55;

  private readonly fireBtn = $<HTMLButtonElement>("b-fire");
  private readonly handleInput = $<HTMLInputElement>("handle");
  private readonly handleVal = $("v-handle");
  private readonly pushBtn = $<HTMLButtonElement>("b-push");
  private readonly rentBtn = $<HTMLButtonElement>("b-rent");
  private readonly toastEl = $("toast");
  private readonly slump = $<HTMLCanvasElement>("slump");
  private readonly data = $("data");
  private toastUntil = 0;
  private resetArmedUntil = 0;
  private lastDataKey = "";
  private lastSlumpLen = -1;

  constructor(private readonly act: HudActions) {
    this.handle = Number(this.handleInput.value) / 100;
    this.bind();
  }

  private bind(): void {
    const startBtn = $<HTMLButtonElement>("b-start");
    startBtn.addEventListener("click", () => {
      $("start").hidden = true;
      this.act.start();
      this.setFiring(true);
    });
    this.fireBtn.addEventListener("click", () => this.setFiring(!this.firing));
    this.handleInput.addEventListener("input", () => this.setHandle(Number(this.handleInput.value) / 100));
    const auto = $<HTMLInputElement>("auto-right");
    auto.addEventListener("change", () => (this.autoRight = auto.checked));
    this.rentBtn.addEventListener("click", () => this.act.rent());
    this.pushBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.act.push();
    });
    const sound = $<HTMLButtonElement>("b-sound");
    sound.addEventListener("click", () => sound.setAttribute("aria-pressed", String(this.act.toggleSound())));
    const zoom = $<HTMLButtonElement>("b-zoom");
    zoom.addEventListener("click", () => zoom.setAttribute("aria-pressed", String(this.act.toggleZoom())));
    $("b-data").addEventListener("click", () => this.data.classList.toggle("open"));
    $("b-help").addEventListener("click", () => ($("help").hidden = false));
    $("b-help-close").addEventListener("click", () => ($("help").hidden = true));
    const reset = $<HTMLButtonElement>("b-reset");
    reset.addEventListener("click", () => {
      // 誤操作で消えないよう、2 回押して消す
      const now = performance.now();
      if (now < this.resetArmedUntil) {
        this.resetArmedUntil = 0;
        reset.textContent = "データを消す";
        this.act.reset();
        return;
      }
      this.resetArmedUntil = now + 3000;
      reset.textContent = "もう一度押すと消えます";
      window.setTimeout(() => {
        if (performance.now() >= this.resetArmedUntil) reset.textContent = "データを消す";
      }, 3100);
    });
    this.bindKeys(startBtn, sound, zoom);
  }

  private bindKeys(startBtn: HTMLButtonElement, sound: HTMLButtonElement, zoom: HTMLButtonElement): void {
    window.addEventListener("keydown", (e) => {
      if (e.repeat && e.code !== "ArrowLeft" && e.code !== "ArrowRight") return;
      if (!$("start").hidden) {
        if (e.code === "Enter" || e.code === "Space") {
          e.preventDefault();
          startBtn.click();
        }
        return;
      }
      switch (e.code) {
        case "Space":
          e.preventDefault();
          this.act.push();
          this.pushBtn.classList.add("pressed");
          break;
        case "KeyB":
          this.act.rent();
          break;
        case "Enter":
          this.setFiring(!this.firing);
          break;
        case "ArrowLeft":
          this.setHandle(this.handle - 0.01);
          break;
        case "ArrowRight":
          this.setHandle(this.handle + 0.01);
          break;
        case "KeyZ":
          zoom.click();
          break;
        case "KeyM":
          sound.click();
          break;
        case "KeyH":
          $("help").hidden = !$("help").hidden;
          break;
        default:
          break;
      }
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") this.pushBtn.classList.remove("pressed");
    });
  }

  setFiring(on: boolean): void {
    this.firing = on;
    this.fireBtn.setAttribute("aria-pressed", String(on));
    this.fireBtn.querySelector(".ico")!.textContent = on ? "■" : "▶";
    this.fireBtn.querySelector(".lbl")!.textContent = on ? "停止" : "発射";
  }

  private setHandle(v: number): void {
    this.handle = Math.min(1, Math.max(0.3, Math.round(v * 100) / 100));
    this.handleInput.value = String(Math.round(this.handle * 100));
    this.handleVal.textContent = String(Math.round(this.handle * 100));
  }

  toast(msg: string, now: number, secs = 2.6): void {
    this.toastEl.textContent = msg;
    this.toastEl.hidden = false;
    this.toastUntil = now + secs;
  }

  update(m: Machine, now: number, pushReady: boolean, slump: readonly number[]): void {
    if (!this.toastEl.hidden && now > this.toastUntil) this.toastEl.hidden = true;
    this.pushBtn.classList.toggle("ready", pushReady);
    this.rentBtn.classList.toggle("need", m.balls === 0);
    this.updateData(m);
    if (slump.length !== this.lastSlumpLen) {
      this.lastSlumpLen = slump.length;
      drawSlump(this.slump, slump);
    }
  }

  private updateData(m: Machine): void {
    const s = m.stats;
    const key = `${m.mode}|${m.spinsLeft}|${s.totalSpins}|${s.spinsSinceHit}|${s.hits.length}|${m.balls}|${m.invested}|${s.maxChain}`;
    if (key === this.lastDataKey) return;
    this.lastDataKey = key;
    const mode = $("d-mode");
    mode.textContent = MODE_LABEL[m.mode];
    mode.className = `mode-chip ${MODE_CLASS[m.mode]}`;
    $("d-left").textContent = m.mode === "normal" ? "" : `残り ${m.spinsLeft} 回`;
    $("d-hits").textContent = String(s.hits.length);
    $("d-spins").textContent = String(s.spinsSinceHit);
    $("d-total").textContent = s.totalSpins.toLocaleString("ja-JP");
    $("d-maxchain").textContent = `${s.maxChain} 連`;
    $("d-balls").textContent = m.balls.toLocaleString("ja-JP");
    $("d-invested").textContent = `${m.invested.toLocaleString("ja-JP")} 円`;
    const bal = balance(m);
    const balEl = $("d-balance");
    balEl.textContent = yen(bal);
    balEl.className = bal >= 0 ? "plus" : "minus";
    renderHistory($("history"), s.hits);
  }
}

/** 収支 [円]。持ち玉は 1 玉 4 円で数える */
export function balance(m: Machine): number {
  return m.balls * 4 - m.invested;
}

function renderHistory(ol: HTMLElement, hits: readonly HitRecord[]): void {
  const recent = hits.slice(-10).reverse();
  ol.replaceChildren(
    ...recent.map((h) => {
      const li = document.createElement("li");
      li.className = MODE_CLASS[h.next];
      const spins = document.createElement("b");
      spins.textContent = String(h.spins);
      const meta = document.createElement("span");
      meta.textContent = `${h.rounds}R ${h.payout.toLocaleString("ja-JP")}玉`;
      li.append(spins, meta);
      return li;
    }),
  );
}

function drawSlump(c: HTMLCanvasElement, data: readonly number[]): void {
  const g = c.getContext("2d")!;
  const { width: w, height: h } = c;
  g.clearRect(0, 0, w, h);
  const pts = data.length > 0 ? [0, ...data] : [0];
  const max = Math.max(5000, ...pts);
  const min = Math.min(-5000, ...pts);
  const y = (v: number) => 10 + ((max - v) / (max - min)) * (h - 20);
  const x = (i: number) => 8 + (i / Math.max(1, pts.length - 1)) * (w - 16);
  g.strokeStyle = "rgba(255,255,255,0.12)";
  g.lineWidth = 1;
  for (let v = Math.ceil(min / 5000) * 5000; v <= max; v += 5000) {
    g.beginPath();
    g.moveTo(0, y(v));
    g.lineTo(w, y(v));
    g.stroke();
  }
  g.strokeStyle = "rgba(255,255,255,0.45)";
  g.beginPath();
  g.moveTo(0, y(0));
  g.lineTo(w, y(0));
  g.stroke();
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#ffd84a");
  grad.addColorStop(y(0) / h, "#ff8fc8");
  grad.addColorStop(1, "#5fb6ff");
  g.strokeStyle = grad;
  g.lineWidth = 3;
  g.lineJoin = "round";
  g.beginPath();
  pts.forEach((v, i) => (i === 0 ? g.moveTo(x(i), y(v)) : g.lineTo(x(i), y(v))));
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.6)";
  g.font = "18px sans-serif";
  g.fillText(`${Math.round(max / 1000)}k`, 10, 24);
  g.fillText(`${Math.round(min / 1000)}k`, 10, h - 10);
}
