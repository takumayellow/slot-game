import { hiss, midi, tone, type Voice } from "./synth";

/** モードごとの BGM。16 分音符のステップを少し先まで予約して鳴らす */

export type Mood = "off" | "normal" | "chance" | "reach" | "rush" | "lt" | "jackpot";

interface Song {
  bpm: number;
  /** 1 小節ごとのコード（ルートを先頭にした音番号） */
  bars: number[][];
  kick: string;
  snare: string;
  hat: string;
  /** 8 分のベース / 16 分のベース */
  bass: "half" | "eighth" | "sixteenth";
  arp?: { type: OscillatorType; gain: number; octave: number };
  pad?: { type: OscillatorType; gain: number };
  /** メロディ。数はコードの構成音の番号（3 で 1 オクターブ上） */
  lead?: { type: OscillatorType; gain: number; notes: (number | null)[] };
}

const tri = (r: number, minor = false) => [r, r + (minor ? 3 : 4), r + 7];

const SONGS: Record<Exclude<Mood, "off">, Song> = {
  normal: {
    bpm: 112,
    bars: [tri(53), tri(50, true), tri(58), tri(48)],
    kick: "x.......x.......",
    snare: "................",
    hat: "..x...x...x...x.",
    bass: "half",
    arp: { type: "sine", gain: 0.05, octave: 24 },
    pad: { type: "triangle", gain: 0.05 },
  },
  chance: {
    bpm: 132,
    bars: [tri(48), tri(55), tri(57, true), tri(53)],
    kick: "x...x...x...x...",
    snare: "....x.......x...",
    hat: "..x...x...x...x.",
    bass: "eighth",
    arp: { type: "triangle", gain: 0.05, octave: 24 },
    pad: { type: "sine", gain: 0.05 },
  },
  reach: {
    bpm: 144,
    bars: [tri(50, true), tri(50, true), tri(46), tri(45)],
    kick: "x..x..x.x..x..x.",
    snare: "....x.......x..x",
    hat: "xxxxxxxxxxxxxxxx",
    bass: "sixteenth",
    pad: { type: "sawtooth", gain: 0.035 },
  },
  rush: {
    bpm: 168,
    bars: [tri(57, true), tri(53), tri(55), tri(52)],
    kick: "x...x...x...x...",
    snare: "....x.......x...",
    hat: "..x...x...x...x.",
    bass: "eighth",
    arp: { type: "square", gain: 0.03, octave: 24 },
    pad: { type: "sawtooth", gain: 0.03 },
    lead: {
      type: "square",
      gain: 0.045,
      notes: [3, null, 2, 3, null, 5, null, 3, 2, null, 1, null, 2, null, 3, null],
    },
  },
  lt: {
    bpm: 176,
    bars: [tri(59, true), tri(55), tri(57), tri(54)],
    kick: "x...x...x...x.x.",
    snare: "....x.......x...",
    hat: "xx.xxx.xxx.xxx.x",
    bass: "eighth",
    arp: { type: "square", gain: 0.035, octave: 24 },
    pad: { type: "sawtooth", gain: 0.035 },
    lead: {
      type: "sawtooth",
      gain: 0.04,
      notes: [3, 4, 5, null, 4, null, 3, 2, null, 3, null, 4, 5, null, 6, null],
    },
  },
  jackpot: {
    bpm: 150,
    bars: [tri(48), tri(53), tri(55), tri(48)],
    kick: "x...x...x...x...",
    snare: "....x.......x.xx",
    hat: "..x...x...x...x.",
    bass: "eighth",
    pad: { type: "sawtooth", gain: 0.05 },
    lead: {
      type: "square",
      gain: 0.05,
      notes: [3, null, 4, null, 5, null, 6, null, null, 5, 6, null, 7, null, null, null],
    },
  },
};

const LOOKAHEAD = 0.18;

export class Bgm {
  readonly bus: GainNode;
  private mood: Mood = "off";
  private step = 0;
  private nextAt = 0;
  private timer: number | null = null;
  private readonly v: Voice;

  constructor(private readonly ctx: AudioContext, out: AudioNode) {
    this.bus = ctx.createGain();
    // ベースとパッドが濁らないよう低域を軽く絞り、全体をローパスで丸める
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 7000;
    this.bus.connect(lp).connect(out);
    this.v = { ctx, out: this.bus };
  }

  setMood(mood: Mood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    this.step = 0;
    this.nextAt = this.ctx.currentTime + 0.05;
    if (mood === "off") this.stop();
    else if (this.timer === null) this.timer = window.setInterval(() => this.tick(), 40);
  }

  private stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    if (this.mood === "off") return;
    const song = SONGS[this.mood];
    const sixteenth = 60 / song.bpm / 4;
    // タブが裏に回って遅れたら追いつかずに今から鳴らし直す
    if (this.nextAt < this.ctx.currentTime - 0.2) this.nextAt = this.ctx.currentTime + 0.02;
    while (this.nextAt < this.ctx.currentTime + LOOKAHEAD) {
      this.play(song, this.step, this.nextAt - this.ctx.currentTime, sixteenth);
      this.step++;
      this.nextAt += sixteenth;
    }
  }

  private play(song: Song, step: number, at: number, len: number): void {
    const v = this.v;
    const s = step % 16;
    const bar = song.bars[Math.floor(step / 16) % song.bars.length];
    const root = bar[0];
    if (song.kick[s] === "x") {
      tone(v, { type: "sine", freq: 160, to: 42, dur: 0.24, gain: 0.5, at });
    }
    if (song.snare[s] === "x") {
      hiss(v, { freq: 1900, q: 0.7, dur: 0.16, gain: 0.22, at });
      tone(v, { type: "triangle", freq: 200, to: 150, dur: 0.08, gain: 0.12, at });
    }
    if (song.hat[s] === "x") hiss(v, { freq: 9000, q: 1.2, dur: 0.045, gain: 0.07, at });

    const bassNote = midi(root - 24 + (s % 8 === 6 && song.bass !== "half" ? 7 : 0));
    if (song.bass === "half" ? s % 8 === 0 : song.bass === "eighth" ? s % 2 === 0 : true) {
      const dur = song.bass === "half" ? len * 7 : len * (song.bass === "eighth" ? 1.8 : 0.9);
      tone(v, { type: "triangle", freq: bassNote, dur, gain: 0.2, at });
      tone(v, { type: "sawtooth", freq: bassNote, dur: dur * 0.6, gain: 0.03, at });
    }
    if (song.pad && s === 0) {
      for (const n of bar) {
        tone(v, { type: song.pad.type, freq: midi(n), dur: len * 15.5, gain: song.pad.gain, attack: 0.12, at, detune: -6 });
        tone(v, { type: song.pad.type, freq: midi(n), dur: len * 15.5, gain: song.pad.gain, attack: 0.12, at, detune: 6 });
      }
    }
    if (song.arp && s % 2 === 0) {
      const order = [0, 1, 2, 1, 0, 2, 1, 2];
      const n = bar[order[(s / 2) % order.length]] + song.arp.octave - 12 + (s >= 8 ? 12 : 0);
      tone(v, { type: song.arp.type, freq: midi(n), dur: len * 1.6, gain: song.arp.gain, at });
    }
    if (song.lead) {
      const n = song.lead.notes[s];
      if (n !== null && n !== undefined) {
        const note = bar[n % 3] + 12 * Math.floor(n / 3) + 12;
        tone(v, { type: song.lead.type, freq: midi(note), dur: len * 1.8, gain: song.lead.gain, at, attack: 0.01 });
      }
    }
  }
}
