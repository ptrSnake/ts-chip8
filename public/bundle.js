// src/constants.ts
var FONTSET = new Uint8Array([
  240,
  144,
  144,
  144,
  240,
  // 0
  32,
  96,
  32,
  32,
  112,
  // 1
  240,
  16,
  240,
  128,
  240,
  // 2
  240,
  16,
  240,
  16,
  240,
  // 3
  144,
  144,
  240,
  16,
  16,
  // 4
  240,
  128,
  240,
  16,
  240,
  // 5
  240,
  128,
  240,
  144,
  240,
  // 6
  240,
  16,
  32,
  64,
  64,
  // 7
  240,
  144,
  240,
  144,
  240,
  // 8
  240,
  144,
  240,
  16,
  240,
  // 9
  240,
  144,
  240,
  144,
  144,
  // A
  224,
  144,
  224,
  144,
  224,
  // B
  240,
  128,
  128,
  128,
  240,
  // C
  224,
  144,
  144,
  144,
  224,
  // D
  240,
  128,
  240,
  128,
  240,
  // E
  240,
  128,
  240,
  128,
  128
  // F
]);
var FONT_START = 80;
var ROM_START = 512;
var MEMORY_SIZE = 4096;
var WIDTH = 64;
var HEIGHT = 32;
var CPU_HZ = 500;
var TIMER_HZ = 60;
var KEY_MAP = {
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 12,
  "q": 4,
  "w": 5,
  "e": 6,
  "r": 13,
  "a": 7,
  "s": 8,
  "d": 9,
  "f": 14,
  "z": 10,
  "x": 0,
  "c": 11,
  "v": 15
};

