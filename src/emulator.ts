import { CPU } from "./cpu.ts";
import { Display } from "./display.ts";
import { Keyboard } from "./keyboard.ts";
import { Audio } from "./audio.ts";
import { loadFromFile, loadFromURL } from "./rom.ts";
import { KEY_MAP, WIDTH, HEIGHT, CPU_HZ, TIMER_HZ } from "./constants.ts";

const SCALE = 10;
const CANVAS_W = WIDTH * SCALE;
const CANVAS_H = HEIGHT * SCALE;

export class Emulator {
  private display: Display;
  private keyboard: Keyboard;
  private audio: Audio;
  private cpu: CPU;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offscreen: OffscreenCanvas;
  private offCtx: OffscreenCanvasRenderingContext2D;

  private running = false;
  private romLoaded = false;
  private lastTimestamp = 0;
  private cpuAccumulator = 0;
  private cpuPeriodMs: number;
  private timerAccumulator = 0;
  private readonly timerPeriodMs = 1000 / TIMER_HZ;
  private rafId = 0;

  constructor() {
    this.display = new Display();
    this.keyboard = new Keyboard();
    this.audio = new Audio();
    this.cpu = new CPU(this.display, this.keyboard);

    this.cpuPeriodMs = 1000 / CPU_HZ;

    this.canvas = document.getElementById("screen") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;

    this.offscreen = new OffscreenCanvas(WIDTH, HEIGHT);
    this.offCtx = this.offscreen.getContext("2d") as OffscreenCanvasRenderingContext2D;

    this.wireDom();
    this.renderBlank();
  }

  private wireDom(): void {
    const fileInput = document.getElementById("rom-file") as HTMLInputElement;
    const startBtn  = document.getElementById("btn-start")  as HTMLButtonElement;
    const pauseBtn  = document.getElementById("btn-pause")  as HTMLButtonElement;
    const resetBtn  = document.getElementById("btn-reset")  as HTMLButtonElement;
    const speedSlider = document.getElementById("speed") as HTMLInputElement;
    const speedLabel  = document.getElementById("speed-label") as HTMLSpanElement;

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const data = await loadFromFile(file);
      this.cpu.loadROM(data);
      this.romLoaded = true;
      this.display.markClean();
      this.renderDisplay();
      this.stop();
      this.start();
    });

    startBtn.addEventListener("click", () => {
      if (this.romLoaded && !this.running) this.start();
    });

    pauseBtn.addEventListener("click", () => {
      if (this.running) this.stop();
    });

    resetBtn.addEventListener("click", () => {
      this.stop();
      this.cpu.reset();
      this.renderDisplay();
    });

    speedSlider.addEventListener("input", () => {
      const hz = parseInt(speedSlider.value, 10) * 50;
      this.cpuPeriodMs = 1000 / hz;
      speedLabel.textContent = `${hz} Hz`;
    });

    document.addEventListener("keydown", (e) => {
      const key = KEY_MAP[e.key.toLowerCase()];
      if (key !== undefined) {
        e.preventDefault();
        this.keyboard.setKey(key, true);
      }
    });

    document.addEventListener("keyup", (e) => {
      const key = KEY_MAP[e.key.toLowerCase()];
      if (key !== undefined) {
        this.keyboard.setKey(key, false);
      }
    });

    // Load demo ROM if available
    const romSelect = document.getElementById("rom-select") as HTMLSelectElement;
    if (romSelect) {
      romSelect.addEventListener("change", async () => {
        const url = romSelect.value;
        if (!url) return;
        try {
          const data = await loadFromURL(url);
          this.cpu.loadROM(data);
          this.romLoaded = true;
          this.display.markClean();
          this.renderDisplay();
          this.stop();
          this.start();
        } catch (e) {
          console.error("Failed to load ROM:", e);
        }
      });
    }
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTimestamp = 0;
    this.cpuAccumulator = 0;
    this.timerAccumulator = 0;
    this.rafId = requestAnimationFrame(this.loop.bind(this));
  }

  private stop(): void {
    this.running = false;
    this.audio.stop();
    cancelAnimationFrame(this.rafId);
  }

  private loop(timestamp: number): void {
    if (!this.running) return;

    if (this.lastTimestamp === 0) this.lastTimestamp = timestamp;
    const delta = Math.min(timestamp - this.lastTimestamp, 50);
    this.lastTimestamp = timestamp;

    this.cpuAccumulator += delta;
    while (this.cpuAccumulator >= this.cpuPeriodMs) {
      this.cpu.step();
      this.cpuAccumulator -= this.cpuPeriodMs;
    }

    this.timerAccumulator += delta;
    while (this.timerAccumulator >= this.timerPeriodMs) {
      this.cpu.tickTimers();
      this.timerAccumulator -= this.timerPeriodMs;
    }

    if (this.cpu.soundTimer > 0) {
      this.audio.start();
    } else {
      this.audio.stop();
    }

    if (this.display.isDirty()) {
      this.renderDisplay();
      this.display.markClean();
    }

    this.rafId = requestAnimationFrame(this.loop.bind(this));
  }

  private renderBlank(): void {
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  private renderDisplay(): void {
    const buf = this.display.getBuffer();
    const imageData = this.offCtx.createImageData(WIDTH, HEIGHT);
    const pixels = imageData.data;

    for (let i = 0; i < WIDTH * HEIGHT; i++) {
      const on = buf[i] === 1;
      const base = i * 4;
      pixels[base]     = on ? 0xFF : 0x00; // R
      pixels[base + 1] = on ? 0xFF : 0x00; // G
      pixels[base + 2] = on ? 0xFF : 0x00; // B
      pixels[base + 3] = 0xFF;             // A
    }

    this.offCtx.putImageData(imageData, 0, 0);
    this.ctx.drawImage(this.offscreen, 0, 0, CANVAS_W, CANVAS_H);
  }
}

// Auto-init when loaded as module in browser
new Emulator();
