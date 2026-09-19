import { createRequire } from 'node:module';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { createServer } from 'node:net';
import { gzipSync } from 'node:zlib';
import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { chromium, devices } from '@playwright/test';

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const OUTPUT_DIR = resolve(ROOT, 'docs/performance/smooth-navigation-baseline');
const DIST_DIR = resolve(ROOT, 'dist');
const RUN_LABEL = process.env.BASELINE_RUN || `run-${new Date().toISOString().replaceAll(':', '-')}`;
const DELAY_MS = 750;
const SERVER_TIMEOUT_MS = 45_000;
const CONTENT_TIMEOUT_MS = 45_000;

const ROUTES = [
  { path: '/', marker: { selector: 'h1', text: 'Prep Faster' }, module: 'LandingPage' },
  { path: '/login', marker: { selector: 'button', text: 'Continue with Google' }, module: 'LoginPage' },
  { path: '/app', marker: { selector: 'main h1', text: 'DebateLab' }, module: 'HomePage', authenticated: true },
  { path: '/app/generate', marker: { selector: 'main h1', text: 'Generate' }, module: 'GeneratePage', authenticated: true },
  { path: '/app/attack', marker: { selector: 'main h1', text: 'Attack' }, module: 'AttackPage', authenticated: true },
  { path: '/app/flowchart', marker: { selector: 'main h3', text: 'Argument Flowchart' }, module: 'FlowchartPage', authenticated: true },
  { path: '/app/history', marker: { selector: 'main h1', text: 'History' }, module: 'HistoryPage', authenticated: true },
  { path: '/app/admin', marker: { selector: 'main h1, main h2, main h3', text: 'Admin Dashboard|Access Denied' }, module: 'AdminPage', authenticated: true },
];

const TRANSITIONS = [
  { from: '/', to: '/app', label: 'Landing CTA -> /app', module: 'HomePage', authenticated: true },
  { from: '/app', to: '/app/generate', label: 'Home -> Generate', module: 'GeneratePage', authenticated: true },
  { from: '/app/generate', to: '/app/attack', label: 'Generate -> Attack', module: 'AttackPage', authenticated: true },
  { from: '/app', to: '/app/flowchart', label: 'Home -> Flowchart', module: 'FlowchartPage', authenticated: true },
  { from: '/app', to: '/app/history', label: 'Home -> History', module: 'HistoryPage', authenticated: true },
];

const PROFILES = [
  {
    name: 'desktop',
    viewport: { width: 1280, height: 800 },
    device: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
    networkProfile: 'unthrottled loopback',
    cpuProfile: 'Chromium default CPU, no emulation',
  },
  {
    name: 'pixel-5',
    device: devices['Pixel 5'],
    networkProfile: 'unthrottled loopback',
    cpuProfile: 'Chromium default CPU, no emulation',
  },
];

function git(command) {
  return execFileSync('git', command, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function freePort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  if (!port) throw new Error('Could not allocate a free loopback port.');
  return port;
}

async function waitForServer(url) {
  const started = Date.now();
  while (Date.now() - started < SERVER_TIMEOUT_MS) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // The Vite process is still starting.
    }
    await sleep(150);
  }
  throw new Error(`Vite did not answer ${url} within ${SERVER_TIMEOUT_MS}ms.`);
}

async function startServer(port) {
  const logDir = await mkdtemp(join(tmpdir(), 'debatelab-vite-'));
  const stdoutPath = join(logDir, 'stdout.log');
  const stderrPath = join(logDir, 'stderr.log');
  const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: ROOT,
    env: { ...process.env, FORCE_COLOR: '0', PORT: String(port) },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(createWriteStream(stdoutPath));
  child.stderr.pipe(createWriteStream(stderrPath));
  const baseURL = `http://127.0.0.1:${port}`;
  try {
    await waitForServer(baseURL);
  } catch (error) {
    await stopServer(child);
    throw new Error(`${error.message}\n${await readFile(stderrPath, 'utf8')}`);
  }
  return { child, baseURL, logDir };
}

