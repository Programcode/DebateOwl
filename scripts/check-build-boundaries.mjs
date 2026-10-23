import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const projectRoot = resolve(process.cwd());
const distDir = resolve(projectRoot, 'dist');
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

// Also kept out: the Spanish and Hungarian catalogs (loaded only when chosen)
// and the signed-in layout (loaded only under /app).
const forbiddenFeature = /(?:\/src\/pages\/AdminPage\.tsx$|\/src\/lib\/(?:pdf-export-utils|export-utils)\.ts$|\/node_modules\/(?:jspdf|jspdf-autotable|docx|recharts|reactflow)\/|\/src\/locales\/(?:tools\/)?(?:es|hu)\.json$|\/src\/components\/layout\/AppLayout\.tsx$)/i;
const initialRoutes = [
  { key: entryKey, pageModules: new Set() },
  ...[
    'src/pages/LandingPage.tsx',
    'src/pages/LoginPage.tsx',
    'src/pages/HomePage.tsx',
    'src/pages/GeneratePage.tsx',
    'src/pages/AttackPage.tsx',
  ].map((key) => ({ key, pageModules: new Set([key]) })),
];

function canonicalModuleId(moduleId) {
  const sourceId = moduleId.split(/[?#]/, 1)[0];
  if (!sourceId.startsWith('/')) return sourceId.replaceAll('\\', '/');
  const relativeId = relative(projectRoot, sourceId);
  if (relativeId.startsWith('..') || relativeId.includes(':')) return null;
  return relativeId.split(sep).join('/');
}

function pageModulesFrom(routeFile) {
  return new Set([...staticGraphFrom(routeFile)].flatMap((file) => bundleGraph[file]?.modules ?? [])
    .map(canonicalModuleId)
    .filter((moduleId) => moduleId?.startsWith('src/pages/') && moduleId.endsWith('.tsx')));
}

const onboardingModules = new Set([
  'src/components/features/onboarding/OnboardingTour.tsx',
  'node_modules/react-joyride/dist/index.mjs',
]);

const onboardingInitialRoutes = [
  { key: entryKey },
  ...Object.entries(manifest)
    .filter(([, entry]) => entry.isDynamicEntry && entry.src?.startsWith('src/pages/') && entry.src.endsWith('.tsx'))
    .map(([key]) => ({ key })),
];

function modulesFromFiles(files) {
  return new Set([...files].flatMap((file) => bundleGraph[file]?.modules ?? [])
    .map(canonicalModuleId)
    .filter(Boolean));
}

const onboardingInitialGraphViolations = onboardingInitialRoutes.flatMap(({ key: routeKey }) => {
  const routeFile = manifest[routeKey]?.file;
  if (!routeFile) return [];
  return [...modulesFromFiles(staticGraphFrom(routeFile))]
    .filter((moduleId) => onboardingModules.has(moduleId))
    .map((moduleId) => `${routeKey} -> ${routeFile} -> onboarding module ${moduleId}`);
});

const onboardingDynamicChunks = Object.entries(manifest)
  .filter(([, entry]) => entry.isDynamicEntry)
  .map(([key, entry]) => ({ key, file: entry.file }))
  .filter(({ file }) => {
    const modules = modulesFromFiles(staticGraphFrom(file));
    return [...onboardingModules].every((moduleId) => modules.has(moduleId));
  });

const onboardingDynamicGraphViolations = onboardingDynamicChunks.length === 0
  ? ['OnboardingTour and react-joyride are not present together in any dynamic chunk.']
  : [];

const violations = initialRoutes.flatMap(({ key: routeKey, pageModules: expectedPageModules }) => {
  const routeFile = manifest[routeKey]?.file;
  if (!routeFile) throw new Error(`Vite manifest has no emitted chunk for ${routeKey}.`);
  const actualPageModules = pageModulesFrom(routeFile);
  const pageViolations = [
    ...[...actualPageModules]
      .filter((moduleId) => !expectedPageModules.has(moduleId))
      .map((moduleId) => `${routeKey} -> ${routeFile} -> unexpected page module ${moduleId}`),
    ...[...expectedPageModules]
      .filter((moduleId) => !actualPageModules.has(moduleId))
      .map((moduleId) => `${routeKey} -> ${routeFile} -> missing page module ${moduleId}`),
  ];
  const featureViolations = [...staticGraphFrom(routeFile)].flatMap((file) => (bundleGraph[file]?.modules ?? [])
    .filter((moduleId) => forbiddenFeature.test(moduleId))
    .map((moduleId) => `${routeKey} -> ${file} -> ${moduleId}`));
  return [...pageViolations, ...featureViolations];
});

violations.push(...onboardingInitialGraphViolations, ...onboardingDynamicGraphViolations);

if (violations.length > 0) {
  throw new Error(`Feature-only modules entered the static application graph:\n${violations.join('\n')}`);
}

const indexHtml = readFileSync(resolve(distDir, 'index.html'), 'utf8');
if (!/rel="stylesheet"/.test(indexHtml)) throw new Error('The production entry does not request application CSS from index.html.');

// Everything in dist/ is public. Source maps are uploaded to Sentry and then
// deleted; if an upload fails they must not ship. No server secret may reach
// the bundle: the only JWTs allowed are anon keys.
const distFiles = readdirSync(distDir, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => resolve(entry.parentPath, entry.name));
const sourceMaps = distFiles.filter((file) => file.endsWith('.map'));
if (sourceMaps.length > 0) {
  throw new Error(`Source maps would be served publicly:\n${sourceMaps.map((file) => relative(distDir, file)).join('\n')}`);
}

const secretPattern = /\b(?:sk_live_|sk_test_|rk_live_|whsec_|sk-or-v1-|sk-ant-|sk-proj-|sb_secret_)[A-Za-z0-9_-]{8,}|service_role/;
const jwtPattern = /eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;
const secretViolations = distFiles
  .filter((file) => /\.(?:js|mjs|html|json|txt|webmanifest)$/.test(file))
  .flatMap((file) => {
    const text = readFileSync(file, 'utf8');
    const found = [];
    if (secretPattern.test(text)) found.push(`${relative(distDir, file)}: matches a server secret pattern`);
    for (const [, payload] of text.matchAll(jwtPattern)) {
      let role;
      try { role = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).role; } catch { continue; }
      if (role !== 'anon') found.push(`${relative(distDir, file)}: JWT with role ${role ?? 'none'}`);
    }
    return found;
  });
if (secretViolations.length > 0) {
  throw new Error(`Possible secrets in the public build:\n${secretViolations.join('\n')}`);
}
