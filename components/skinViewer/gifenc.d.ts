declare module 'gifenc' {
  export function GIFEncoder(options?: { auto?: boolean }): {
    writeFrame(index: Uint8Array, width: number, height: number, options?: {
      palette?: number[][]; delay?: number; transparent?: boolean; transparentIndex?: number;
      repeat?: number; dispose?: number; first?: boolean;
    }): void;
    finish(): void;
    bytes(): Uint8Array;
  };
  export function quantize(rgba: Uint8Array, maxColors: number, options?: {
    format?: 'rgb565' | 'rgb444' | 'rgba4444'; oneBitAlpha?: boolean | number;
    clearAlpha?: boolean; clearAlphaThreshold?: number; clearAlphaColor?: number;
  }): number[][];
  export function applyPalette(rgba: Uint8Array, palette: number[][], format?: 'rgb565' | 'rgb444' | 'rgba4444'): Uint8Array;
}
