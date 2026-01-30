import { describe, expect, it } from 'vitest';
import { validateUrl, isUrlSafe } from '@/lib/validation/url';
import { validateFileUpload, validateSingleFile, MAX_FILE_SIZE, MAX_FILE_COUNT } from '@/lib/validation/file';

describe('URL Validation', () => {
    describe('validateUrl', () => {
        it('returns valid http URLs unchanged', () => {
            expect(validateUrl('http://example.com')).toBe('http://example.com/');
            expect(validateUrl('https://example.com/path?query=1')).toBe('https://example.com/path?query=1');
        });

        it('adds https:// to URLs without protocol', () => {
            expect(validateUrl('example.com')).toBe('https://example.com/');
            expect(validateUrl('www.example.com')).toBe('https://www.example.com/');
        });

        it('blocks javascript: protocol', () => {
            expect(validateUrl('javascript:alert(1)')).toBeUndefined();
            expect(validateUrl('JAVASCRIPT:alert(1)')).toBeUndefined();
        });

        it('blocks data: protocol', () => {
            expect(validateUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined();
        });

        it('blocks other dangerous protocols', () => {
            expect(validateUrl('vbscript:alert(1)')).toBeUndefined();
            expect(validateUrl('file:///etc/passwd')).toBeUndefined();
        });

        it('returns undefined for invalid URLs', () => {
            expect(validateUrl('')).toBeUndefined();
            expect(validateUrl(undefined)).toBeUndefined();
            expect(validateUrl('not a url')).toBeUndefined();
        });

        it('handles whitespace', () => {
            expect(validateUrl('  https://example.com  ')).toBe('https://example.com/');
        });
    });

    describe('isUrlSafe', () => {
        it('returns true for safe URLs', () => {
            expect(isUrlSafe('https://example.com')).toBe(true);
            expect(isUrlSafe('http://example.com')).toBe(true);
        });

        it('returns false for dangerous URLs', () => {
            expect(isUrlSafe('javascript:alert(1)')).toBe(false);
            expect(isUrlSafe('data:text/html,test')).toBe(false);
        });
    });
});

describe('File Validation', () => {
    // Helper to create mock files
    const createMockFile = (name: string, size: number, type: string = 'text/plain'): File => {
        const content = new Array(size).fill('a').join('');
        return new File([content], name, { type });
    };

    describe('validateSingleFile', () => {
        it('accepts valid text files', () => {
            const file = createMockFile('test.txt', 1000);
            expect(validateSingleFile(file)).toEqual({ valid: true });
        });

        it('accepts valid code files', () => {
            const jsFile = createMockFile('app.js', 1000, 'application/javascript');
            expect(validateSingleFile(jsFile)).toEqual({ valid: true });

            const pyFile = createMockFile('script.py', 1000, 'text/x-python');
            expect(validateSingleFile(pyFile)).toEqual({ valid: true });
        });

        it('rejects files that are too large', () => {
            const largeFile = createMockFile('large.txt', MAX_FILE_SIZE + 1);
            const result = validateSingleFile(largeFile);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('too large');
        });

        it('rejects files with unsupported extensions', () => {
            const exeFile = createMockFile('virus.exe', 1000, 'application/x-executable');
            const result = validateSingleFile(exeFile);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('unsupported file type');
        });
    });

    describe('validateFileUpload', () => {
        it('accepts valid file arrays', () => {
            const files = [
                createMockFile('file1.txt', 1000),
                createMockFile('file2.md', 1000),
            ];
            expect(validateFileUpload(files)).toEqual({ valid: true });
        });

        it('rejects when too many files', () => {
            const files = Array.from({ length: MAX_FILE_COUNT + 1 }, (_, i) =>
                createMockFile(`file${i}.txt`, 1000)
            );
            const result = validateFileUpload(files);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Too many files');
        });

        it('rejects if any file is invalid', () => {
            const files = [
                createMockFile('valid.txt', 1000),
                createMockFile('invalid.exe', 1000, 'application/x-executable'),
            ];
            const result = validateFileUpload(files);
            expect(result.valid).toBe(false);
        });

        it('accepts empty arrays', () => {
            expect(validateFileUpload([])).toEqual({ valid: true });
        });
    });
});
