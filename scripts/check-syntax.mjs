// VoxBrowser derleme denetimi (derleme adımı yok, kaynaklar olduğu gibi çalışır):
// her JS dosyasının sözdizimini, manifestlerdeki dosyaların var olduğunu ve 500 satır sınırını kontrol eder.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', 'vendor', 'fonts', '.vox-test']);
const MAX_LINES = 500;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(m?js|css|html)$/.test(name)) out.push(p);
  }
  return out;
}

const problems = [];
const files = ['src', 'scripts', 'tests'].flatMap((d) => walk(path.join(root, d)));
for (const f of files) {
  const rel = path.relative(root, f);
  const text = readFileSync(f, 'utf8');
  const lines = text.split('\n').length;
  if (lines > MAX_LINES) problems.push(`${rel}: ${lines} satır (sınır ${MAX_LINES})`);
  if (!/\.m?js$/.test(f)) continue;
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    problems.push(`${rel}: sözdizimi hatası\n${String(e.stderr || e.message).trim()}`);
  }
  // Manifest: listelenen her betik ve stil dosyası var olmalı.
  if (path.basename(f) === 'manifest.js') {
    const inUi = rel.startsWith(path.join('src', 'ui'));
    for (const m of text.matchAll(/['"]([^'"]+\.(?:js|css))['"]/g)) {
      const ref = m[1];
      const target = ref.startsWith('/_/') ? path.join(root, 'src', ref.slice(3)) : inUi ? path.join(root, 'src', 'ui', ref) : path.join(path.dirname(f), ref);
      if (!existsSync(target)) problems.push(`${rel}: manifestteki dosya yok → ${ref}`);
    }
  }
}

if (problems.length) {
  console.error(`Denetim başarısız (${problems.length}):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`Denetim temiz: ${files.length} dosya.`);
