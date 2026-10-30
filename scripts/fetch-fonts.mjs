// Downloads the UI fonts (Fredoka, Nunito, JetBrains Mono — SIL OFL 1.1) into src/shared/fonts
// and writes src/shared/fonts/fonts.css, so the browser UI never needs the network to render.
// Usage: node scripts/fetch-fonts.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'src', 'shared', 'fonts');
mkdirSync(out, { recursive: true });

const CSS_URL = 'https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:ital,wght@0,400;0,600;0,700;0,800;0,900;1,600&family=JetBrains+Mono:wght@400;500;700&display=swap';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const LICENSES = {
  Fredoka: 'https://raw.githubusercontent.com/google/fonts/main/ofl/fredoka/OFL.txt',
  Nunito: 'https://raw.githubusercontent.com/google/fonts/main/ofl/nunito/OFL.txt',
  'JetBrains Mono': 'https://raw.githubusercontent.com/google/fonts/main/ofl/jetbrainsmono/OFL.txt',
};

const css = await (await fetch(CSS_URL, { headers: { 'user-agent': UA } })).text();
const blocks = css.split('/*').slice(1).map((b) => {
  const subset = b.slice(0, b.indexOf('*/')).trim();
  const body = b.slice(b.indexOf('@font-face'));
  return { subset, body };
}).filter((b) => b.subset === 'latin' || b.subset === 'latin-ext');

const files = new Map();
let outCss = '/* VoxBrowser arayüz yazı tipleri — SIL Open Font License 1.1 (bkz. OFL-*.txt). scripts/fetch-fonts.mjs ile üretildi. */\n';
for (const { subset, body } of blocks) {
  const family = body.match(/font-family:\s*'([^']+)'/)[1];
  const url = body.match(/url\((https:[^)]+\.woff2)\)/)[1];
  let name = files.get(url);
  if (!name) {
    name = `${family.replace(/\s+/g, '')}-${subset}-${files.size}.woff2`;
    files.set(url, name);
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    writeFileSync(path.join(out, name), buf);
  }
  outCss += body.replace(/url\(https:[^)]+\.woff2\)/, `url("./${name}")`).replace(/\n\s*\n/g, '\n') + '\n';
}
writeFileSync(path.join(out, 'fonts.css'), outCss);
for (const [fam, url] of Object.entries(LICENSES)) {
  const txt = await (await fetch(url)).text();
  writeFileSync(path.join(out, `OFL-${fam.replace(/\s+/g, '')}.txt`), txt);
}
console.log(`fonts: ${files.size} files, ${blocks.length} @font-face blocks`);
