class CRMAlarm {
  private audioCtx: AudioContext | null = null;
  private intervalId: any = null;
  private vibrateIntervalId: any = null;
  private isPlaying = false;
  private isMuted = false;
  private isUnlocked = false;

  constructor() {
    // Automatically unlock AudioContext on the user's first touch / click / key interaction
    if (typeof window !== 'undefined') {
      const unlockAudio = () => {
        this.ensureContext();
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
          this.audioCtx.resume().then(() => {
            this.isUnlocked = true;
          }).catch(() => {});
        } else {
          this.isUnlocked = true;
        }
      };

      window.addEventListener('click', unlockAudio, { passive: true, once: false });
      window.addEventListener('touchstart', unlockAudio, { passive: true, once: false });
      window.addEventListener('keydown', unlockAudio, { passive: true, once: false });
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      return this.audioCtx;
    }

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
        return this.audioCtx;
      }
    } catch (e) {
      console.warn("Web Audio API not supported:", e);
    }
    return null;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.stop();
    }
  }

  public getMuted() {
    return this.isMuted;
  }

  public getIsPlaying() {
    return this.isPlaying;
  }

  /**
   * Plays a single alert chime for instant confirmation.
   */
  public playTestBeep() {
    if (this.isMuted) return;
    try {
      const ctx = this.ensureContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15); // E6

      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch (e) {
      console.warn("Test beep blocked or failed:", e);
    }
  }

  /**
   * Plays a single instant message chime notification.
   */
  public playMessageChime() {
    if (this.isMuted) return;
    try {
      const ctx = this.ensureContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();

      const t = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';

      osc1.frequency.setValueAtTime(587.33, t); // D5
      osc1.frequency.setValueAtTime(880.00, t + 0.1); // A5

      osc2.frequency.setValueAtTime(1174.66, t + 0.1); // D6

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.3, t + 0.03);
      gain.gain.setValueAtTime(0.25, t + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(t);
      osc2.start(t + 0.1);
      osc1.stop(t + 0.45);
      osc2.stop(t + 0.45);
    } catch (e) {
      console.warn("Chime failed:", e);
    }
  }

  /**
   * Starts a continuous, looping telephone / calling alert notification.
   * Rings repeatedly every 1.8 seconds until stopped (e.g. when the chat is answered).
   */
  public start() {
    if (this.isMuted) return;
    if (this.isPlaying) return;
    this.isPlaying = true;

    try {
      const ctx = this.ensureContext();
      if (!ctx) return;

      const triggerRingPulse = () => {
        if (this.isMuted || !this.isPlaying) return;
        
        try {
          const currentCtx = this.ensureContext();
          if (!currentCtx) return;
          if (currentCtx.state === 'suspended') {
            currentCtx.resume();
          }

          const t = currentCtx.currentTime;

          // Modern Melodic Notification Call Chime (Warm, crystalline chords with gentle bell decay)
          // Note 1: E5 (659Hz) + B5 (988Hz)
          const osc1 = currentCtx.createOscillator();
          const osc2 = currentCtx.createOscillator();
          const gain1 = currentCtx.createGain();

          osc1.type = 'sine';
          osc2.type = 'triangle';
          osc1.frequency.setValueAtTime(659.25, t);
          osc2.frequency.setValueAtTime(987.77, t);

          gain1.gain.setValueAtTime(0, t);
          gain1.gain.linearRampToValueAtTime(0.25, t + 0.03);
          gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.32);

          osc1.connect(gain1);
          osc2.connect(gain1);
          gain1.connect(currentCtx.destination);

          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.35);
          osc2.stop(t + 0.35);

          // Note 2: G#5 (830Hz) + E6 (1318Hz)
          const osc3 = currentCtx.createOscillator();
          const osc4 = currentCtx.createOscillator();
          const gain2 = currentCtx.createGain();

          osc3.type = 'sine';
          osc4.type = 'triangle';
          osc3.frequency.setValueAtTime(830.61, t + 0.16);
          osc4.frequency.setValueAtTime(1318.51, t + 0.16);

          gain2.gain.setValueAtTime(0, t + 0.16);
          gain2.gain.linearRampToValueAtTime(0.28, t + 0.19);
          gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.50);

          osc3.connect(gain2);
          osc4.connect(gain2);
          gain2.connect(currentCtx.destination);

          osc3.start(t + 0.16);
          osc4.start(t + 0.16);
          osc3.stop(t + 0.55);
          osc4.stop(t + 0.55);

          // Note 3: B5 (988Hz) + G#6 (1661Hz) - Resonant peak bell
          const osc5 = currentCtx.createOscillator();
          const osc6 = currentCtx.createOscillator();
          const gain3 = currentCtx.createGain();

          osc5.type = 'sine';
          osc6.type = 'triangle';
          osc5.frequency.setValueAtTime(987.77, t + 0.32);
          osc6.frequency.setValueAtTime(1661.22, t + 0.32);

          gain3.gain.setValueAtTime(0, t + 0.32);
          gain3.gain.linearRampToValueAtTime(0.32, t + 0.35);
          gain3.gain.exponentialRampToValueAtTime(0.001, t + 0.85);

          osc5.connect(gain3);
          osc6.connect(gain3);
          gain3.connect(currentCtx.destination);

          osc5.start(t + 0.32);
          osc6.start(t + 0.32);
          osc5.stop(t + 0.90);
          osc6.stop(t + 0.90);

        } catch (e) {
          console.error("Audio Synthesis Ring Error:", e);
        }
      };

      // Play immediately and loop every 1.9 seconds
      triggerRingPulse();
      if (this.intervalId) clearInterval(this.intervalId);
      this.intervalId = setInterval(triggerRingPulse, 1900);
    } catch (err) {
      console.error("Could not trigger call sound synthesis:", err);
    }

    // Trigger recurring phone vibration on mobile like a real phone call
    const triggerPhoneVibrate = () => {
      try {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate([400, 200, 400, 200, 600]);
        }
      } catch (e) {}
    };
    triggerPhoneVibrate();
    if (this.vibrateIntervalId) clearInterval(this.vibrateIntervalId);
    this.vibrateIntervalId = setInterval(triggerPhoneVibrate, 1900);
  }

  /**
   * Explicitly unlocks audio and resumes context upon user touch
   */
  public unlock() {
    try {
      const ctx = this.ensureContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      this.isUnlocked = true;
    } catch (e) {}
  }

  public getIsUnlocked() {
    return this.isUnlocked && (!this.audioCtx || this.audioCtx.state === 'running');
  }

  /**
   * Instantly terminates all audio loops, vibrations, and stops the alarm.
   */
  public stop() {
    if (!this.isPlaying && !this.intervalId && !this.vibrateIntervalId) return;
    this.isPlaying = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.vibrateIntervalId) {
      clearInterval(this.vibrateIntervalId);
      this.vibrateIntervalId = null;
    }

    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(0);
      }
    } catch (e) {}
  }

  /**
   * Pleasant short chime for incoming client message notifications
   */
  public playMessageNotification() {
    if (this.isMuted) return;
    try {
      const currentCtx = this.ensureContext();
      if (!currentCtx) return;
      if (currentCtx.state === 'suspended') {
        currentCtx.resume();
      }
      const t = currentCtx.currentTime;

      // Note 1 (E5 - 659.25Hz)
      const osc1 = currentCtx.createOscillator();
      const gain1 = currentCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, t);
      osc1.frequency.exponentialRampToValueAtTime(783.99, t + 0.1); // Slide to G5
      gain1.gain.setValueAtTime(0.01, t);
      gain1.gain.linearRampToValueAtTime(0.25, t + 0.03);
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc1.connect(gain1);
      gain1.connect(currentCtx.destination);
      osc1.start(t);
      osc1.stop(t + 0.30);

      // Note 2 (B5 - 987.77Hz, high crisp chime)
      const osc2 = currentCtx.createOscillator();
      const gain2 = currentCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(987.77, t + 0.12);
      gain2.gain.setValueAtTime(0.01, t + 0.12);
      gain2.gain.linearRampToValueAtTime(0.3, t + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc2.connect(gain2);
      gain2.connect(currentCtx.destination);
      osc2.start(t + 0.12);
      osc2.stop(t + 0.58);
    } catch (e) {
      console.warn("Message chime error:", e);
    }
  }
}

export const crmAlarm = new CRMAlarm();
