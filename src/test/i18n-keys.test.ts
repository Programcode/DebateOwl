import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { expect, test } from 'vitest';
import en from '../locales/en.json';
import toolsEn from '../locales/tools/en.json';

const CATALOGS: Record<string, object> = { translation: en, tools: toolsEn };

const src = join(process.cwd(), 'src');

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'test') return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : /\.[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

/** `ns:key` names its namespace; otherwise the file's useTranslation('ns') does, else the default one. */
function hasTranslation(fullKey: string, fileNamespace: string): boolean {
  const [namespace, key] = fullKey.includes(':') ? fullKey.split(':', 2) : [fileNamespace, fullKey];
  let value: unknown = CATALOGS[namespace];
  if (!value) return false;
  for (const part of key.split('.')) {
    if (typeof value !== 'object' || value === null || !(part in value)) return false;
    value = Reflect.get(value, part);
  }
  return typeof value === 'string';
}

test('literal translation keys exist in the English catalog', () => {
  const missing = new Set<string>();

  for (const path of files(src)) {
    const text = readFileSync(path, 'utf8');
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const namespace = text.match(/useTranslation\('(\w+)'\)/)?.[1] ?? 'translation';
    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node) && node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0]) &&
        (node.expression.getText(source) === 't' || node.expression.getText(source) === 'i18n.t')) {
        const key = node.arguments[0].text;
        const hasCount = node.arguments.slice(1).some((arg) => ts.isObjectLiteralExpression(arg) &&
          arg.properties.some((prop) => 'name' in prop && prop.name &&
            (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) && prop.name.text === 'count'));
        if (hasCount) {
          for (const suffix of ['_one', '_other']) {
            if (!hasTranslation(key + suffix, namespace)) missing.add(key + suffix);
          }
        } else if (!hasTranslation(key, namespace) && !(hasTranslation(key + '_one', namespace) && hasTranslation(key + '_other', namespace))) {
          missing.add(key);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }

  expect([...missing].sort()).toEqual([]);
});
