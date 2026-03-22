import { FONTSET, FONT_START, ROM_START, MEMORY_SIZE } from "./constants.ts";
import { Display } from "./display.ts";
import { Keyboard } from "./keyboard.ts";

export class CPU {
  memory: Uint8Array;
  V: Uint8Array;        // 16 general-purpose registers V0–VF
  I: number;            // index register
  PC: number;           // program counter
  stack: Uint16Array;
  SP: number;           // stack pointer
  delayTimer: number;
  soundTimer: number;
  halted: boolean;      // waiting for key press (FX0A)
  waitKeyRegister: number;

  private display: Display;
  private keyboard: Keyboard;

  constructor(display: Display, keyboard: Keyboard) {
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

    // Load fontset into memory
    this.memory.set(FONTSET, FONT_START);
  }

  reset(): void {
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

  loadROM(data: Uint8Array): void {
    this.reset();
    this.memory.set(data, ROM_START);
  }

  tickTimers(): void {
    if (this.delayTimer > 0) this.delayTimer--;
    if (this.soundTimer > 0) this.soundTimer--;
  }

  step(): void {
    // Handle FX0A wait-for-key
    if (this.halted) {
      const key = this.keyboard.getPressedKey();
      if (key !== null) {
        this.V[this.waitKeyRegister] = key;
        this.halted = false;
      }
      return;
    }

    const opcode = (this.memory[this.PC] << 8) | this.memory[this.PC + 1];
    this.PC += 2;

    const nnn = opcode & 0x0FFF;
    const n   = opcode & 0x000F;
    const x   = (opcode >> 8) & 0x0F;
    const y   = (opcode >> 4) & 0x0F;
    const kk  = opcode & 0x00FF;

    switch (opcode & 0xF000) {
      case 0x0000:
        if (opcode === 0x00E0) {
          // CLS
          this.display.clear();
        } else if (opcode === 0x00EE) {
          // RET
          this.PC = this.stack[--this.SP];
        }
        break;

      case 0x1000:
        // JP nnn
        this.PC = nnn;
        break;

      case 0x2000:
        // CALL nnn
        this.stack[this.SP++] = this.PC;
        this.PC = nnn;
        break;

      case 0x3000:
        // SE Vx, kk
        if (this.V[x] === kk) this.PC += 2;
        break;

      case 0x4000:
        // SNE Vx, kk
        if (this.V[x] !== kk) this.PC += 2;
        break;

      case 0x5000:
        // SE Vx, Vy
        if (this.V[x] === this.V[y]) this.PC += 2;
        break;

      case 0x6000:
        // LD Vx, kk
        this.V[x] = kk;
        break;

      case 0x7000:
        // ADD Vx, kk
        this.V[x] = (this.V[x] + kk) & 0xFF;
        break;

      case 0x8000:
        this.executeArithmetic(x, y, n);
        break;

      case 0x9000:
        // SNE Vx, Vy
        if (this.V[x] !== this.V[y]) this.PC += 2;
        break;

      case 0xA000:
        // LD I, nnn
        this.I = nnn;
        break;

      case 0xB000:
        // JP V0, nnn
        this.PC = (nnn + this.V[0]) & 0xFFFF;
        break;

      case 0xC000:
        // RND Vx, kk
        this.V[x] = (Math.random() * 256 | 0) & kk;
        break;

      case 0xD000: {
        // DRW Vx, Vy, n
        const sprite = this.memory.slice(this.I, this.I + n);
        const collision = this.display.drawSprite(this.V[x], this.V[y], sprite);
        this.V[0xF] = collision ? 1 : 0;
        break;
      }

      case 0xE000:
        if (kk === 0x9E) {
          // SKP Vx
          if (this.keyboard.isPressed(this.V[x])) this.PC += 2;
        } else if (kk === 0xA1) {
          // SKNP Vx
          if (!this.keyboard.isPressed(this.V[x])) this.PC += 2;
        }
        break;

      case 0xF000:
        this.executeMisc(x, kk);
        break;
    }
  }

  private executeArithmetic(x: number, y: number, n: number): void {
    switch (n) {
      case 0x0:
        // LD Vx, Vy
        this.V[x] = this.V[y];
        break;
      case 0x1:
        // OR Vx, Vy
        this.V[x] |= this.V[y];
        this.V[0xF] = 0;
        break;
      case 0x2:
        // AND Vx, Vy
        this.V[x] &= this.V[y];
        this.V[0xF] = 0;
        break;
      case 0x3:
        // XOR Vx, Vy
        this.V[x] ^= this.V[y];
        this.V[0xF] = 0;
        break;
      case 0x4: {
        // ADD Vx, Vy
        const sum = this.V[x] + this.V[y];
        this.V[x] = sum & 0xFF;
        this.V[0xF] = sum > 0xFF ? 1 : 0;
        break;
      }
      case 0x5: {
        // SUB Vx, Vy
        const borrow = this.V[x] >= this.V[y] ? 1 : 0;
        this.V[x] = (this.V[x] - this.V[y]) & 0xFF;
        this.V[0xF] = borrow;
        break;
      }
      case 0x6: {
        // SHR Vx (modern: ignore Vy)
        const lsb = this.V[x] & 0x1;
        this.V[x] >>= 1;
        this.V[0xF] = lsb;
        break;
      }
      case 0x7: {
        // SUBN Vx, Vy
        const borrow = this.V[y] >= this.V[x] ? 1 : 0;
        this.V[x] = (this.V[y] - this.V[x]) & 0xFF;
        this.V[0xF] = borrow;
        break;
      }
      case 0xE: {
        // SHL Vx (modern: ignore Vy)
        const msb = (this.V[x] >> 7) & 0x1;
        this.V[x] = (this.V[x] << 1) & 0xFF;
        this.V[0xF] = msb;
        break;
      }
    }
  }

  private executeMisc(x: number, kk: number): void {
    switch (kk) {
      case 0x07:
        // LD Vx, DT
        this.V[x] = this.delayTimer;
        break;
      case 0x0A:
        // LD Vx, K (wait for key press)
        this.halted = true;
        this.waitKeyRegister = x;
        break;
      case 0x15:
        // LD DT, Vx
        this.delayTimer = this.V[x];
        break;
      case 0x18:
        // LD ST, Vx
        this.soundTimer = this.V[x];
        break;
      case 0x1E:
        // ADD I, Vx
        this.I = (this.I + this.V[x]) & 0xFFFF;
        break;
      case 0x29:
        // LD F, Vx (set I to font sprite address)
        this.I = FONT_START + (this.V[x] & 0xF) * 5;
        break;
      case 0x33: {
        // LD B, Vx (BCD)
        const val = this.V[x];
        this.memory[this.I]     = Math.floor(val / 100);
        this.memory[this.I + 1] = Math.floor(val / 10) % 10;
        this.memory[this.I + 2] = val % 10;
        break;
      }
      case 0x55:
        // LD [I], Vx (store V0–Vx, do NOT increment I)
        for (let i = 0; i <= x; i++) {
          this.memory[this.I + i] = this.V[i];
        }
        break;
      case 0x65:
        // LD Vx, [I] (load V0–Vx, do NOT increment I)
        for (let i = 0; i <= x; i++) {
          this.V[i] = this.memory[this.I + i];
        }
        break;
    }
  }
}
