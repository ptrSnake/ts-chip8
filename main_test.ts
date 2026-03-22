import { assertEquals } from "@std/assert";
import { CPU } from "./src/cpu.ts";
import { Display } from "./src/display.ts";
import { Keyboard } from "./src/keyboard.ts";

function makeCPU(): CPU {
  return new CPU(new Display(), new Keyboard());
}

function loadOpcodes(cpu: CPU, ...opcodes: number[]): void {
  const rom = new Uint8Array(opcodes.length * 2);
  for (let i = 0; i < opcodes.length; i++) {
    rom[i * 2]     = (opcodes[i] >> 8) & 0xFF;
    rom[i * 2 + 1] = opcodes[i] & 0xFF;
  }
  cpu.loadROM(rom);
}

Deno.test("6XKK: LD Vx, byte", () => {
  const cpu = makeCPU();
  loadOpcodes(cpu, 0x6A42); // LD VA, 0x42
  cpu.step();
  assertEquals(cpu.V[0xA], 0x42);
});

Deno.test("7XKK: ADD Vx, byte wraps at 8-bit", () => {
  const cpu = makeCPU();
  loadOpcodes(cpu, 0x6001, 0x70FF); // LD V0, 1; ADD V0, 0xFF
  cpu.step(); cpu.step();
  assertEquals(cpu.V[0], 0x00); // 1 + 255 = 256 → wraps to 0
});

Deno.test("8XY0: LD Vx, Vy", () => {
  const cpu = makeCPU();
  loadOpcodes(cpu, 0x6133, 0x8010); // LD V1, 0x33; LD V0, V1
  cpu.step(); cpu.step();
  assertEquals(cpu.V[0], 0x33);
});

Deno.test("8XY4: ADD Vx, Vy sets carry", () => {
  const cpu = makeCPU();
  loadOpcodes(cpu, 0x60FF, 0x6101, 0x8014); // V0=0xFF, V1=0x01, ADD V0,V1
  cpu.step(); cpu.step(); cpu.step();
  assertEquals(cpu.V[0], 0x00);
  assertEquals(cpu.V[0xF], 1); // carry set
});

Deno.test("8XY4: ADD Vx, Vy no carry", () => {
  const cpu = makeCPU();
  loadOpcodes(cpu, 0x6001, 0x6101, 0x8014);
  cpu.step(); cpu.step(); cpu.step();
  assertEquals(cpu.V[0], 0x02);
  assertEquals(cpu.V[0xF], 0);
});

Deno.test("8XY5: SUB Vx, Vy sets NOT_borrow", () => {
  const cpu = makeCPU();
  loadOpcodes(cpu, 0x6005, 0x6103, 0x8015);
  cpu.step(); cpu.step(); cpu.step();
  assertEquals(cpu.V[0], 0x02);
  assertEquals(cpu.V[0xF], 1); // no borrow
});

Deno.test("8XY5: SUB Vx, Vy with borrow", () => {
  const cpu = makeCPU();
  loadOpcodes(cpu, 0x6001, 0x6105, 0x8015);
  cpu.step(); cpu.step(); cpu.step();
  assertEquals(cpu.V[0], 0xFC); // (1-5) & 0xFF
  assertEquals(cpu.V[0xF], 0); // borrow
});

Deno.test("8XY6: SHR Vx", () => {
  const cpu = makeCPU();
  loadOpcodes(cpu, 0x6005, 0x8006); // V0=5 (0b101), SHR
  cpu.step(); cpu.step();
  assertEquals(cpu.V[0], 2);
  assertEquals(cpu.V[0xF], 1); // LSB was 1
});

Deno.test("8XYE: SHL Vx", () => {
  const cpu = makeCPU();
  loadOpcodes(cpu, 0x6081, 0x800E); // V0=0x81=0b10000001, SHL
  cpu.step(); cpu.step();
  assertEquals(cpu.V[0], 0x02); // shifted, wraps
  assertEquals(cpu.V[0xF], 1);  // MSB was 1
});

Deno.test("3XKK: SE Vx, byte — skip", () => {
  const cpu = makeCPU();
  loadOpcodes(cpu, 0x6010, 0x3010, 0x6020, 0x6030);
  // LD V0,0x10; SE V0,0x10 (should skip); LD V0,0x20; LD V0,0x30
  cpu.step(); // PC=0x202
  cpu.step(); // PC=0x206 (skipped 0x204)
  cpu.step(); // executes 0x6030
  assertEquals(cpu.V[0], 0x30);
});

Deno.test("3XKK: SE Vx, byte — no skip", () => {
  const cpu = makeCPU();
  loadOpcodes(cpu, 0x6010, 0x3011, 0x6020, 0x6030);
  cpu.step(); cpu.step(); cpu.step();
  assertEquals(cpu.V[0], 0x20);
});

Deno.test("4XKK: SNE Vx, byte — skip when not equal", () => {
  const cpu = makeCPU();
  loadOpcodes(cpu, 0x6010, 0x4011, 0x6020, 0x6030);
  cpu.step(); cpu.step(); cpu.step();
  assertEquals(cpu.V[0], 0x30);
});

