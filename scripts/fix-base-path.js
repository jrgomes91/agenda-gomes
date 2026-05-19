#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repoName = process.argv[2];
if (!repoName) {
  console.error('uso: node scripts/fix-base-path.js <repo-name>');
  process.exit(1);
}

const base = `/${repoName}`;
const distDir = path.join(__dirname, '..', 'dist');

function patchFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/(href|src)="\/(?!\/)/g, `$1="${base}/`);
  content = content.replace(/serviceWorker\.register\('\/sw\.js'\)/g, `serviceWorker.register('${base}/sw.js')`);
  fs.writeFileSync(filePath, content);
  console.log(`fix-base-path: ${path.basename(filePath)} ajustado para ${base}`);
}

patchFile(path.join(distDir, 'index.html'));

const manifestPath = path.join(distDir, 'manifest.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.start_url = `${base}/`;
  manifest.scope = `${base}/`;
  manifest.icons = manifest.icons.map((i) => ({ ...i, src: `${base}${i.src}` }));
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`fix-base-path: manifest.json ajustado para ${base}`);
}

const swPath = path.join(distDir, 'sw.js');
if (fs.existsSync(swPath)) {
  let sw = fs.readFileSync(swPath, 'utf8');
  sw = sw.replace(
    /CORE_ASSETS = \[[^\]]*\]/,
    `CORE_ASSETS = ['${base}/', '${base}/index.html', '${base}/manifest.json', '${base}/favicon.ico']`
  );
  fs.writeFileSync(swPath, sw);
  console.log(`fix-base-path: sw.js ajustado para ${base}`);
}
