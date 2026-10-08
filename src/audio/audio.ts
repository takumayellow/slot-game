import type { HoldColor } from "../game/lottery";
import { Bgm, type Mood } from "./bgm";
import { chord, hiss, midi, tone, type Voice } from "./synth";

/** 効果音・BGM・ボイスの出口。最初のユーザー操作で unlock() してから鳴る */

export const VOICE_IDS = [
  "welcome",
  "reach",
  "next",
  "cutinBlue",
  "cutinRed",
  "cutinGold",
  "sp",
  "spsp",
  "push",
  "hit",
  "miss",
  "sudden",
  "zenkaiten",
  "rightShoot",
  "round",
  "rush",
  "promote",
  "jitan",
  "lt",
  "rushHit",
  "rushEnd",
  "leftShoot",
] as const;
export type VoiceId = (typeof VOICE_IDS)[number];

const HOLD_NOTE: Record<HoldColor, number[]> = {
  white: [84],
  blue: [79, 86],
  green: [81, 88],
  red: [76, 83, 88],
  rainbow: [72, 79, 84, 88, 91],
};

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: Voice;
  private bgmGain!: GainNode;
  private voiceOut!: GainNode;
  private bgm!: Bgm;
  private readonly buffers = new Map<VoiceId, AudioBuffer>();
  private currentVoice: AudioBufferSourceNode | null = null;
  private lastNail = 0;
  private nailBudget = 0;
  private lastPayout = 0;
  private mood: Mood = "off";
  private muted = false;
  private volume = 0.7;

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === "running";
  }

  /** ブラウザの自動再生制限を外す。クリック・キー操作の中から呼ぶ */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: "interactive" });
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(ctx.destination);
      const sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.8;
      sfxGain.connect(this.master);
      this.sfx = { ctx, out: sfxGain };
      this.bgmGain = ctx.createGain();
      this.bgmGain.gain.value = 0.55;
      this.bgmGain.connect(this.master);
      this.bgm = new Bgm(ctx, this.bgmGain);
      this.voiceOut = ctx.createGain();
      this.voiceOut.gain.value = 1.15;
      this.voiceOut.connect(this.master);
      void this.loadVoices(ctx);
      const mood = this.mood;
      this.mood = "off";
      this.setMood(mood);
    }
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMood(mood: Mood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    if (this.ctx) this.bgm.setMood(mood);
  }

  private async loadVoices(ctx: AudioContext): Promise<void> {
    const base = `${import.meta.env.BASE_URL}assets/voice/`;
    await Promise.all(
      VOICE_IDS.map(async (id) => {
        try {
          const res = await fetch(`${base}${id}.mp3`);
          if (!res.ok) return;
          this.buffers.set(id, await ctx.decodeAudioData(await res.arrayBuffer()));
        } catch {
          // ボイスが無くても遊べるので黙って諦める
        }
      }),
    );
  }

  /** ボイスを鳴らす。鳴っている間は BGM を下げる */
  voice(id: VoiceId): void {
    const ctx = this.ctx;
    const buf = this.buffers.get(id);
    if (!ctx || !buf) return;
    this.currentVoice?.stop();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.voiceOut);
    const now = ctx.currentTime;
    this.bgmGain.gain.cancelScheduledValues(now);
    this.bgmGain.gain.setTargetAtTime(0.22, now, 0.04);
    this.bgmGain.gain.setTargetAtTime(0.55, now + buf.duration, 0.25);
    src.start();
    src.onended = () => {
      if (this.currentVoice === src) this.currentVoice = null;
    };
    this.currentVoice = src;
  }

  private get v(): Voice | null {
    return this.ctx && this.ctx.state === "running" ? this.sfx : null;
  }

  launch(): void {
    const v = this.v;
    if (!v) return;
    hiss(v, { freq: 2400, to: 900, q: 0.8, dur: 0.07, gain: 0.05 });
    tone(v, { type: "sine", freq: 120, to: 60, dur: 0.06, gain: 0.05 });
  }

  /** 釘に当たった音。数が多いので 1 秒あたりの回数を絞る */
  nail(speed: number): void {
    const v = this.v;
    if (!v || speed < 140) return;
    const now = v.ctx.currentTime;
    this.nailBudget = Math.min(30, this.nailBudget + (now - this.lastNail) * 30);
    this.lastNail = now;
    if (this.nailBudget < 1) return;
    this.nailBudget--;
    const g = Math.min(0.06, 0.012 + speed / 30000);
    tone(v, { type: "sine", freq: 3400 + Math.random() * 1800, dur: 0.05, gain: g });
    tone(v, { type: "sine", freq: 7100 + Math.random() * 900, dur: 0.025, gain: g * 0.4 });
  }

  hold(color: HoldColor): void {
    const v = this.v;
    if (!v) return;
    HOLD_NOTE[color].forEach((n, i) => tone(v, { type: "triangle", freq: midi(n), dur: 0.22, gain: 0.12, at: i * 0.05 }));
    if (color === "rainbow") hiss(v, { freq: 6000, to: 12000, dur: 0.6, gain: 0.05, q: 0.5 });
  }

  payout(n: number): void {
    const v = this.v;
    if (!v) return;
    const now = v.ctx.currentTime;
    if (now - this.lastPayout < 0.05) return;
    this.lastPayout = now;
    const k = Math.min(n, 5);
    for (let i = 0; i < k; i++) tone(v, { type: "square", freq: 2100 + i * 90, dur: 0.035, gain: 0.025, at: i * 0.03 });
  }

  reelStop(center = false): void {
    const v = this.v;
    if (!v) return;
    hiss(v, { freq: 1400, q: 3, dur: 0.06, gain: center ? 0.2 : 0.14 });
    tone(v, { type: "square", freq: center ? 520 : 680, dur: 0.05, gain: 0.05 });
  }

  pseudo(): void {
    const v = this.v;
    if (!v) return;
    tone(v, { type: "sine", freq: 90, to: 50, dur: 0.3, gain: 0.4 });
    hiss(v, { freq: 600, q: 0.6, dur: 0.18, gain: 0.15 });
  }

  reach(): void {
    const v = this.v;
    if (!v) return;
    hiss(v, { freq: 400, to: 5000, q: 0.7, dur: 0.5, gain: 0.12, attack: 0.3 });
    chord(v, [62, 66, 69, 74], { type: "sawtooth", dur: 0.7, gain: 0.12, at: 0.45 });
    tone(v, { type: "sine", freq: 110, to: 45, dur: 0.5, gain: 0.4, at: 0.45 });
  }

  cutin(level: "blue" | "red" | "gold"): void {
    const v = this.v;
    if (!v) return;
    hiss(v, { freq: 300, to: 7000, q: 0.6, dur: 0.25, gain: 0.18 });
    const notes = level === "gold" ? [72, 76, 79, 84, 88] : level === "red" ? [69, 72, 76, 81] : [67, 71, 74];
    chord(v, notes, { type: "sawtooth", dur: 0.6, gain: 0.16, at: 0.18 });
    tone(v, { type: "sine", freq: 140, to: 40, dur: 0.4, gain: 0.5, at: 0.18 });
  }

  push(): void {
    const v = this.v;
    if (!v) return;
    tone(v, { type: "sine", freq: 180, to: 35, dur: 0.6, gain: 0.7 });
    hiss(v, { freq: 900, q: 0.4, dur: 0.5, gain: 0.3 });
    chord(v, [60, 67, 72, 76, 79], { type: "sawtooth", dur: 0.9, gain: 0.14, at: 0.05 });
  }

  /** 役物が落ちてくる音 */
  gimmick(): void {
    const v = this.v;
    if (!v) return;
    hiss(v, { freq: 3000, to: 300, q: 0.8, dur: 0.3, gain: 0.2 });
    tone(v, { type: "sine", freq: 120, to: 38, dur: 0.5, gain: 0.6, at: 0.28 });
    hiss(v, { freq: 700, q: 0.5, dur: 0.35, gain: 0.25, at: 0.28 });
  }

  hit(): void {
    const v = this.v;
    if (!v) return;
    const seq = [72, 76, 79, 84, 79, 84, 88];
    seq.forEach((n, i) => tone(v, { type: "square", freq: midi(n), dur: 0.16, gain: 0.08, at: i * 0.09 }));
    chord(v, [60, 64, 67, 72, 76], { type: "sawtooth", dur: 1.6, gain: 0.18, at: seq.length * 0.09, attack: 0.02 });
    hiss(v, { freq: 8000, q: 0.4, dur: 1.4, gain: 0.06, at: seq.length * 0.09 });
  }

  miss(): void {
    const v = this.v;
    if (!v) return;
    tone(v, { type: "triangle", freq: midi(64), to: midi(52), dur: 0.5, gain: 0.12 });
  }

  sudden(): void {
    const v = this.v;
    if (!v) return;
    tone(v, { type: "sawtooth", freq: 60, to: 30, dur: 0.8, gain: 0.3 });
    hiss(v, { freq: 200, q: 0.5, dur: 0.8, gain: 0.3 });
  }

  round(): void {
    const v = this.v;
    if (!v) return;
    [84, 88, 91].forEach((n, i) => tone(v, { type: "triangle", freq: midi(n), dur: 0.3, gain: 0.12, at: i * 0.07 }));
  }

  attackerIn(): void {
    const v = this.v;
    if (!v) return;
    tone(v, { type: "square", freq: midi(96), dur: 0.08, gain: 0.05 });
    tone(v, { type: "square", freq: midi(100), dur: 0.12, gain: 0.05, at: 0.06 });
  }

  denchu(open: boolean): void {
    const v = this.v;
    if (!v) return;
    tone(v, { type: "square", freq: open ? 1400 : 900, dur: 0.04, gain: 0.04 });
  }

  /** RUSH 突入・昇格のジングル */
  rushIn(): void {
    const v = this.v;
    if (!v) return;
    const seq = [69, 72, 76, 81, 84, 88, 93];
    seq.forEach((n, i) => tone(v, { type: "sawtooth", freq: midi(n), dur: 0.2, gain: 0.08, at: i * 0.06 }));
    hiss(v, { freq: 500, to: 9000, q: 0.5, dur: 0.6, gain: 0.12 });
  }
}
