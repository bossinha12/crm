class CRMAlarm {
  private audioCtx: AudioContext | null = null;
  private intervalId: any = null;
  private isPlaying = false;

  /**
   * Starts the synthetic telephonic ringtone calling notification.
   */
  public start() {
    if (this.isPlaying) return;
    this.isPlaying = true;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        console.warn("Web Audio API is not supported in this frame.");
        return;
      }
      
      this.audioCtx = new AudioContextClass();
      
      const triggerRingPulse = () => {
        if (!this.audioCtx) return;
        
        try {
          if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
          }

          const osc1 = this.audioCtx.createOscillator();
          const osc2 = this.audioCtx.createOscillator();
          const gainNode = this.audioCtx.createGain();

          // Dual-frequency chord matching standard ringers
          osc1.frequency.setValueAtTime(660, this.audioCtx.currentTime); // 660Hz
          osc2.frequency.setValueAtTime(880, this.audioCtx.currentTime); // 880Hz
          
          osc1.type = 'sawtooth'; // distinctive commercial phone pitch
          osc2.type = 'sine';

          // Ring modulation pattern (Pulse 1, Pulse 2)
          gainNode.gain.setValueAtTime(0, this.audioCtx.currentTime);
          
          // First ringlet pulse
          gainNode.gain.linearRampToValueAtTime(0.15, this.audioCtx.currentTime + 0.05);
          gainNode.gain.setValueAtTime(0.15, this.audioCtx.currentTime + 0.25);
          gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.35);

          // Second ringlet pulse
          gainNode.gain.linearRampToValueAtTime(0.15, this.audioCtx.currentTime + 0.45);
          gainNode.gain.setValueAtTime(0.15, this.audioCtx.currentTime + 0.65);
          gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.85);

          // Connect node graph
          osc1.connect(gainNode);
          osc2.connect(gainNode);
          gainNode.connect(this.audioCtx.destination);

          // Start oscillators
          osc1.start();
          osc2.start();

          // Kill at completion
          osc1.stop(this.audioCtx.currentTime + 0.90);
          osc2.stop(this.audioCtx.currentTime + 0.90);
        } catch (e) {
          console.error("Audio Synthesis Pulse Error:", e);
        }
      };

      // Play ringing chime immediately and queue every 2 seconds
      triggerRingPulse();
      this.intervalId = setInterval(triggerRingPulse, 2100);
    } catch (err) {
      console.error("Could not trigger call sound synthesis:", err);
    }
  }

  /**
   * Instantly terminates all audio loops and frees audio resources.
   */
  public stop() {
    if (!this.isPlaying) return;
    this.isPlaying = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch (err) {
        console.error("Error closing AudioContext:", err);
      }
      this.audioCtx = null;
    }
  }
}

export const crmAlarm = new CRMAlarm();
