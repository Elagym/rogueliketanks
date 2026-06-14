import type { Settings } from './types';

/**
 * Self-contained audio manager. All SFX and the background music loop are
 * synthesized with the Web Audio API, so the game ships without any binary
 * audio assets. Categories (music / sfx) and master volume are mutable, and
 * nothing plays until the user interacts (the context is resumed on demand).
 */
export type Sfx =
  | 'shoot_rapid'
  | 'shoot_long'
  | 'shoot_explosive'
  | 'enemy_shot'
  | 'hit'
  | 'miss'
  | 'explosion'
  | 'overheat'
  | 'click'
  | 'gameover'
  | 'unlock';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private settings: Settings;

  constructor(settings: Settings) {
    this.settings = settings;
  }

  private ensure(): boolean {
    if (typeof window === 'undefined') return false;
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return false;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.settings.masterVolume;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.settings.music ? 0.25 : 0;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.settings.sfx ? 0.6 : 0;
      this.sfxGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return true;
  }

  updateSettings(settings: Settings): void {
    this.settings = settings;
    if (this.master) this.master.gain.value = settings.masterVolume;
    if (this.musicGain) this.musicGain.gain.value = settings.music ? 0.25 : 0;
    if (this.sfxGain) this.sfxGain.gain.value = settings.sfx ? 0.6 : 0;
  }

  /** Call from a user gesture to unlock the audio context. */
  resume(): void {
    this.ensure();
  }

  private blip(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol = 1,
    sweepTo?: number,
  ): void {
    if (!this.ensure() || !this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweepTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol = 1, lowpass = 2000): void {
    if (!this.ensure() || !this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const frames = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
  }

  play(sfx: Sfx): void {
    if (!this.settings.sfx) return;
    switch (sfx) {
      case 'shoot_rapid':
        this.blip(520, 0.08, 'square', 0.4, 300);
        break;
      case 'shoot_long':
        this.blip(180, 0.2, 'sawtooth', 0.6, 80);
        this.noise(0.12, 0.3, 1200);
        break;
      case 'shoot_explosive':
        this.blip(90, 0.3, 'sawtooth', 0.7, 50);
        this.noise(0.2, 0.4, 800);
        break;
      case 'enemy_shot':
        this.blip(700, 0.1, 'square', 0.25, 500);
        break;
      case 'hit':
        this.blip(300, 0.08, 'square', 0.5, 120);
        this.noise(0.05, 0.3, 3000);
        break;
      case 'miss':
        this.noise(0.18, 0.2, 1500);
        break;
      case 'explosion':
        this.noise(0.6, 0.7, 600);
        this.blip(120, 0.5, 'sawtooth', 0.5, 40);
        break;
      case 'overheat':
        this.blip(900, 0.12, 'square', 0.4);
        window.setTimeout(() => this.blip(900, 0.12, 'square', 0.4), 160);
        break;
      case 'click':
        this.blip(660, 0.05, 'square', 0.3);
        break;
      case 'gameover':
        this.blip(330, 0.25, 'triangle', 0.5, 200);
        window.setTimeout(() => this.blip(220, 0.5, 'triangle', 0.5, 110), 200);
        break;
      case 'unlock':
        this.blip(660, 0.12, 'triangle', 0.4);
        window.setTimeout(() => this.blip(990, 0.2, 'triangle', 0.4), 120);
        break;
    }
  }

  // --- Background music: a simple looping chiptune arpeggio. ---
  private musicStep = 0;
  private readonly scale = [220, 261.63, 293.66, 329.63, 392, 440, 523.25];
  private readonly progression = [0, 2, 4, 3, 0, 4, 5, 2];

  startMusic(): void {
    if (!this.ensure() || !this.ctx) return;
    if (this.musicTimer !== null) return;
    const tick = () => {
      if (this.settings.music && this.ctx && this.musicGain) {
        const base = this.progression[Math.floor(this.musicStep / 4) % this.progression.length];
        const note = this.scale[(base + (this.musicStep % 4) * 2) % this.scale.length];
        this.musicNote(note, 0.22);
        if (this.musicStep % 4 === 0) this.musicNote(note / 2, 0.4, 'triangle');
      }
      this.musicStep++;
    };
    tick();
    this.musicTimer = window.setInterval(tick, 230);
  }

  private musicNote(freq: number, dur: number, type: OscillatorType = 'square'): void {
    if (!this.ctx || !this.musicGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}
