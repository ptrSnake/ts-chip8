export class Keyboard {
  readonly keys: Uint8Array;

  constructor() {
    this.keys = new Uint8Array(16);
  }

  setKey(key: number, pressed: boolean): void {
    this.keys[key] = pressed ? 1 : 0;
  }

  isPressed(key: number): boolean {
    return this.keys[key] === 1;
  }

  // Returns the index of the first pressed key, or null if none.
  getPressedKey(): number | null {
    for (let i = 0; i < 16; i++) {
      if (this.keys[i] === 1) return i;
    }
    return null;
  }
}
