import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { expect, test } from 'vitest';
import en from '../locales/en.json';

const src = join(process.cwd(), 'src');

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'test') return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : /\.[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

function hasTranslation(key: string): boolean {
  let value: unknown = en;
  for (const part of key.split('.')) {
    if (typeof value !== 'object' || value === null || !(part in value)) return false;
    value = Reflect.get(value, part);
  }
  return typeof value === 'string';
}

test('literal translation keys exist in the English catalog', () => {
  const missing = new Set<string>();

  for (const path of files(src)) {
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node) && node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0]) &&
        (node.expression.getText(source) === 't' || node.expression.getText(source) === 'i18n.t')) {
        const key = node.arguments[0].text;
        const hasCount = node.arguments.slice(1).some((arg) => ts.isObjectLiteralExpression(arg) &&
          arg.properties.some((prop) => 'name' in prop && prop.name &&
            (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) && prop.name.text === 'count'));
        if (hasCount) {
          for (const suffix of ['_one', '_other']) {
            if (!hasTranslation(key + suffix)) missing.add(key + suffix);
          }
        } else if (!hasTranslation(key) && !(hasTranslation(key + '_one') && hasTranslation(key + '_other'))) {
          missing.add(key);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }

  expect([...missing].sort()).toEqual([]);
});
