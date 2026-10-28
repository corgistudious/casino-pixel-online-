import { deflateSync } from 'node:zlib';

/** Test images built byte by byte (no image library): the server only reads their structure. */

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A real, decodable RGB PNG with optional metadata chunks (tEXt "GPS…", eXIf). */
export function png(side = 512, opts: { metadata?: boolean; animated?: boolean; seed?: number } = {}): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(side, 0);
  ihdr.writeUInt32BE(side, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.alloc(1 + side * 3, opts.seed ?? 0x80);
  row[0] = 0;
  const raw = Buffer.concat(Array.from({ length: side }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    ...(opts.animated ? [pngChunk('acTL', Buffer.alloc(8))] : []),
    ...(opts.metadata ? [pngChunk('tEXt', Buffer.from('Comment\0GPS 21.0285N 105.8542E secret-location', 'latin1')), pngChunk('eXIf', Buffer.from('MM\0*GPSDATA', 'latin1'))] : []),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A JPEG-structured file: SOI, APP0, APP1 (EXIF with "GPS"), DQT, SOF0 (size), SOS, scan bytes, EOI. */
export function jpeg(side = 512, opts: { exif?: boolean } = { exif: true }): Buffer {
  const seg = (marker: number, data: Buffer) => {
    const h = Buffer.alloc(4);
    h[0] = 0xff;
    h[1] = marker;
    h.writeUInt16BE(data.length + 2, 2);
    return Buffer.concat([h, data]);
  };
  const sof = Buffer.alloc(15);
  sof[0] = 8;
  sof.writeUInt16BE(side, 1);
  sof.writeUInt16BE(side, 3);
  sof[5] = 3;
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
    ...(opts.exif ? [seg(0xe1, Buffer.from('Exif\0\0GPSLatitude 21.0285 secret-location', 'latin1'))] : []),
    seg(0xdb, Buffer.alloc(65, 1)),
    seg(0xc0, sof),
    seg(0xda, Buffer.from([3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0])),
    Buffer.alloc(200, 0x55),
    Buffer.from([0xff, 0xd9]),
    // Trailing data after EOI is dropped too.
    Buffer.from('trailing secret-location', 'latin1'),
  ]);
}

/** An extended WebP (VP8X + VP8L) carrying an EXIF chunk. */
export function webp(side = 512, opts: { exif?: boolean; animated?: boolean } = { exif: true }): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const h = Buffer.alloc(8);
    h.write(type, 0, 'latin1');
    h.writeUInt32LE(data.length, 4);
    return Buffer.concat([h, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  };
  const vp8x = Buffer.alloc(10);
  vp8x[0] = (opts.exif ? 0x08 : 0) | (opts.animated ? 0x02 : 0);
  vp8x.writeUIntLE(side - 1, 4, 3);
  vp8x.writeUIntLE(side - 1, 7, 3);
  const w = side - 1;
  const h = side - 1;
  const vp8l = Buffer.alloc(16);
  vp8l[0] = 0x2f;
  // 14 bits width-1, 14 bits height-1 (little-endian bit packing).
  const bits = w | (h << 14);
  vp8l.writeUInt32LE(bits >>> 0, 1);
  const body = Buffer.concat([
    chunk('VP8X', vp8x),
    ...(opts.animated ? [chunk('ANIM', Buffer.alloc(6))] : []),
    chunk('VP8L', vp8l),
    ...(opts.exif ? [chunk('EXIF', Buffer.from('MM\0*GPS secret-location', 'latin1'))] : []),
  ]);
  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0, 'latin1');
  riff.writeUInt32LE(4 + body.length, 4);
  riff.write('WEBP', 8, 'latin1');
  return Buffer.concat([riff, body]);
}
