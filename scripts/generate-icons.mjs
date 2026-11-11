import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

// PNG e ICO reproducibles, sin descargas de imágenes ni dependencias del sistema.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, bytes) {
  const label = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([label, bytes])));
  return Buffer.concat([length, label, bytes, crc]);
}
function polygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i],
      [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}
function segmentDistance(x, y, x1, y1, x2, y2) {
  const t = Math.max(
    0,
    Math.min(
      1,
      ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) /
        ((x2 - x1) ** 2 + (y2 - y1) ** 2),
    ),
  );
  return Math.hypot(x - x1 - t * (x2 - x1), y - y1 - t * (y2 - y1));
}
function png(size) {
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const px = x / size,
        py = y / size;
      let color = [
        99 + Math.round(20 * (1 - py)),
        102 + Math.round(15 * (1 - py)),
        241,
        255,
      ];
      if (
        polygon(px, py, [
          [0.5, 0.18],
          [0.77, 0.28],
          [0.75, 0.59],
          [0.66, 0.72],
          [0.5, 0.83],
          [0.34, 0.72],
          [0.25, 0.59],
          [0.23, 0.28],
        ])
      )
        color = [255, 255, 255, 255];
      if (
        polygon(px, py, [
          [0.5, 0.26],
          [0.69, 0.33],
          [0.68, 0.56],
          [0.61, 0.66],
          [0.5, 0.75],
          [0.39, 0.66],
          [0.32, 0.56],
          [0.31, 0.33],
        ])
      )
        color = [99, 102, 241, 255];
      if (
        Math.min(
          segmentDistance(px, py, 0.39, 0.49, 0.47, 0.57),
          segmentDistance(px, py, 0.47, 0.57, 0.63, 0.4),
        ) < 0.023
      )
        color = [255, 255, 255, 255];
      const index = y * (size * 4 + 1) + 1 + x * 4;
      rows.set(color, index);
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
await mkdir("desktop", { recursive: true });
const image = png(256);
await writeFile("desktop/icon.png", image);
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico[6] = 0;
ico[7] = 0;
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(image.length, 14);
ico.writeUInt32LE(22, 18);
await writeFile("desktop/icon.ico", Buffer.concat([ico, image]));
for (const size of [48, 72, 96, 144, 192, 432])
  await writeFile(`desktop/icon-${size}.png`, png(size));
console.log("Iconos de Windows y Android generados.");
