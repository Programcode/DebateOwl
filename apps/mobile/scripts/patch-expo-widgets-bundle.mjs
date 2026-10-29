#!/usr/bin/env node
/**
 * Lets expo-widgets bundle its widget runtime in this npm workspace. EAS runs
 * it after installing (`eas-build-post-install` in package.json); it is safe
 * to run again.
 *
 * During the Xcode build, expo-widgets bundles its runtime with its own
 * metro.config.js, which makes the package itself the project root. That
 * bundle resolves `react-native/*` and worklets imports to Metro's empty
 * module, which Metro finds in the workspace root's node_modules. Expo CLI's
 * resolver does not find files there from that project root, so the build
 * fails with "Unable to resolve module .../metro-runtime/src/modules/empty-module.js"
 * (EAS build b8e4ba30, 2026-10-28). An empty module inside the package
 * resolves. Remove this once expo-widgets handles hoisted workspaces.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const packageDir = path.dirname(require.resolve('expo-widgets/package.json'));
const configPath = path.join(packageDir, 'metro.config.js');
const emptyModule = path.join(packageDir, 'bundle', 'empty-module.js');

writeFileSync(emptyModule, '// The widget bundle\'s empty module (apps/mobile/scripts/patch-expo-widgets-bundle.mjs).\n');

const config = readFileSync(configPath, 'utf8');
if (config.includes("'bundle/empty-module.js'")) {
  console.log('expo-widgets: metro.config.js already uses its own empty module.');
} else {
  const anchor = '  resolver: {\n    ...config.resolver,\n';
  if (!config.includes(anchor)) {
    throw new Error(`expo-widgets changed ${configPath}; check whether this patch is still needed.`);
  }
  writeFileSync(configPath, config.replace(anchor, `${anchor}    emptyModulePath: path.join(__dirname, 'bundle/empty-module.js'),\n`));
  console.log('expo-widgets: metro.config.js now uses bundle/empty-module.js.');
}