async function stopServer(child) {
  const signalGroup = (signal) => {
    if (!child.pid) return;
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  if (child.exitCode !== null) {
    signalGroup('SIGTERM');
    return;
  }
  signalGroup('SIGTERM');
  await Promise.race([
    new Promise((resolvePromise) => child.once('exit', resolvePromise)),
    sleep(5_000).then(() => signalGroup('SIGKILL')),
  ]);
  signalGroup('SIGKILL');
}

function authSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + 3_600;
  return {
    access_token: 'stub-access',
    refresh_token: 'stub-refresh',
    expires_in: 3_600,
    expires_at: expiresAt,
    token_type: 'bearer',
    user: {
      id: '00000000-0000-0000-0000-000000000001',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'e2e@example.com',
      app_metadata: { provider: 'google' },
      user_metadata: { full_name: 'E2E Tester' },
      created_at: new Date().toISOString(),
    },
  };
}

const INIT_INSTRUMENTATION = ({ markers }) => {
  const baseline = {
    initial: {
      target: window.location.pathname,
      firstSkeletonFrame: null,
      firstRealContentFrame: null,
    },
    transition: null,
    longTasks: [],
    layoutShifts: [],
  };

  const visible = (element) => {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };

  const realContent = (path) => {
    const marker = markers[path] || { selector: 'main h1, main h2, main h3', text: '' };
    const element = document.querySelector(marker.selector);
    return visible(element) && (!marker.text || marker.text.split('|').some((text) => element.textContent?.includes(text)));
  };
  const skeleton = () => visible(document.querySelector('.motion-loading-shell'));

  const sample = () => {
    const now = performance.now();
    const path = window.location.pathname;
    if (path === baseline.initial.target) {
      if (baseline.initial.firstSkeletonFrame === null && skeleton()) baseline.initial.firstSkeletonFrame = now;
      if (baseline.initial.firstRealContentFrame === null && realContent(path)) baseline.initial.firstRealContentFrame = now;
    }
    if (baseline.transition?.target === path) {
      if (baseline.transition.firstSkeletonFrame === null && skeleton()) baseline.transition.firstSkeletonFrame = now;
      if (baseline.transition.firstRealContentFrame === null && realContent(path)) baseline.transition.firstRealContentFrame = now;
    }
    window.requestAnimationFrame(sample);
  };

  if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) baseline.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
    }).observe({ type: 'longtask', buffered: true });
  }
  if (PerformanceObserver.supportedEntryTypes.includes('layout-shift')) {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) baseline.layoutShifts.push({ startTime: entry.startTime, value: entry.value });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  }

  window.__navigationBaseline = {
    startTransition(target) {
      baseline.transition = {
        target,
        clickTime: performance.now(),
        firstSkeletonFrame: null,
        firstRealContentFrame: null,
        shellBefore: document.querySelector('header'),
      };
    },
    snapshot() {
      return {
        initial: baseline.initial,
        transition: baseline.transition ? {
          target: baseline.transition.target,
          clickTime: baseline.transition.clickTime,
          firstSkeletonFrame: baseline.transition.firstSkeletonFrame,
          firstRealContentFrame: baseline.transition.firstRealContentFrame,
          shellDomIdentitySurvived: baseline.transition.shellBefore
            ? document.querySelector('header') === baseline.transition.shellBefore
            : null,
        } : null,
        longTasks: baseline.longTasks,
        layoutShifts: baseline.layoutShifts,
      };
    },
  };
  sample();
};

async function createContext(browser, profile, { authenticated = false, cacheDisabled = false, videoDir, baseURL } = {}) {
  const context = await browser.newContext({
    ...profile.device,
    serviceWorkers: 'block',
    ...(videoDir ? { recordVideo: { dir: videoDir, size: profile.device.viewport } } : {}),
  });
  const markerMap = Object.fromEntries(ROUTES.map(({ path, marker }) => [path, marker]));
  await context.addInitScript(INIT_INSTRUMENTATION, { markers: markerMap });
  await context.addInitScript((locale) => {
    window.localStorage.setItem('debate-trainer-settings', JSON.stringify({
      state: { language: locale, outputLanguage: locale, theme: 'system' },
      version: 0,
    }));
  }, 'en');
  if (authenticated) {
    await context.addInitScript((session) => {
      window.localStorage.setItem('debate-auth-production', JSON.stringify(session));
      window.localStorage.setItem('debate-trainer-onboarding', JSON.stringify({
        state: { hasCompletedOnboarding: true, isTourRunning: false },
        version: 0,
      }));
    }, authSession());
  }
  const page = await context.newPage();
  const origin = new URL(baseURL).origin;
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin && url.protocol !== 'data:') return route.abort();
    return route.continue();
  });
  if (cacheDisabled) {
    const client = await context.newCDPSession(page);
    await client.send('Network.enable');
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  }
  return { context, page };
}

