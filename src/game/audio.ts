// Procedural Web Audio API synthesizer for ultra-juicy arcade SFX & adaptive BGM pulse

const PENTATONIC_RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2, 3, 10 / 3, 4];

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  private bgmTimer = 0;
  private bgmStep = 0;
  private noiseBuffer: AudioBuffer | null = null;

  public init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.42;
    this.masterGain.connect(this.ctx.destination);

    // Pre-bake white noise buffer for punchy percussion / explosions / dash whoosh
    const sampleRate = this.ctx.sampleRate;
    const len = sampleRate * 1.0;
    const buf = this.ctx.createBuffer(1, len, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buf;
  }

  public setMuted(m: boolean): void {
    this.muted = m;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(m ? 0 : 0.42, this.ctx.currentTime, 0.02);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private ready(): boolean {
    if (!this.ctx || !this.masterGain || this.muted) return false;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return true;
  }

  // Adaptive rhythmic arcade pulse synced to gameplay intensity
  public updateBgm(dt: number, active: boolean, combo: number, fever: boolean): number {
    if (!active) return 0;
    const bpm = fever ? 156 : Math.min(144, 122 + combo * 0.45);
    const stepDur = 60 / bpm / 2; // eighth notes
    this.bgmTimer += dt;
    let beatPulse = 0;

    if (this.bgmTimer >= stepDur) {
      this.bgmTimer -= stepDur;
      this.bgmStep = (this.bgmStep + 1) % 16;
      const isQuarter = this.bgmStep % 2 === 0;
      if (isQuarter) beatPulse = 1.0;

      if (this.ready() && this.ctx && this.masterGain) {
        const now = this.ctx.currentTime;
        // Kick on quarter beats
        if (isQuarter) {
          this.playKick(now, fever ? 0.24 : 0.16);
        }
        // Driving cyber bassline
        const bassPattern = [55, 55, 65.4, 55, 73.4, 55, 82.4, 73.4];
        const freq = bassPattern[this.bgmStep % bassPattern.length] * (fever ? 1.122 : 1.0);
        this.playBassNote(now, freq, stepDur * 0.8, fever ? 0.13 : 0.09);

        // Shimmering arpeggio in Fever or high combo
        if (fever || combo >= 12) {
          const arpNotes = [220, 261.63, 329.63, 392.0, 440, 523.25, 659.25, 523.25];
          const arpFreq = arpNotes[this.bgmStep % arpNotes.length] * (fever ? 2 : 1);
          this.playTone(now, arpFreq, 'triangle', stepDur * 0.65, fever ? 0.075 : 0.035);
        }
      }
    }
    return beatPulse;
  }

  private playKick(now: number, vol: number): void {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.11);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  private playBassNote(now: number, freq: number, dur: number, vol: number): void {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(520, now);
    filter.frequency.exponentialRampToValueAtTime(180, now + dur);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  private playTone(
    now: number,
    freq: number,
    type: OscillatorType,
    dur: number,
    vol: number,
    slideTo?: number
  ): void {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + dur);
    }
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  private playNoise(now: number, dur: number, vol: number, filterFreq: number, q = 1): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, now);
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  public playShoot(): void {
    if (!this.ready() || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.playTone(now, 680 + Math.random() * 140, 'triangle', 0.055, 0.055, 220);
  }

  public playDash(): void {
    if (!this.ready() || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.playTone(now, 260, 'sawtooth', 0.16, 0.18, 920);
    this.playNoise(now, 0.18, 0.22, 1600, 1.4);
  }

  public playSmashKill(combo: number, isCrit = false): void {
    if (!this.ready() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const ratio = PENTATONIC_RATIOS[Math.min(combo, 30) % PENTATONIC_RATIOS.length];
    const octave = combo >= 22 ? 2 : combo >= 11 ? 1.5 : 1;
    const baseFreq = 261.63 * ratio * octave;

    // Punchy sub-thump
    this.playTone(now, isCrit ? 180 : 140, 'sine', 0.18, isCrit ? 0.36 : 0.26, 36);
    // Crystalline shatter chord
    this.playTone(now, baseFreq, 'triangle', 0.22, 0.18, baseFreq * 1.03);
    this.playTone(now + 0.02, baseFreq * 1.5, 'sine', 0.24, 0.14);
    if (isCrit) {
      this.playTone(now + 0.03, baseFreq * 2, 'sawtooth', 0.28, 0.12);
    }
    this.playNoise(now, 0.14, 0.18, 2800, 2.2);
  }

  public playEnemyKill(combo: number): void {
    if (!this.ready() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const ratio = PENTATONIC_RATIOS[Math.min(combo, 25) % PENTATONIC_RATIOS.length];
    const freq = 330 * ratio;
    this.playTone(now, 120, 'sine', 0.1, 0.16, 45);
    this.playTone(now, freq, 'triangle', 0.14, 0.12, freq * 1.15);
    this.playNoise(now, 0.08, 0.09, 2200, 1.6);
  }

  public playGemPickup(combo: number): void {
    if (!this.ready() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const idx = Math.min(combo, 20) % PENTATONIC_RATIOS.length;
    const freq = 523.25 * PENTATONIC_RATIOS[idx];
    this.playTone(now, freq, 'sine', 0.09, 0.08, freq * 1.25);
  }

  public playGraze(): void {
    if (!this.ready() || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.playTone(now, 1180, 'sine', 0.11, 0.14, 2100);
    this.playTone(now + 0.03, 1650, 'triangle', 0.09, 0.1, 2400);
  }

  public playChainLightning(): void {
    if (!this.ready() || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.playTone(now, 1400, 'sawtooth', 0.12, 0.1, 420);
    this.playNoise(now, 0.1, 0.14, 4200, 3.0);
  }

  public playNova(): void {
    if (!this.ready() || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.playTone(now, 240, 'sine', 0.55, 0.4, 32);
    this.playTone(now, 440, 'sawtooth', 0.45, 0.18, 880);
    this.playTone(now + 0.06, 660, 'triangle', 0.5, 0.18, 1320);
    this.playNoise(now, 0.42, 0.28, 1100, 0.8);
  }

  public playFeverStart(): void {
    if (!this.ready() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880, 1108.73];
    notes.forEach((n, i) => {
      this.playTone(now + i * 0.055, n, 'sawtooth', 0.26, 0.14);
      this.playTone(now + i * 0.055, n * 1.5, 'triangle', 0.24, 0.1);
    });
  }

  public playJackpot(): void {
    if (!this.ready() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568.0];
    notes.forEach((n, i) => {
      this.playTone(now + i * 0.05, n, 'triangle', 0.24, 0.16);
    });
  }

  public playLevelUp(): void {
    if (!this.ready() || !this.ctx) return;
    const now = this.ctx.currentTime;
    [392, 493.88, 587.33, 783.99].forEach((n, i) => {
      this.playTone(now + i * 0.065, n, 'triangle', 0.3, 0.16);
    });
  }

  public playPlayerHit(): void {
    if (!this.ready() || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.playTone(now, 190, 'sawtooth', 0.3, 0.32, 42);
    this.playNoise(now, 0.25, 0.26, 600, 0.9);
  }

  public playGameOver(): void {
    if (!this.ready() || !this.ctx) return;
    const now = this.ctx.currentTime;
    [330, 293.66, 246.94, 174.61].forEach((n, i) => {
      this.playTone(now + i * 0.11, n, 'sawtooth', 0.32, 0.16, n * 0.85);
    });
  }

  public playUiClick(): void {
    if (!this.ready() || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.playTone(now, 740, 'triangle', 0.06, 0.11, 1020);
  }
}
