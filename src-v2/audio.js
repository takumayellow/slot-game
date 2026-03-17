/**
 * audio.js - V2 Pachislot Audio Engine
 * Web Audio API sound effects for the pachislot game
 */

'use strict';

class PachislotAudio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.enabled = true;
    this._initOnGesture = this._initOnGesture.bind(this);
  }

  // Initialize AudioContext on first user gesture
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.7;
      this.masterGain.connect(this.ctx.destination);
    } catch (e) {
      this.enabled = false;
    }
  }

  _initOnGesture() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  _ensureRunning() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  _now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // Create oscillator helper
  _osc(type, freq, startTime, duration, gainPeak, freqEnd) {
    if (!this.ctx || !this.enabled) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(freqEnd, startTime + duration);
    }
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(gainPeak, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  // Coin insert sound
  playCoinInsert() {
    this._ensureRunning();
    if (!this.ctx) return;
    const t = this._now();
    this._osc('sine', 880, t, 0.08, 0.15, 1100);
    this._osc('sine', 1100, t + 0.06, 0.08, 0.12, 880);
  }

  // Lever/spin start sound
  playSpinStart() {
    this._ensureRunning();
    if (!this.ctx) return;
    const t = this._now();
    // Mechanical click + whirr
    this._osc('sawtooth', 200, t, 0.05, 0.2, 80);
    this._osc('triangle', 400, t + 0.02, 0.15, 0.15, 200);
    // Add reel noise
    const bufferSize = this.ctx.sampleRate * 0.1;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.3, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    noise.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noise.start(t);
  }

  // Reel stop sound (mechanical thud)
  playReelStop(reelIndex) {
    this._ensureRunning();
    if (!this.ctx) return;
    const t = this._now();
    const baseFreq = 110 - reelIndex * 10;
    this._osc('triangle', baseFreq * 2, t, 0.12, 0.3, baseFreq);
    // Click
    this._osc('square', 800, t, 0.03, 0.2, 400);
  }

  // Small win sound
  playSmallWin() {
    this._ensureRunning();
    if (!this.ctx) return;
    const t = this._now();
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      this._osc('sine', freq, t + i * 0.08, 0.15, 0.25);
    });
  }

  // Win sound (ascending arpeggio)
  playWin() {
    this._ensureRunning();
    if (!this.ctx) return;
    const t = this._now();
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25];
    notes.forEach((freq, i) => {
      this._osc('square', freq, t + i * 0.07, 0.18, 0.2);
      this._osc('sine', freq * 2, t + i * 0.07 + 0.01, 0.16, 0.1);
    });
  }

  // Big win sound (fanfare)
  playBigWin() {
    this._ensureRunning();
    if (!this.ctx) return;
    const t = this._now();
    // Fanfare notes
    const melody = [392, 523.25, 659.25, 783.99, 1046.50];
    melody.forEach((freq, i) => {
      this._osc('square', freq, t + i * 0.1, 0.22, 0.25);
      this._osc('triangle', freq * 0.5, t + i * 0.1, 0.22, 0.15);
    });
    // Sustain chord
    [523.25, 659.25, 783.99].forEach(freq => {
      this._osc('sine', freq, t + 0.55, 0.4, 0.12);
    });
  }

  // Jackpot sound (full fanfare + explosion)
  playJackpot() {
    this._ensureRunning();
    if (!this.ctx) return;
    const t = this._now();
    // Ascending sweep
    const melody = [261.63, 329.63, 392, 523.25, 659.25, 783.99, 1046.5, 1318.5];
    melody.forEach((freq, i) => {
      this._osc('square', freq, t + i * 0.07, 0.2, 0.3);
      this._osc('sawtooth', freq, t + i * 0.07, 0.2, 0.1);
    });
    // Victory chord
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      this._osc('sine', freq, t + 0.7 + i * 0.02, 0.8, 0.2);
    });
    // Noise burst
    const burstSize = this.ctx.sampleRate * 0.15;
    const burst = this.ctx.createBuffer(1, burstSize, this.ctx.sampleRate);
    const bd = burst.getChannelData(0);
    for (let i = 0; i < burstSize; i++) bd[i] = (Math.random() * 2 - 1);
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = burst;
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1000;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, t + 0.65);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noiseSource.start(t + 0.65);
  }

  // Lose/miss sound
  playLose() {
    this._ensureRunning();
    if (!this.ctx) return;
    const t = this._now();
    this._osc('sawtooth', 220, t, 0.2, 0.18, 110);
    this._osc('sawtooth', 180, t + 0.05, 0.18, 0.12, 90);
  }

  // Free spin trigger fanfare
  playFreeSpinTrigger() {
    this._ensureRunning();
    if (!this.ctx) return;
    const t = this._now();
    // Wild ascending arpeggio
    const notes = [261.63, 392, 523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      this._osc('square', freq, t + i * 0.09, 0.25, 0.3);
      this._osc('triangle', freq * 1.5, t + i * 0.09, 0.2, 0.15);
    });
    // Hold chord
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      this._osc('sine', freq, t + 0.6 + i * 0.05, 1.0, 0.2);
    });
  }

  // Free spin individual spin sound (lighter)
  playFreeSpin() {
    this._ensureRunning();
    if (!this.ctx) return;
    const t = this._now();
    this._osc('triangle', 880, t, 0.05, 0.15, 660);
    this._osc('triangle', 660, t + 0.04, 0.05, 0.1, 440);
  }

  // Button click
  playButtonClick() {
    this._ensureRunning();
    if (!this.ctx) return;
    const t = this._now();
    this._osc('sine', 440, t, 0.04, 0.1, 440);
  }

  // Streak bonus notification
  playStreakUp() {
    this._ensureRunning();
    if (!this.ctx) return;
    const t = this._now();
    [523.25, 783.99, 1046.5].forEach((freq, i) => {
      this._osc('sine', freq, t + i * 0.06, 0.12, 0.2);
    });
  }

  setVolume(val) {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, val));
    }
  }

  toggleMute() {
    this.enabled = !this.enabled;
    if (this.masterGain) {
      this.masterGain.gain.value = this.enabled ? 0.7 : 0;
    }
    return this.enabled;
  }
}

window.PachislotAudioV2 = PachislotAudio;