async function waitForContent(page, path) {
  const route = ROUTES.find((item) => item.path === path);
  if (!route) throw new Error(`No route definition for ${path}.`);
  await page.waitForFunction((marker) => {
    const element = document.querySelector(marker.selector);
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
      && marker.text.split('|').some((text) => element.textContent?.includes(text));
  }, route.marker, { timeout: CONTENT_TIMEOUT_MS });
}

function routeChunkPattern(module) {
  return new RegExp(`/src/pages/${module}\\.tsx(?:[?#]|$)`, 'i');
}

async function collectMetrics(page, { path, kind, profile, cacheState, routeModule, label }) {
  const metricsHandle = await page.waitForFunction(({ target, chunkPattern }) => {
    const resources = performance.getEntriesByType('resource').map((entry) => ({
      name: entry.name,
      startTime: entry.startTime,
      duration: entry.duration,
      responseEnd: entry.responseEnd,
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
    }));
    const navigation = performance.getEntriesByType('navigation')[0];
    const state = window.__navigationBaseline?.snapshot() || {
      initial: { firstSkeletonFrame: null, firstRealContentFrame: null },
      transition: null,
      longTasks: [],
      layoutShifts: [],
    };
    const routeChunks = resources.filter((entry) => new RegExp(chunkPattern, 'i').test(entry.name));
    const transition = state.transition;
    const relative = (value, start) => value === null ? null : Math.max(0, value - start);
    return {
      path: target,
      clickTime: transition?.clickTime ?? null,
      firstSkeletonFrameMs: transition
        ? relative(transition.firstSkeletonFrame, transition.clickTime)
        : state.initial.firstSkeletonFrame,
      firstRealContentFrameMs: transition
        ? relative(transition.firstRealContentFrame, transition.clickTime)
        : state.initial.firstRealContentFrame,
      routeChunkRequests: routeChunks.map((entry) => ({
        url: entry.name,
        startTime: entry.startTime,
        endTime: entry.responseEnd,
        duration: entry.duration,
        transferSize: entry.transferSize,
        decodedBodySize: entry.decodedBodySize,
      })),
      longTasks: state.longTasks,
      cls: state.layoutShifts.reduce((sum, entry) => sum + entry.value, 0),
      layoutShifts: state.layoutShifts,
      requestCount: resources.length,
      transferredBytes: resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
      encodedBytes: resources.reduce((sum, entry) => sum + (entry.encodedBodySize || 0), 0),
      decodedBytes: resources.reduce((sum, entry) => sum + (entry.decodedBodySize || 0), 0),
      navigationTiming: navigation ? {
        domContentLoaded: navigation.domContentLoadedEventEnd,
        loadEventEnd: navigation.loadEventEnd,
        responseEnd: navigation.responseEnd,
      } : null,
      shellDomIdentitySurvived: transition?.shellDomIdentitySurvived ?? null,
    };
  }, { target: path, chunkPattern: routeChunkPattern(routeModule).source }, { timeout: CONTENT_TIMEOUT_MS, polling: 'raf' });
  const metrics = await metricsHandle.jsonValue();
  return {
    ...metrics,
    kind,
    label,
    profile,
    cacheState,
    routeModule,
  };
}

async function gotoAndMeasure(page, path, options) {
  await page.goto(`${options.baseURL}${path}`, { waitUntil: 'commit', timeout: CONTENT_TIMEOUT_MS });
  await waitForContent(page, path);
  await sleep(150);
  return collectMetrics(page, { ...options, path });
}

