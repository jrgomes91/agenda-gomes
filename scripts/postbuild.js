#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const indexPath = path.join(distDir, 'index.html');

if (!fs.existsSync(indexPath)) {
  console.error('postbuild: dist/index.html não encontrado. Rode expo export antes.');
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf8');

const headInjection = `
    <meta name="theme-color" content="#2564cf" />
    <meta name="description" content="Agenda Gomes - tarefas e lembretes estilo Microsoft To Do" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="Agenda" />
    <meta name="format-detection" content="telephone=no" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, shrink-to-fit=no" />`;

if (html.includes('manifest.json')) {
  console.log('postbuild: meta tags já injetadas, pulando.');
} else {
  html = html.replace(
    /<meta name="viewport"[^>]*\/>/,
    ''
  );
  html = html.replace('</head>', `${headInjection}\n  </head>`);
}

const swRegister = `
  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js').catch(function (err) {
          console.warn('SW falhou:', err);
        });
      });
    }
  </script>`;

if (!html.includes("serviceWorker.register('/sw.js')")) {
  html = html.replace('</body>', `${swRegister}\n</body>`);
}

fs.writeFileSync(indexPath, html);
console.log('postbuild: index.html atualizado com PWA + iOS meta tags.');

const assetsDir = path.join(__dirname, '..', 'assets');
const copies = [
  { from: 'icon.png', to: 'icon-192.png' },
  { from: 'icon.png', to: 'icon-512.png' },
  { from: 'icon.png', to: 'apple-touch-icon.png' },
];

for (const { from, to } of copies) {
  const src = path.join(assetsDir, from);
  const dst = path.join(distDir, to);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`postbuild: copiado ${from} -> dist/${to}`);
  }
}
