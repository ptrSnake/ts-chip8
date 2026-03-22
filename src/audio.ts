export class Audio {
  private ctx: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;

  start(): void {
    if (this.oscillator) return; // already playing
    if (!this.ctx) this.ctx = new AudioContext();
    this.oscillator = this.ctx.createOscillator();
    this.oscillator.type = "square";
    this.oscillator.frequency.setValueAtTime(440, this.ctx.currentTime);
    this.oscillator.connect(this.ctx.destination);
    this.oscillator.start();
  }

  stop(): void {
    if (!this.oscillator) return;
    this.oscillator.stop();
    this.oscillator.disconnect();
    this.oscillator = null;
  }
}