async function measureColdRoute(browser, profile, route, baseURL) {
  const { context, page } = await createContext(browser, profile, {
    authenticated: route.authenticated,
    cacheDisabled: true,
    baseURL,
  });
  try {
    return await gotoAndMeasure(page, route.path, {
      baseURL,
      kind: 'cold-refresh',
      profile: profile.name,
      cacheState: 'new context, HTTP cache disabled, service workers blocked',
      routeModule: route.module,
      label: `Cold ${route.path}`,
    });
  } finally {
    await context.close();
  }
}

async function clickDestination(page, transition) {
  if (transition.from === '/' && transition.to === '/app') {
    await page.getByRole('link', { name: 'Start Trial' }).first().click();
    return;
  }
  if (transition.from === '/app') {
    const homeLink = page.locator(`main a[href="${transition.to}"]`).first();
    if (await homeLink.count()) {
      await homeLink.click();
      return;
    }
  }
  const label = transition.to.split('/').pop().replace(/^[a-z]/, (letter) => letter.toUpperCase());
  if ((page.viewportSize()?.width ?? 1280) < 1024) {
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: new RegExp(`^${label}`) }).click();
    return;
  }
  if (['Flowchart', 'History'].includes(label)) {
    await page.locator('summary[aria-label="More"]').click();
    await page.locator('details').getByRole('link', { name: label }).click();
    return;
  }
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: label }).click();
}

async function startTransition(page, transition) {
  await page.evaluate((target) => window.__navigationBaseline?.startTransition(target), transition.to);
  await clickDestination(page, transition);
  await page.waitForFunction((target) => window.location.pathname === target, transition.to, { timeout: CONTENT_TIMEOUT_MS });
  await waitForContent(page, transition.to);
  await page.waitForLoadState('domcontentloaded', { timeout: CONTENT_TIMEOUT_MS }).catch(() => undefined);
  await sleep(150);
}

async function measureTransition(browser, profile, transition, baseURL, warm) {
  const { context, page } = await createContext(browser, profile, { authenticated: transition.authenticated, baseURL });
  try {
    await page.goto(`${baseURL}${transition.from}`, { waitUntil: 'commit', timeout: CONTENT_TIMEOUT_MS });
    await waitForContent(page, transition.from);
    if (warm) {
      await page.goto(`${baseURL}${transition.to}`, { waitUntil: 'commit', timeout: CONTENT_TIMEOUT_MS });
      await waitForContent(page, transition.to);
      await page.goto(`${baseURL}${transition.from}`, { waitUntil: 'commit', timeout: CONTENT_TIMEOUT_MS });
      await waitForContent(page, transition.from);
    }
    await startTransition(page, transition);
    return await collectMetrics(page, {
      path: transition.to,
      kind: warm ? 'warm-click' : 'first-visit-click',
      profile: profile.name,
      cacheState: warm ? 'browser cache warm after destination visit' : 'new context, browser cache empty',
      routeModule: transition.module,
      label: transition.label,
    });
  } finally {
    await context.close();
  }
}

