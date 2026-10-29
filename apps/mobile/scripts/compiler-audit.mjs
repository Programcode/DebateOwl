import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const require = createRequire(resolve(root, 'package.json'));
const babel = require('@babel/core');
const compiler = require('babel-plugin-react-compiler');
const source = resolve(root, 'apps/mobile/src');
const files = readdirSync(source, { recursive: true }).filter((file) => file.endsWith('.tsx') && !file.endsWith('.web.tsx')).sort();
const skips = [];
let successes = 0;
for (const file of files) {
  const filename = `apps/mobile/src/${file}`;
  babel.transformSync(readFileSync(resolve(source, file), 'utf8'), {
    filename,
    configFile: false,
    babelrc: false,
    parserOpts: { sourceType: 'module', plugins: ['typescript', 'jsx'] },
    plugins: [[compiler, {
      target: '19',
      logger: {
        logEvent(_file, event) {
          if (event.kind === 'CompileSuccess') successes += 1;
          else if (event.kind === 'CompileError' || event.kind === 'CompileSkip') {
            const detail = event.detail?.options ?? event.detail;
            skips.push({
              file: filename,
              line: detail?.loc?.start?.line ?? detail?.details?.[0]?.loc?.start?.line ?? event.loc?.start?.line,
              reason: detail?.reason ?? event.reason,
            });
          }
        },
      },
    }]],
  });
}
process.stdout.write(`${JSON.stringify({ files: files.length, successes, skips }, null, 2)}\n`);
