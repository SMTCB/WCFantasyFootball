// Makes PNG copies of the Clubhouse brand SVGs. Chat apps, stores and iOS read PNG, not SVG.
// Usage: node scripts/generate-brand-pngs.cjs
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const dir = path.join(__dirname, '..', 'public', 'brand');
const jobs = [
  ['clubhouse-icon-light.svg', 'clubhouse-icon-180.png', 180],
  ['clubhouse-icon-light.svg', 'clubhouse-icon-192.png', 192],
  ['clubhouse-icon-light.svg', 'clubhouse-icon-512.png', 512],
  ['clubhouse-icon-light.svg', 'clubhouse-icon-1024.png', 1024],
  ['clubhouse-link-preview.svg', 'clubhouse-link-preview.png', 1200],
];
(async () => {
  for (const [src, out, w] of jobs) {
    // The SVG names web fonts the renderer does not have; swap in a system font so the PNG text fits.
    let input = path.join(dir, src);
    if (src.includes('link-preview')) {
      const svg = fs.readFileSync(input, 'utf8')
        .replace(/font-family="Archivo Black[^"]*"/, 'font-family="Arial, Helvetica, sans-serif" font-weight="800"')
        .replace(/font-family="Archivo, sans-serif"/, 'font-family="Arial, Helvetica, sans-serif"');
      input = Buffer.from(svg);
    }
    await sharp(input, { density: 300 }).resize({ width: w }).png().toFile(path.join(dir, out));
    console.log('wrote', out);
  }
})();