async function captureDelayedTransition(browser, profile, baseURL, outputDir) {
  const tempRoot = await mkdtemp(join(tmpdir(), `debatelab-delay-${profile.name}-`));
  const frameDir = join(tempRoot, 'frames');
  const videoDir = join(tempRoot, 'video');
  await mkdir(frameDir, { recursive: true });
  await mkdir(videoDir, { recursive: true });
  const { context, page } = await createContext(browser, profile, {
    authenticated: true,
    cacheDisabled: true,
    videoDir,
    baseURL,
  });
  let requestedAt = null;
  await page.route('**/src/pages/AttackPage.tsx*', async (route) => {
    requestedAt = Date.now();
    await sleep(DELAY_MS);
    await route.continue();
  });
  const transition = { from: '/app/generate', to: '/app/attack', module: 'AttackPage', label: 'Delayed Generate -> Attack' };
  const frameStates = [];
  let metrics;
  try {
    await page.goto(`${baseURL}${transition.from}`, { waitUntil: 'commit', timeout: CONTENT_TIMEOUT_MS });
    await waitForContent(page, transition.from);
    await page.evaluate((target) => window.__navigationBaseline?.startTransition(target), transition.to);
    const clickPromise = clickDestination(page, transition);
    for (let index = 0; index < 8; index += 1) {
      await sleep(index === 0 ? 50 : 100);
      frameStates.push(await page.evaluate(() => ({
        route: window.location.pathname,
        fallbackVisible: Boolean(document.querySelector('.motion-loading-shell')),
        shellVisible: Boolean(document.querySelector('header')),
      })));
      await page.screenshot({ path: join(frameDir, `frame-${String(index).padStart(2, '0')}.png`) });
    }
    await clickPromise;
    await page.waitForFunction((target) => window.location.pathname === target, transition.to, { timeout: CONTENT_TIMEOUT_MS });
    await waitForContent(page, transition.to);
    await sleep(150);
    metrics = await collectMetrics(page, {
      path: transition.to,
      kind: 'delayed-click',
      profile: profile.name,
      cacheState: 'new context, HTTP cache disabled, service workers blocked',
      routeModule: transition.module,
      label: transition.label,
    });
    metrics.delayMs = DELAY_MS;
    metrics.delayRequestObserved = requestedAt !== null;
    metrics.frameStates = frameStates;
  } finally {
    await context.close();
  }
  const videos = (await readdir(videoDir)).filter((file) => file.endsWith('.webm'));
  if (videos.length !== 1) throw new Error(`Expected one ${profile.name} video, found ${videos.length}.`);
  const videoPath = join(outputDir, `${profile.name}-delayed.webm`);
  const filmstripPath = join(outputDir, `${profile.name}-delayed-filmstrip.png`);
  await copyFile(join(videoDir, videos[0]), videoPath);
  const ffmpeg = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-pattern_type', 'glob', '-i', join(frameDir, 'frame-*.png'),
    '-vf', 'scale=320:200:force_original_aspect_ratio=decrease,pad=320:200:(ow-iw)/2:(oh-ih)/2:black,tile=4x2:padding=8:margin=8',
    '-frames:v', '1', filmstripPath,
  ], { encoding: 'utf8' });
  if (ffmpeg.status !== 0) throw new Error(`ffmpeg filmstrip failed: ${ffmpeg.stderr}`);
  await rm(tempRoot, { recursive: true, force: true });
  if (!metrics) throw new Error(`Delayed ${profile.name} run produced no metrics.`);
  return { ...metrics, video: relative(ROOT, videoPath), filmstrip: relative(ROOT, filmstripPath) };
}

function normalizeModule(moduleId) {
  const absoluteRoot = `${ROOT}/`;
  return moduleId.startsWith(absoluteRoot) ? moduleId.slice(absoluteRoot.length) : moduleId;
}

