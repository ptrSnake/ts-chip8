import { WIDTH, HEIGHT } from "./constants.ts";

export class Display {
  readonly buffer: Uint8Array;
  private dirty = false;

  constructor() {
    this.buffer = new Uint8Array(WIDTH * HEIGHT);
  }

  clear(): void {
    this.buffer.fill(0);
    this.dirty = true;
  }

  // XOR sprite onto display at (x, y), wrapping at edges.
  // Returns true if any pixel was turned off (collision).
  drawSprite(x: number, y: number, sprite: Uint8Array): boolean {
    let collision = false;
    for (let row = 0; row < sprite.length; row++) {
      const byte = sprite[row];
      for (let col = 0; col < 8; col++) {
        if ((byte & (0x80 >> col)) === 0) continue;
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

  isDirty(): boolean {
    return this.dirty;
  }

  markClean(): void {
    this.dirty = false;
  }

  getBuffer(): Uint8Array {
    return this.buffer;
  }
}
