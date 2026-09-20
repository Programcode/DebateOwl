import { readFileSync } from 'node:fs';
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

const forbiddenFeature = /(?:\/src\/pages\/AdminPage\.tsx$|\/src\/lib\/(?:pdf-export-utils|export-utils)\.ts$|\/node_modules\/(?:jspdf|jspdf-autotable|docx|recharts|reactflow)\/)/i;
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

function modulesFromFiles(files) {
  return new Set([...files].flatMap((file) => bundleGraph[file]?.modules ?? [])
    .map(canonicalModuleId)
    .filter(Boolean));
}

const onboardingInitialGraphViolations = initialRoutes.flatMap(({ key: routeKey }) => {
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
