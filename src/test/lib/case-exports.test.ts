import { inflateRawSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportCaseToDocx } from '@/lib/export-utils';
import { exportCaseToPdf } from '@/lib/pdf-export-utils';
import { caseText } from '@/components/features/tools/result-text';
import { NEW_CASE, OLD_CASE, R2_CASE } from '../helpers/cases';

// The labels and placeholders the restructure removed from every export.
const OLD_LABELS = /Thesis|Framework|Burden of Proof|Predicted Opponent Case|Counterpoint|No framework provided|No burden of proof provided/i;

// Every line the PDF draws, recorded by a stand-in for jsPDF. Drawing calls the
// test does not need (colours, fonts, shapes, save) do nothing.
const drawn = vi.hoisted(() => [] as string[]);

vi.mock('jspdf', () => ({
  jsPDF: function FakePdf(): object {
    const doc: Record<string, unknown> = {
      internal: { pageSize: { width: 210, height: 297 } },
      // No font files to load in a test.
      addFileToVFS: undefined,
      text: (value: string | string[]) => { drawn.push(...[value].flat()); },
      splitTextToSize: (value: string) => [value],
      getNumberOfPages: () => 1,
    };
    return new Proxy(doc, { get: (target, key): unknown => (key in target ? Reflect.get(target, key) : (): undefined => undefined) });
  },
}));
vi.mock('jspdf-autotable', () => ({ default: (): void => undefined }));

/** The text of one file inside a .docx (a zip), read through its central directory. */
function zipEntry(zip: Buffer, name: string): string {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let entry = zip.readUInt32LE(end + 16);
  for (let i = 0; i < zip.readUInt16LE(end + 10); i++) {
    const nameLength = zip.readUInt16LE(entry + 28);
    if (zip.toString('utf8', entry + 46, entry + 46 + nameLength) === name) {
      const local = zip.readUInt32LE(entry + 42);
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + zip.readUInt32LE(entry + 20));
      return (zip.readUInt16LE(entry + 10) === 8 ? inflateRawSync(data) : data).toString('utf8');
    }
    entry += 46 + nameLength + zip.readUInt16LE(entry + 30) + zip.readUInt16LE(entry + 32);
  }
  throw new Error(`${name} is not in the archive`);
}

async function docxText(result: typeof NEW_CASE): Promise<string> {
  let blob: Blob | undefined;
  vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => { blob = value as Blob; return 'blob:case'; });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  expect(await exportCaseToDocx(result)).toBe(true);
  const bytes = await new Promise<ArrayBuffer>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob!);
  });
  const xml = zipEntry(Buffer.from(bytes), 'word/document.xml');
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => entities[name]);
}

async function pdfText(result: typeof NEW_CASE): Promise<string> {
  drawn.length = 0;
  expect(await exportCaseToPdf(result)).toBe(true);
  return drawn.join('\n');
}

beforeEach(() => {
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe.each([
  ['DOCX', docxText],
  ['PDF', pdfText],
  ['clipboard', async (result: typeof NEW_CASE) => caseText(result)],
])('%s case export', (_name, exportText) => {
  it('writes a new case as opening, arguments, "If they say…", closing line and sources', async () => {
    const text = await exportText(NEW_CASE);
    for (const expected of [
      NEW_CASE.opening!.hook,
      NEW_CASE.caseStructure.thesis,
      'One size fits all',
      'A ban treats a 7-year-old and a 17-year-old the same.',
      'Older pupils lose a learning tool they use responsibly.',
      'AI makes kids cheat.',
      'OECD, 2024',
      NEW_CASE.closingLine!,
      'UNICEF (2025) – Age limits alone do not keep children safe – https://www.unicef.org/report',
    ]) expect(text).toContain(expected);
    expect(text).not.toMatch(OLD_LABELS);
    expect(text).not.toContain('javascript:');
  });

  it('still writes every section of a case saved before the restructure', async () => {
    const text = await exportText(OLD_CASE);
    for (const expected of [
      'Imagine a city where the bus is free. That city is closer than you think.',
      'Free transit is a net public good.',
      'Net societal benefit.',
      'We must show a net gain in practice.',
      'Fares block the riders who need transit most.',
      'Fare collection has heavy overhead.',
      'Net cost is far below headline farebox revenue.',
    ]) expect(text).toContain(expected);
    // The old sections keep their content, under plain names.
    expect(text).not.toMatch(OLD_LABELS);
  });

  it('writes an R2 case as backed-up arguments and answers, with no new arguments', async () => {
    const text = await exportText(R2_CASE);
    for (const expected of [
      R2_CASE.caseStructure.thesis,
      'Our second argument: bullying',
      R2_CASE.reinforce![0].text,
      'Schools have emergency plans to protect pupils.',
      'UNESCO, 2021',
      R2_CASE.closingLine!,
    ]) expect(text).toContain(expected);
    expect(text).not.toMatch(/Argument 1|ARGUMENT 1/);
    expect(text).not.toMatch(OLD_LABELS);
  });

  it('writes a Conclusor case\'s reasons why we win when there are no arguments', async () => {
    const text = await exportText({ ...NEW_CASE, contentions: [], counters: [], whyWeWin: ['They never answered our point about supervision.'] });
    expect(text).toContain('They never answered our point about supervision.');
    expect(text).not.toContain('One size fits all');
  });
});