// src/cpu.ts
var CPU = class {
  memory;
  V;
  // 16 general-purpose registers V0–VF
  I;
  // index register
  PC;
  // program counter
  stack;
  SP;
  // stack pointer
  delayTimer;
  soundTimer;
  halted;
  // waiting for key press (FX0A)
  waitKeyRegister;
  display;
  keyboard;
  constructor(display, keyboard) {
    this.display = display;
    this.keyboard = keyboard;
    this.memory = new Uint8Array(MEMORY_SIZE);
    this.V = new Uint8Array(16);
    this.I = 0;
    this.PC = ROM_START;
    this.stack = new Uint16Array(16);
    this.SP = 0;
    this.delayTimer = 0;
    this.soundTimer = 0;
    this.halted = false;
    this.waitKeyRegister = 0;
    this.memory.set(FONTSET, FONT_START);
  }
  reset() {
    this.memory.fill(0);
    this.memory.set(FONTSET, FONT_START);
    this.V.fill(0);
    this.I = 0;
    this.PC = ROM_START;
    this.stack.fill(0);
    this.SP = 0;
    this.delayTimer = 0;
    this.soundTimer = 0;
    this.halted = false;
    this.waitKeyRegister = 0;
    this.display.clear();
  }
  loadROM(data) {
    this.reset();
    this.memory.set(data, ROM_START);
  }
  tickTimers() {
    if (this.delayTimer > 0) this.delayTimer--;
    if (this.soundTimer > 0) this.soundTimer--;
  }
  step() {
    if (this.halted) {
      const key = this.keyboard.getPressedKey();
      if (key !== null) {
        this.V[this.waitKeyRegister] = key;
        this.halted = false;
      }
      return;
    }
    const opcode = this.memory[this.PC] << 8 | this.memory[this.PC + 1];
    this.PC += 2;
    const nnn = opcode & 4095;
    const n = opcode & 15;
    const x = opcode >> 8 & 15;
    const y = opcode >> 4 & 15;
    const kk = opcode & 255;
    switch (opcode & 61440) {
      case 0:
        if (opcode === 224) {
          this.display.clear();
        } else if (opcode === 238) {
          this.PC = this.stack[--this.SP];
        }
        break;
      case 4096:
        this.PC = nnn;
        break;
      case 8192:
        this.stack[this.SP++] = this.PC;
        this.PC = nnn;
        break;
      case 12288:
        if (this.V[x] === kk) this.PC += 2;
        break;
      case 16384:
        if (this.V[x] !== kk) this.PC += 2;
        break;
      case 20480:
        if (this.V[x] === this.V[y]) this.PC += 2;
        break;
      case 24576:
        this.V[x] = kk;
        break;
      case 28672:
        this.V[x] = this.V[x] + kk & 255;
        break;
      case 32768:
        this.executeArithmetic(x, y, n);
        break;
      case 36864:
        if (this.V[x] !== this.V[y]) this.PC += 2;
        break;
      case 40960:
        this.I = nnn;
        break;
      case 45056:
        this.PC = nnn + this.V[0] & 65535;
        break;
      case 49152:
        this.V[x] = (Math.random() * 256 | 0) & kk;
        break;
      case 53248: {
        const sprite = this.memory.slice(this.I, this.I + n);
        const collision = this.display.drawSprite(this.V[x], this.V[y], sprite);
        this.V[15] = collision ? 1 : 0;
        break;
      }
      case 57344:
        if (kk === 158) {
          if (this.keyboard.isPressed(this.V[x])) this.PC += 2;
        } else if (kk === 161) {
          if (!this.keyboard.isPressed(this.V[x])) this.PC += 2;
        }
        break;
      case 61440:
        this.executeMisc(x, kk);
        break;
    }
  }
  executeArithmetic(x, y, n) {
    switch (n) {
      case 0:
        this.V[x] = this.V[y];
        break;
      case 1:
        this.V[x] |= this.V[y];
        this.V[15] = 0;
        break;
      case 2:
        this.V[x] &= this.V[y];
        this.V[15] = 0;
        break;
      case 3:
        this.V[x] ^= this.V[y];
        this.V[15] = 0;
        break;
      case 4: {
        const sum = this.V[x] + this.V[y];
        this.V[x] = sum & 255;
        this.V[15] = sum > 255 ? 1 : 0;
        break;
      }
      case 5: {
        const borrow = this.V[x] >= this.V[y] ? 1 : 0;
        this.V[x] = this.V[x] - this.V[y] & 255;
        this.V[15] = borrow;
        break;
      }
      case 6: {
        const lsb = this.V[x] & 1;
        this.V[x] >>= 1;
        this.V[15] = lsb;
        break;
      }
      case 7: {
        const borrow = this.V[y] >= this.V[x] ? 1 : 0;
        this.V[x] = this.V[y] - this.V[x] & 255;
        this.V[15] = borrow;
        break;
      }
      case 14: {
        const msb = this.V[x] >> 7 & 1;
        this.V[x] = this.V[x] << 1 & 255;
        this.V[15] = msb;
        break;
      }
    }
  }
  executeMisc(x, kk) {
    switch (kk) {
      case 7:
        this.V[x] = this.delayTimer;
        break;
      case 10:
        this.halted = true;
        this.waitKeyRegister = x;
        break;
      case 21:
        this.delayTimer = this.V[x];
        break;
      case 24:
        this.soundTimer = this.V[x];
        break;
      case 30:
        this.I = this.I + this.V[x] & 65535;
        break;
      case 41:
        this.I = FONT_START + (this.V[x] & 15) * 5;
        break;
      case 51: {
        const val = this.V[x];
        this.memory[this.I] = Math.floor(val / 100);
        this.memory[this.I + 1] = Math.floor(val / 10) % 10;
        this.memory[this.I + 2] = val % 10;
        break;
      }
      case 85:
        for (let i = 0; i <= x; i++) {
          this.memory[this.I + i] = this.V[i];
        }
        break;
      case 101:
        for (let i = 0; i <= x; i++) {
          this.V[i] = this.memory[this.I + i];
        }
        break;
    }
  }
};

// src/display.ts
var Display = class {
  buffer;
  dirty = false;
  constructor() {
    this.buffer = new Uint8Array(WIDTH * HEIGHT);
  }
  clear() {
    this.buffer.fill(0);
    this.dirty = true;
  }
  // XOR sprite onto display at (x, y), wrapping at edges.
  // Returns true if any pixel was turned off (collision).
  drawSprite(x, y, sprite) {
    let collision = false;
    for (let row = 0; row < sprite.length; row++) {
      const byte = sprite[row];
      for (let col = 0; col < 8; col++) {
        if ((byte & 128 >> col) === 0) continue;
        const px = (x + col) % WIDTH;
        const py = (y + row) % HEIGHT;
        const idx = py * WIDTH + px;
        if (this.buffer[idx] === 1) collision = true;
        this.buffer[idx] ^= 1;
      }
    }
    this.dirty = true;
    return collision;
  }
  isDirty() {
    return this.dirty;
  }
  markClean() {
    this.dirty = false;
  }
  getBuffer() {
    return this.buffer;
  }
};

