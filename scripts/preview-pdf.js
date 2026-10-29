const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const pdfPath = path.resolve(__dirname, '..', 'docs', 'SYSTEM_REQUIREMENTS.pdf');
const buf = fs.readFileSync(pdfPath);
const txtA = buf.toString('binary');

function findStreams() {
  const out = [];
  let i = 0;
  while (true) {
    const s = buf.indexOf('stream', i);
    if (s === -1) break;
    const after = buf.slice(s + 6);
    let off = 0;
    if (after[0] === 0x0d) off++;
    if (after[off] === 0x0a) off++;
    const bodyStart = s + 6 + off;
    const e = buf.indexOf('endstream', bodyStart);
    if (e === -1) break;
    out.push(buf.slice(bodyStart, e));
    i = e + 9;
  }
  return out;
}
const bodies = findStreams();
const decs = bodies.map(b => { try { return zlib.inflateSync(b); } catch (e) { return null; } }).filter(Boolean);

function parseCMapFormat4At(view, offset) {
  const fmt = view.readUInt16LE(offset);
  if (fmt !== 4) return null;
  const segCount = view.readUInt16LE(offset + 14) / 2;
  if (view.length < offset + 14 + segCount * 8 + 2) return null;
  const endCodes = [];
  for (let i = 0; i < segCount; i++) endCodes.push(view.readUInt16LE(offset + 16 + i * 2));
  const startCodes = [];
  for (let i = 0; i < segCount; i++) startCodes.push(view.readUInt16LE(offset + 16 + segCount * 2 + i * 2));
  const idDelta = [];
  for (let i = 0; i < segCount; i++) idDelta.push(view.readInt16LE(offset + 16 + segCount * 4 + i * 2));
  const idRangeOffset = [];
  for (let i = 0; i < segCount; i++) idRangeOffset.push(view.readUInt16LE(offset + 16 + segCount * 6 + i * 2));
  const glyphIdArrayStart = offset + 16 + segCount * 8;
  const map = new Map();
  for (let i = 0; i < segCount; i++) {
    const lo = startCodes[i];
    const hi = endCodes[i];
    const delta = idDelta[i];
    const ro = idRangeOffset[i];
    let segBase = glyphIdArrayStart;
    for (let j = 0; j < i; j++) segBase += idRangeOffset[j];
    for (let g = lo; g <= hi; g++) {
      let cp = (g + delta) & 0xffff;
      if (ro !== 0) {
        const entryIdx = segBase + (g - lo) * 2;
        if (entryIdx + 2 <= view.length) {
          const val = view.readUInt16LE(entryIdx);
          if (val !== 0) cp = val & 0xffff;
        }
      }
      if (cp !== 0) map.set(g, String.fromCharCode(cp));
    }
  }
  return map;
}

function findCMapBodyByStreamIdx(streamIdx) {
  let s = 0, cnt = 0;
  while (true) {
    const st = buf.indexOf('stream', s);
    if (st === -1) break;
    if (cnt === streamIdx) {
      const after = buf.slice(st + 6);
      let off = 0;
      if (after[0] === 0x0d) off++;
      if (after[off] === 0x0a) off++;
      const bodyStart = st + 6 + off;
      const e = buf.indexOf('endstream', bodyStart);
      if (e !== -1) {
        const raw = buf.slice(bodyStart, e);
        try { return zlib.inflateSync(raw); } catch (e) { return null; }
      }
    }
    cnt++;
    s = st + 6;
  }
  return null;
}

// Find the /ToUnicode stream: scan for /ToUnicode dict then the following stream body
function findToUnicodeCmap() {
  let p = 0;
  while (true) {
    const idx = txtA.indexOf('/ToUnicode', p);
    if (idx === -1) break;
    const endDict = txtA.indexOf('>>', idx);
    const afterDict = txtA.indexOf('stream', endDict);
    if (afterDict !== -1) {
      const bodyIdx = afterDict + 6;
      let off = 0;
      if (txtA[bodyIdx] === 0x0d) off++;
      if (txtA[bodyIdx + off] === 0x0a) off++;
      const bodyStart = bodyIdx + off;
      const e = txtA.indexOf('endstream', bodyStart);
      if (e !== -1) {
        const raw = txtA.slice(bodyStart, e);
        try {
          const view = zlib.inflateSync(Buffer.from(raw, 'binary'));
          // find format-4 cmap inside
          for (let off2 = 0; off2 + 14 <= view.length; off2++) {
            if (view.readUInt16LE(off2) === 4) {
              const segCount = view.readUInt16LE(off2 + 14) / 2;
              if (segCount >= 1 && segCount <= 500 && view.length >= off2 + 14 + segCount * 8 + 2) {
                return parseCMapFormat4At(view, off2);
              }
            }
          }
        } catch (e) { /* ignore */ }
      }
    }
    p = idx + 1;
  }
  return null;
}

const mainCmap = findToUnicodeCmap();
console.log('main ToUnicode cmap parsed:', !!mainCmap, '| glyphs:', mainCmap ? mainCmap.size : 0);
const cmap = mainCmap || new Map();

function decodeHexStr(hex) {
  let out = '';
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16);
    const ch = cmap.get(byte);
    out += ch || '?';
  }
  return out;
}
function getHexStrings(dec) {
  const s = dec.toString('binary');
  const out = [];
  const re = /<([0-9A-Fa-f]{4,})>/g;
  let h;
  while ((h = re.exec(s)) !== null) {
    const hex = h[1];
    if (hex.length % 2 === 0) {
      try { out.push(decodeHexStr(hex)); } catch (e) {}
    }
  }
  return out;
}
const allHex = [];
for (const dec of decs) allHex.push(...getHexStrings(dec));
const joinedHex = allHex.join('');
const cleanHex = joinedHex.replace(/[^\x20-\x7e]/g, ' ').replace(/\s+/g, ' ').trim();

// Rollup: group into words by inserting spaces around punctuation common in the document
function prettyPrint(s) {
  return s.replace(/([.,;:!?)])/g, ' $1 ').replace(/\s+/g, ' ').trim();
}

console.log('hex fragments:', allHex.length, '| clean length:', cleanHex.length);
const pretty = prettyPrint(cleanHex);
console.log('--- readable text sample (first 2000 chars) ---');
console.log(pretty.slice(0, 2000));

// checksum to verify later
const hash = require('crypto').createHash('sha256').update(cleanHex).digest('hex');
console.log('--- sha256 of extracted text ---');
console.log(hash);
