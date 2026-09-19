import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const distDir = resolve(process.cwd(), 'dist');
const manifest = JSON.parse(readFileSync(resolve(distDir, '.vite/manifest.json'), 'utf8'));
const bundleGraph = JSON.parse(readFileSync(resolve(distDir, '.vite/bundle-graph.json'), 'utf8'));
const entryKey = Object.keys(manifest).find((key) => manifest[key].isEntry && manifest[key].src === 'index.html');

if (!entryKey) throw new Error('Vite manifest has no index.html entry.');

function staticGraphFrom(file) {
  const graph = new Set();
  const pending = [file];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || graph.has(current)) continue;
    graph.add(current);
    pending.push(...(bundleGraph[current]?.imports ?? []));
  }
  return graph;
}

const forbiddenFeature = /(?:\/src\/pages\/AdminPage\.tsx$|\/src\/lib\/(?:pdf-export-utils|export-utils)\.ts$|\/node_modules\/(?:jspdf|jspdf-autotable|docx|recharts|reactflow)\/)/i;
const initialPageModules = new Set([
  'LandingPage.tsx',
  'LoginPage.tsx',
  'HomePage.tsx',
  'GeneratePage.tsx',
  'AttackPage.tsx',
]);
const initialRoutes = [
  entryKey,
  'src/pages/LandingPage.tsx',
  'src/pages/LoginPage.tsx',
  'src/pages/HomePage.tsx',
  'src/pages/GeneratePage.tsx',
  'src/pages/AttackPage.tsx',
];
const violations = initialRoutes.flatMap((routeKey) => {
  const routeFile = manifest[routeKey]?.file;
  if (!routeFile) throw new Error(`Vite manifest has no emitted chunk for ${routeKey}.`);
  return [...staticGraphFrom(routeFile)].flatMap((file) => (bundleGraph[file]?.modules ?? [])
    .flatMap((moduleId) => {
      const pageName = moduleId.match(/\/src\/pages\/([^/]+\.tsx)$/i)?.[1];
      if ((pageName && !initialPageModules.has(pageName)) || forbiddenFeature.test(moduleId)) {
        return [`${routeKey} -> ${file} -> ${moduleId}`];
      }
      return [];
    }));
});

if (violations.length > 0) {
  throw new Error(`Feature-only modules entered the static application graph:\n${violations.join('\n')}`);
}

const indexHtml = readFileSync(resolve(distDir, 'index.html'), 'utf8');
if (!/rel="stylesheet"/.test(indexHtml)) throw new Error('The production entry does not request application CSS from index.html.');
