#!/usr/bin/env node
/**
 * Sinh bộ biểu tượng ShopTik cho app.
 *
 * Vì sao tự vẽ bằng code thay vì kèm sẵn file ảnh: bộ icon phải ra 6 kích cỡ
 * và 4 biến thể (đặc, nền trong suốt, đơn sắc, favicon) từ CÙNG một hình. Sửa
 * hình bằng tay ở 6 file rời là kiểu sai sót không ai phát hiện cho tới lúc
 * nhìn icon trên máy thật. Ở đây sửa một chỗ, chạy lại `npm run icons`, cả bộ
 * đồng bộ.
 *
 * Không dùng thư viện ảnh nào — chỉ zlib có sẵn trong Node. Đổi lại phải tự
 * đóng gói PNG, nhưng tránh được một dependency nhị phân hay hỏng trên Windows.
 *
 * Hình: mũi tên trắng chúc xuống một thanh xanh lá — tiền chảy ngược về ví.
 * Xanh lá là màu tiền theo đúng quy ước trong public/theme/tokens.css.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'images');

const NAVY = [0x00, 0x2d, 0x9c];
const WHITE = [0xff, 0xff, 0xff];
const GREEN = [0x00, 0x96, 0x68];

/* ------------------------------------------------------------------ *
 * Đóng gói PNG
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** pixels: Uint8Array RGBA, dài size*size*4 */
function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // color type RGBA
  // 10..12 = compression, filter, interlace — đều là 0

  // Mỗi dòng quét phải có một byte filter đứng trước. Dùng filter 0 (None):
  // ảnh toàn mảng màu phẳng nên zlib nén tốt sẵn, không cần filter phức tạp.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    pixels.copy
      ? pixels.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4)
      : Buffer.from(pixels.subarray(y * size * 4, (y + 1) * size * 4)).copy(
          raw,
          rowStart + 1,
        );
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ *
 * Hình học — toạ độ chuẩn hoá trong khung 1024, gốc ở tâm
 * ------------------------------------------------------------------ */

const UNIT = 1024;

function insideRect(x, y, x0, y0, x1, y1) {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function insideRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (!insideRect(x, y, x0, y0, x1, y1)) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function insideCircle(x, y, cx, cy, r) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/** Tam giác cân chúc xuống: đỉnh dưới, đáy trên. */
function insideDownTriangle(x, y, apexX, apexY, baseY, halfWidth) {
  if (y < baseY || y > apexY) return false;
  const t = (y - baseY) / (apexY - baseY); // 0 ở đáy, 1 ở đỉnh
  const half = halfWidth * (1 - t);
  return Math.abs(x - apexX) <= half;
}

/**
 * Trả về màu của hình tại một điểm, hoặc null nếu điểm đó nằm ngoài hình.
 * `scale` co hình về giữa — dùng cho vùng an toàn của icon thích ứng Android.
 */
function markColorAt(x, y, scale) {
  const c = UNIT / 2;
  const sx = c + (x - c) / scale;
  const sy = c + (y - c) / scale;

  // Khoá ví — kiểm tra TRƯỚC thân ví vì nó nằm đè lên trên.
  if (insideCircle(sx, sy, 652, 740, 36)) return WHITE;
  // Thân ví, màu tiền.
  if (insideRoundedRect(sx, sy, 292, 620, 732, 860, 56)) return GREEN;
  // Thân mũi tên.
  if (insideRect(sx, sy, 472, 164, 552, 404)) return WHITE;
  // Đầu mũi tên, chỉ xuống miệng ví.
  if (insideDownTriangle(sx, sy, 512, 544, 384, 150)) return WHITE;
  return null;
}

/**
 * Vẽ một ảnh.
 *
 * Lấy mẫu 4x4 mỗi điểm ảnh rồi lấy trung bình — không có bước này thì cạnh
 * xiên của mũi tên sẽ răng cưa rõ rệt ở cỡ nhỏ.
 */
function render(size, { background, monochrome = false, scale = 1, plain = false }) {
  const pixels = Buffer.alloc(size * size * 4);
  const SUB = 4;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SUB; sy += 1) {
        for (let sx = 0; sx < SUB; sx += 1) {
          const x = ((px + (sx + 0.5) / SUB) / size) * UNIT;
          const y = ((py + (sy + 0.5) / SUB) / size) * UNIT;
          const mark = plain ? null : markColorAt(x, y, scale);
          const color = mark
            ? monochrome
              ? WHITE
              : mark
            : background;

          if (color) {
            r += color[0];
            g += color[1];
            b += color[2];
            a += 255;
          }
        }
      }

      const samples = SUB * SUB;
      const offset = (py * size + px) * 4;
      if (a > 0) {
        // Chia cho số mẫu CÓ MÀU, không phải tổng số mẫu — nếu không thì
        // pixel ở rìa bị pha thêm màu đen và viền hình sẽ xỉn đi.
        const covered = a / 255;
        pixels[offset] = Math.round(r / covered);
        pixels[offset + 1] = Math.round(g / covered);
        pixels[offset + 2] = Math.round(b / covered);
        pixels[offset + 3] = Math.round(a / samples);
      }
    }
  }

  return encodePng(size, pixels);
}

/* ------------------------------------------------------------------ *
 * Xuất file
 * ------------------------------------------------------------------ */

const OUTPUTS = [
  // Icon chính (iOS + cửa hàng): đặc, không được có kênh trong suốt.
  ['icon.png', 1024, { background: NAVY }],
  // Android thích ứng: nền và lớp trên tách rời để hệ thống tự bo góc.
  // Lớp trên phải nằm gọn trong vùng an toàn giữa, nếu không sẽ bị cắt.
  // Lớp nền phải TRƠN. Vẽ hình lên cả hai lớp thì Android chồng chúng lên
  // nhau ở hai tỷ lệ khác nhau, ra một icon nhoè đôi.
  ['android-icon-background.png', 1024, { background: NAVY, plain: true }],
  ['android-icon-foreground.png', 1024, { background: null, scale: 0.62 }],
  ['android-icon-monochrome.png', 1024, { background: null, monochrome: true, scale: 0.62 }],
  // Màn hình chờ: nền do app.json tô, ở đây chỉ cần hình.
  ['splash-icon.png', 512, { background: null }],
  ['favicon.png', 96, { background: NAVY }],
];

mkdirSync(OUT_DIR, { recursive: true });

for (const [name, size, options] of OUTPUTS) {
  const png = render(size, options);
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`${name.padEnd(32)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}

console.log('\nXong. Sửa hình thì sửa markColorAt() rồi chạy lại `npm run icons`.');
