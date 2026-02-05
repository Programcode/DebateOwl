// src/test/utils.test.ts
import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('Utility Functions', () => {
    describe('cn (class name merger)', () => {
        it('merges multiple class strings', () => {
            const result = cn('class1', 'class2');
            expect(result).toContain('class1');
            expect(result).toContain('class2');
        });

        it('handles undefined values', () => {
            const result = cn('class1', undefined, 'class2');
            expect(result).toContain('class1');
            expect(result).toContain('class2');
            expect(result).not.toContain('undefined');
        });

        it('handles null values', () => {
            const result = cn('class1', null, 'class2');
            expect(result).toContain('class1');
            expect(result).toContain('class2');
        });

        it('handles boolean conditional classes', () => {
            const isActive = true;
            const result = cn('base', isActive && 'active');
            expect(result).toContain('base');
            expect(result).toContain('active');
        });

        it('excludes false conditional classes', () => {
            const isActive = false;
            const result = cn('base', isActive && 'active');
            expect(result).toContain('base');
            expect(result).not.toContain('active');
        });

        it('handles empty string', () => {
            const result = cn('');
            expect(result).toBe('');
        });

        it('handles no arguments', () => {
            const result = cn();
            expect(result).toBe('');
        });

        it('merges tailwind conflicting classes correctly', () => {
            // tailwind-merge should resolve conflicts, preferring the last class
            const result = cn('px-2', 'px-4');
            expect(result).toContain('px-4');
            // The conflicting px-2 should be removed
            expect(result).not.toContain('px-2');
        });

        it('handles object syntax', () => {
            const result = cn({ 'bg-red-500': true, 'bg-blue-500': false });
            expect(result).toContain('bg-red-500');
            expect(result).not.toContain('bg-blue-500');
        });

        it('handles array of classes', () => {
            const result = cn(['class1', 'class2']);
            expect(result).toContain('class1');
            expect(result).toContain('class2');
        });

        it('handles mixed arguments', () => {
            const showTrue = true;
            const showFalse = false;
            const result = cn(
                'base-class',
                showTrue && 'conditional-true',
                showFalse && 'conditional-false',
                { 'object-true': true, 'object-false': false },
                undefined,
                null,
                'final-class'
            );
            expect(result).toContain('base-class');
            expect(result).toContain('conditional-true');
            expect(result).not.toContain('conditional-false');
            expect(result).toContain('object-true');
            expect(result).not.toContain('object-false');
            expect(result).toContain('final-class');
        });
    });
});