// src/keyboard.ts
var Keyboard = class {
  keys;
  constructor() {
    this.keys = new Uint8Array(16);
  }
  setKey(key, pressed) {
    this.keys[key] = pressed ? 1 : 0;
  }
  isPressed(key) {
    return this.keys[key] === 1;
  }
  // Returns the index of the first pressed key, or null if none.
  getPressedKey() {
    for (let i = 0; i < 16; i++) {
      if (this.keys[i] === 1) return i;
    }
    return null;
  }
};

// src/audio.ts
var Audio = class {
  ctx = null;
  oscillator = null;
  start() {
    if (this.oscillator) return;
    if (!this.ctx) this.ctx = new AudioContext();
    this.oscillator = this.ctx.createOscillator();
    this.oscillator.type = "square";
    this.oscillator.frequency.setValueAtTime(440, this.ctx.currentTime);
    this.oscillator.connect(this.ctx.destination);
    this.oscillator.start();
  }
  stop() {
    if (!this.oscillator) return;
    this.oscillator.stop();
    this.oscillator.disconnect();
    this.oscillator = null;
  }
};

// src/rom.ts
function loadFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}
async function loadFromURL(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ROM: ${res.statusText}`);
  return new Uint8Array(await res.arrayBuffer());
}

// src/emulator.ts
var SCALE = 10;
var CANVAS_W = WIDTH * SCALE;
var CANVAS_H = HEIGHT * SCALE;
var Emulator = class {
  display;
  keyboard;
  audio;
  cpu;
  canvas;
  ctx;
  offscreen;
  offCtx;
  running = false;
  romLoaded = false;
  lastTimestamp = 0;
  cpuAccumulator = 0;
  cpuPeriodMs;
  timerAccumulator = 0;
  timerPeriodMs = 1e3 / TIMER_HZ;
  rafId = 0;
  constructor() {
    this.display = new Display();
    this.keyboard = new Keyboard();
    this.audio = new Audio();
    this.cpu = new CPU(this.display, this.keyboard);
    this.cpuPeriodMs = 1e3 / CPU_HZ;
    this.canvas = document.getElementById("screen");
    this.ctx = this.canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
    this.offscreen = new OffscreenCanvas(WIDTH, HEIGHT);
    this.offCtx = this.offscreen.getContext("2d");
    this.wireDom();
    this.renderBlank();
  }
  wireDom() {
    const fileInput = document.getElementById("rom-file");
    const startBtn = document.getElementById("btn-start");
    const pauseBtn = document.getElementById("btn-pause");
    const resetBtn = document.getElementById("btn-reset");
    const speedSlider = document.getElementById("speed");
    const speedLabel = document.getElementById("speed-label");
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
      this.cpuPeriodMs = 1e3 / hz;
      speedLabel.textContent = `${hz} Hz`;
    });
    document.addEventListener("keydown", (e) => {
      const key = KEY_MAP[e.key.toLowerCase()];
      if (key !== void 0) {
        e.preventDefault();
        this.keyboard.setKey(key, true);
      }
    });
    document.addEventListener("keyup", (e) => {
      const key = KEY_MAP[e.key.toLowerCase()];
      if (key !== void 0) {
        this.keyboard.setKey(key, false);
      }
    });
    const romSelect = document.getElementById("rom-select");
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
  start() {
    if (this.running) return;
    this.running = true;
    this.lastTimestamp = 0;
    this.cpuAccumulator = 0;
    this.timerAccumulator = 0;
    this.rafId = requestAnimationFrame(this.loop.bind(this));
  }
  stop() {
    this.running = false;
    this.audio.stop();
    cancelAnimationFrame(this.rafId);
  }
  loop(timestamp) {
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
  renderBlank() {
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
  renderDisplay() {
    const buf = this.display.getBuffer();
    const imageData = this.offCtx.createImageData(WIDTH, HEIGHT);
    const pixels = imageData.data;
    for (let i = 0; i < WIDTH * HEIGHT; i++) {
      const on = buf[i] === 1;
      const base = i * 4;
      pixels[base] = on ? 255 : 0;
      pixels[base + 1] = on ? 255 : 0;
      pixels[base + 2] = on ? 255 : 0;
      pixels[base + 3] = 255;
    }
    this.offCtx.putImageData(imageData, 0, 0);
    this.ctx.drawImage(this.offscreen, 0, 0, CANVAS_W, CANVAS_H);
  }
};
new Emulator();
export {
  Emulator
};
