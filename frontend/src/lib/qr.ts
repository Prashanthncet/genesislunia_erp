"use client";

/**
 * Pure TypeScript ISO/IEC 18004 QR Code generator (Byte mode, Error Correction Level L, Versions 1–10).
 * Generates a real, scannable QR code PNG data URL right in the browser Using <canvas>,
 * so QR code display and PNG download work 100% offline/client-side without requiring a backend endpoint.
 */

// Version 1..10 total data codewords and ECC codewords per block for Level L:
// [version, totalDataBytes, eccBytesPerBlock, numBlocks]
const VERSION_TABLE: readonly [number, number, number, number][] = [
  [1, 19, 7, 1],
  [2, 34, 10, 1],
  [3, 55, 15, 1],
  [4, 80, 20, 1],
  [5, 108, 26, 1],
  [6, 136, 18, 2],
  [7, 156, 20, 2],
  [8, 194, 24, 2],
  [9, 232, 30, 2],
  [10, 274, 18, 4],
];

const ALIGNMENT_POS: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

// GF(256) log/exp tables with primitive polynomial 0x11d
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: Uint8Array, eccLen: number): Uint8Array {
  const gen = rsGeneratorPoly(eccLen);
  const rem = new Uint8Array(eccLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[eccLen - 1] = 0;
    for (let j = 0; j < eccLen; j++) {
      rem[j] ^= gfMul(gen[j + 1], factor);
    }
  }
  return rem;
}

function encodeCodewords(text: string): { version: number; codewords: Uint8Array } {
  const utf8 = new TextEncoder().encode(text);
  const chosen = VERSION_TABLE.find(([v, cap]) => {
    const headerBits = v <= 9 ? 12 : 20;
    return utf8.length * 8 + headerBits + 4 <= cap * 8;
  }) ?? VERSION_TABLE[VERSION_TABLE.length - 1];

  const [version, totalDataBytes, eccPerBlock, numBlocks] = chosen;
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };

  // Byte mode indicator (0100)
  pushBits(0b0100, 4);
  pushBits(utf8.length, version <= 9 ? 8 : 16);
  for (const b of utf8) pushBits(b, 8);

  // Terminator (up to 4 zeros)
  const maxBits = totalDataBytes * 8;
  for (let i = 0; i < 4 && bits.length < maxBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const dataBytes = new Uint8Array(totalDataBytes);
  for (let i = 0; i < bits.length / 8 && i < totalDataBytes; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i * 8 + b];
    dataBytes[i] = byte;
  }
  const pad = [0xec, 0x11];
  for (let i = Math.floor(bits.length / 8); i < totalDataBytes; i++) {
    dataBytes[i] = pad[(i - Math.floor(bits.length / 8)) % 2];
  }

  // Split into blocks and compute ECC
  const baseBlockSize = Math.floor(totalDataBytes / numBlocks);
  const extraBlocks = totalDataBytes % numBlocks;
  const dataBlocks: Uint8Array[] = [];
  const eccBlocks: Uint8Array[] = [];
  let offset = 0;
  for (let b = 0; b < numBlocks; b++) {
    const len = baseBlockSize + (b >= numBlocks - extraBlocks ? 1 : 0);
    const blk = dataBytes.slice(offset, offset + len);
    offset += len;
    dataBlocks.push(blk);
    eccBlocks.push(rsEncode(blk, eccPerBlock));
  }

  const out: number[] = [];
  const maxDataLen = baseBlockSize + (extraBlocks > 0 ? 1 : 0);
  for (let i = 0; i < maxDataLen; i++) {
    for (let b = 0; b < numBlocks; b++) {
      if (i < dataBlocks[b].length) out.push(dataBlocks[b][i]);
    }
  }
  for (let i = 0; i < eccPerBlock; i++) {
    for (let b = 0; b < numBlocks; b++) {
      out.push(eccBlocks[b][i]);
    }
  }

  return { version, codewords: new Uint8Array(out) };
}

export function buildQrMatrix(text: string): boolean[][] {
  const { version, codewords } = encodeCodewords(text);
  const size = version * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunc: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const setFunc = (r: number, c: number, dark: boolean) => {
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    modules[r][c] = dark;
    isFunc[r][c] = true;
  };

  // Finder patterns + separators
  const drawFinder = (top: number, left: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = top + dr;
        const c = left + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const onBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const inCenter = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setFunc(r, c, inOuter && (onBorder || inCenter));
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFunc(6, i, i % 2 === 0);
    setFunc(i, 6, i % 2 === 0);
  }

  // Alignment patterns
  const pos = ALIGNMENT_POS[version] ?? [];
  for (const r of pos) {
    for (const c of pos) {
      if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          setFunc(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
        }
      }
    }
  }

  // Reserve format info areas & dark module
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      setFunc(8, i, false);
      setFunc(i, 8, false);
    }
  }
  for (let i = 0; i < 8; i++) {
    setFunc(8, size - 1 - i, false);
    setFunc(size - 1 - i, 8, false);
  }
  setFunc(size - 8, 8, true);

  // Place data bits in upward/downward 2-column zigzag
  let bitIdx = 0;
  const totalBits = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      const r = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (isFunc[r][c]) continue;
        let dark = false;
        if (bitIdx < totalBits) {
          dark = ((codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1) === 1;
          bitIdx++;
        }
        // Apply Mask 0: (r + c) % 2 === 0
        if ((r + c) % 2 === 0) dark = !dark;
        modules[r][c] = dark;
      }
    }
  }

  // Format information for Level L (01) + Mask 0 (000) -> precomputed BCH bits = 0x77c4
  const formatBits = 0x77c4;
  const getBit = (i: number) => ((formatBits >> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) setFunc(8, i, getBit(i));
  setFunc(8, 7, getBit(6));
  setFunc(8, 8, getBit(7));
  setFunc(7, 8, getBit(8));
  for (let i = 9; i < 15; i++) setFunc(14 - i, 8, getBit(i));
  for (let i = 0; i < 8; i++) setFunc(size - 1 - i, 8, getBit(i));
  for (let i = 8; i < 15; i++) setFunc(8, size - 15 + i, getBit(i));

  return modules;
}

/**
 * Generates a PNG data URL (`data:image/png;base64,...`) for any URL/string on the client.
 */
export function makeQrDataUrl(text: string, pixelSize = 240): string {
  if (!text || typeof document === "undefined") return "";
  try {
    const matrix = buildQrMatrix(text);
    const n = matrix.length;
    const quiet = 2;
    const total = n + quiet * 2;
    const scale = Math.max(4, Math.floor(pixelSize / total));
    const canvas = document.createElement("canvas");
    canvas.width = total * scale;
    canvas.height = total * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0f172a";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (matrix[r][c]) {
          ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
        }
      }
    }
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

/**
 * Triggers a direct client-side PNG download of a QR code (using existing dataUrl or generating one).
 */
export function downloadQrPng(targetUrlOrText: string, filename: string, existingDataUrl?: string | null) {
  const dataUrl = existingDataUrl && existingDataUrl.startsWith("data:image/")
    ? existingDataUrl
    : makeQrDataUrl(targetUrlOrText, 320);
  if (!dataUrl) return;
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