async function captureBundleGraph() {
  const manifestPath = join(DIST_DIR, '.vite/manifest.json');
  const graphPath = join(DIST_DIR, '.vite/bundle-graph.json');
  if (!existsSync(manifestPath) || !existsSync(graphPath)) {
    throw new Error('dist/.vite/manifest.json and bundle-graph.json are required. Run npm run build first.');
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const graph = JSON.parse(await readFile(graphPath, 'utf8'));
  const routeEntries = ROUTES.map((route) => {
    const key = route.path === '/' ? 'src/pages/LandingPage.tsx' : `src/pages/${route.module}.tsx`;
    const entry = manifest[key];
    if (!entry) throw new Error(`Manifest is missing ${key}.`);
    return { route: route.path, module: key, ...entry };
  });
  const entryKey = Object.keys(manifest).find((key) => manifest[key].isEntry && manifest[key].src === 'index.html');
  if (!entryKey) throw new Error('Manifest is missing the index.html entry.');
  routeEntries.unshift({ route: 'index.html', module: entryKey, ...manifest[entryKey] });

  const staticGraph = (file) => {
    const result = new Set();
    const pending = [file];
    while (pending.length) {
      const current = pending.pop();
      if (!current || result.has(current)) continue;
      result.add(current);
      pending.push(...(graph[current]?.imports || []));
    }
    return result;
  };
  const membership = new Map();
  for (const entry of routeEntries) {
    for (const file of staticGraph(entry.file)) {
      if (!membership.has(file)) membership.set(file, []);
      membership.get(file).push(entry.route);
    }
  }
  const chunks = [];
  for (const [file, item] of Object.entries(graph)) {
    const filePath = join(DIST_DIR, file);
    const bytes = (await stat(filePath)).size;
    chunks.push({
      file,
      bytes,
      gzipBytes: gzipSync(await readFile(filePath)).length,
      imports: item.imports,
      modules: item.modules.map(normalizeModule),
      staticMembership: membership.get(file) || [],
      dynamicEntry: Object.entries(manifest).find(([, value]) => value.file === file)?.[0] || null,
    });
  }
  return {
    manifestEntries: Object.entries(manifest).map(([key, value]) => ({ key, ...value })),
    routeStaticGraphs: routeEntries.map((entry) => ({ route: entry.route, file: entry.file, files: [...staticGraph(entry.file)] })),
    chunks,
  };
}

function summarize(results) {
  const byKind = {};
  for (const item of results) {
    byKind[item.kind] = (byKind[item.kind] || 0) + 1;
  }
  return {
    measurements: results.length,
    byKind,
    delayedFilmstrips: results.filter((item) => item.kind === 'delayed-click').map((item) => item.profile),
  };
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const port = await freePort();
  const server = await startServer(port);
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const delayed = [];
  try {
    for (const profile of PROFILES) {
      for (const route of ROUTES) {
        console.error(`[baseline] ${profile.name} cold ${route.path}`);
        results.push(await measureColdRoute(browser, profile, route, server.baseURL));
      }
      for (const transition of TRANSITIONS) {
        console.error(`[baseline] ${profile.name} first ${transition.label}`);
        results.push(await measureTransition(browser, profile, transition, server.baseURL, false));
        console.error(`[baseline] ${profile.name} warm ${transition.label}`);
        results.push(await measureTransition(browser, profile, transition, server.baseURL, true));
      }
      console.error(`[baseline] ${profile.name} delayed Generate -> Attack`);
      const delayedMetrics = await captureDelayedTransition(browser, profile, server.baseURL, OUTPUT_DIR);
      delayed.push(delayedMetrics);
    }
  } finally {
    await browser.close();
    await stopServer(server.child);
    await rm(server.logDir, { recursive: true, force: true });
  }
  const bundleGraph = await captureBundleGraph();
  const playwrightVersion = require('@playwright/test/package.json').version;
  const metadata = {
    runLabel: RUN_LABEL,
    capturedAt: new Date().toISOString(),
    sourceCommit: git(['rev-parse', 'origin/main']),
    harnessCommit: git(['rev-parse', 'HEAD']),
    nodeVersion: process.version,
    npmVersion: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
    browser: {
      name: 'Chromium',
      version: browser.version(),
      executablePath: chromium.executablePath(),
      playwrightVersion,
    },
    vite: {
      serverMode: 'development',
      productionGraphMode: 'production',
      version: require('vite/package.json').version,
      port,
      cacheState: 'cold routes disable HTTP cache through CDP and block service workers; clicks use a fresh or warmed browser cache',
    },
    profiles: PROFILES.map((profile) => ({
      name: profile.name,
      viewport: profile.device.viewport,
      deviceScaleFactor: profile.device.deviceScaleFactor,
      isMobile: profile.device.isMobile || false,
      hasTouch: profile.device.hasTouch || false,
      userAgent: profile.device.userAgent || null,
      networkProfile: profile.networkProfile,
      cpuProfile: profile.cpuProfile,
    })),
  };
  const output = { metadata, summary: summarize([...results, ...delayed]), results, delayed, bundleGraph };
  const outputPath = join(OUTPUT_DIR, `${RUN_LABEL}.json`);
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ output: relative(ROOT, outputPath), ...output.summary, port, sourceCommit: metadata.sourceCommit, harnessCommit: metadata.harnessCommit }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