Deno.test("1NNN: JP", () => {
  const cpu = makeCPU();
  loadOpcodes(cpu, 0x1204); // JP 0x204 (jump over next opcode)
  // Place a LD V0 at 0x204
  cpu.memory[0x204] = 0x60;
  cpu.memory[0x205] = 0xAB;
  cpu.step(); // jump
  cpu.step(); // LD V0, 0xAB
  assertEquals(cpu.V[0], 0xAB);
});

Deno.test("2NNN/00EE: CALL/RET", () => {
  const cpu = makeCPU();
  // At 0x200: CALL 0x206
  // At 0x202: LD V1, 0x11 (should be skipped)
  // At 0x204: LD V1, 0x22 (should be skipped)
  // At 0x206: LD V0, 0x42; RET
  cpu.memory[0x200] = 0x22; cpu.memory[0x201] = 0x06;
  cpu.memory[0x202] = 0x61; cpu.memory[0x203] = 0x11;
  cpu.memory[0x204] = 0x61; cpu.memory[0x205] = 0x22;
  cpu.memory[0x206] = 0x60; cpu.memory[0x207] = 0x42;
  cpu.memory[0x208] = 0x00; cpu.memory[0x209] = 0xEE;
  cpu.PC = 0x200;
  cpu.step(); // CALL 0x206 → PC=0x206, stack[0]=0x202
  cpu.step(); // LD V0, 0x42
  cpu.step(); // RET → PC=0x202
  assertEquals(cpu.V[0], 0x42);
  assertEquals(cpu.PC, 0x202);
});

Deno.test("ANNN: LD I, nnn", () => {
  const cpu = makeCPU();
  loadOpcodes(cpu, 0xA123);
  cpu.step();
  assertEquals(cpu.I, 0x123);
});

Deno.test("FX07/FX15: delay timer", () => {
  const cpu = makeCPU();
  loadOpcodes(cpu, 0x6020, 0xF015, 0xF107); // V0=0x20, DT=V0, V1=DT
  cpu.step(); cpu.step(); cpu.step();
  assertEquals(cpu.V[1], 0x20);
});

Deno.test("FX33: BCD", () => {
  const cpu = makeCPU();
  loadOpcodes(cpu, 0x60E7, 0xA300, 0xF033); // V0=231, I=0x300, BCD V0
  cpu.step(); cpu.step(); cpu.step();
  assertEquals(cpu.memory[0x300], 2);
  assertEquals(cpu.memory[0x301], 3);
  assertEquals(cpu.memory[0x302], 1);
});

Deno.test("FX55/FX65: store and load registers", () => {
  const cpu = makeCPU();
  // Set V0=1, V1=2, V2=3; store; clear; load; verify
  loadOpcodes(cpu,
    0x6001, 0x6102, 0x6203, // set V0,V1,V2
    0xA300,                  // I = 0x300
    0xF255,                  // STR V0–V2
    0x6000, 0x6100, 0x6200, // clear V0,V1,V2
    0xA300,                  // I = 0x300
    0xF265,                  // LDR V0–V2
  );
  for (let i = 0; i < 10; i++) cpu.step();
  assertEquals(cpu.V[0], 1);
  assertEquals(cpu.V[1], 2);
  assertEquals(cpu.V[2], 3);
  // I should NOT have been modified (CHIP-48 behavior)
  assertEquals(cpu.I, 0x300);
});

Deno.test("FX29: LD F, Vx sets I to font address", () => {
  const cpu = makeCPU();
  loadOpcodes(cpu, 0x6005, 0xF029); // V0=5, LD F, V0
  cpu.step(); cpu.step();
  assertEquals(cpu.I, 0x050 + 5 * 5); // FONT_START + 5*5
});

Deno.test("CXKK: RND produces value masked by kk", () => {
  const cpu = makeCPU();
  loadOpcodes(cpu, 0xC00F); // RND V0, 0x0F
  cpu.step();
  assertEquals(cpu.V[0] & ~0x0F, 0); // upper bits must be 0
});

Deno.test("00E0: CLS clears display", () => {
  const cpu = makeCPU();
  const display = (cpu as unknown as { display: Display })["display"] ??
    new Display();
  // Manually set a pixel
  display["buffer"][0] = 1;
  loadOpcodes(cpu, 0x00E0);
  cpu.step();
  assertEquals(display.getBuffer()[0], 0);
});

Deno.test("DXYN: draw sprite sets collision flag", () => {
  const cpu = makeCPU();
  // LD I, 0x300; LD V0,0; LD V1,0; DRW V0,V1,1; DRW V0,V1,1
  loadOpcodes(cpu, 0xA300, 0x6000, 0x6100, 0xD011, 0xD011);
  // Set sprite AFTER loadROM (which is called inside loadOpcodes via reset)
  cpu.memory[0x300] = 0xFF;
  cpu.step(); cpu.step(); cpu.step();
  cpu.step(); // first draw — no collision
  assertEquals(cpu.V[0xF], 0);
  cpu.step(); // second draw — collision
  assertEquals(cpu.V[0xF], 1);
});

Deno.test("tickTimers decrements delay and sound timers", () => {
  const cpu = makeCPU();
  cpu.delayTimer = 3;
  cpu.soundTimer = 1;
  cpu.tickTimers();
  assertEquals(cpu.delayTimer, 2);
  assertEquals(cpu.soundTimer, 0);
  cpu.tickTimers();
  assertEquals(cpu.delayTimer, 1);
  assertEquals(cpu.soundTimer, 0); // clamp at 0
});
