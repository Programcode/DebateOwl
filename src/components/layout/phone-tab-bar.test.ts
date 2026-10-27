import { expect, test } from 'vitest';
import { KEYBOARD_OPEN_PX, isTextEntry, keyboardIsOpen, keyboardOverlap } from './phone-tab-bar';

test('keyboard overlap ignores the URL bar and reports a real keyboard', () => {
  expect(keyboardOverlap(844, 800, 0)).toBe(44);
  expect(keyboardOverlap(844, 800, 0) >= KEYBOARD_OPEN_PX).toBe(false);
  expect(keyboardOverlap(844, 430, 0)).toBe(414);
  expect(keyboardOverlap(844, 430, 0) >= KEYBOARD_OPEN_PX).toBe(true);
  // iOS shifts the visual viewport up while the keyboard is open.
  expect(keyboardOverlap(844, 500, 80)).toBe(264);
});

test('keyboard overlap stays at zero for a missing or inverted viewport', () => {
  expect(keyboardOverlap(Number.NaN, 400, 0)).toBe(0);
  expect(keyboardOverlap(800, 900, 0)).toBe(0);
  expect(keyboardOverlap(800, 700, 200)).toBe(0);
});

test('a keyboard is not pinch-zoom or an unfocused viewport shrink', () => {
  expect(keyboardIsOpen(844, 430, 0, 1, true)).toBe(true);
  expect(keyboardIsOpen(844, 800, 0, 1, true)).toBe(false);
  expect(keyboardIsOpen(844, 430, 0, 1.5, true)).toBe(false);
  expect(keyboardIsOpen(844, 430, 0, 1, false)).toBe(false);
  expect(keyboardIsOpen(844, 430, 0, Number.NaN, true)).toBe(false);
});

test('text entry is an input or textarea, not a button', () => {
  expect(isTextEntry('TEXTAREA', null, false)).toBe(true);
  expect(isTextEntry('INPUT', 'text', false)).toBe(true);
  expect(isTextEntry('INPUT', null, false)).toBe(true);
  expect(isTextEntry('DIV', null, true)).toBe(true);
  expect(isTextEntry('INPUT', 'checkbox', false)).toBe(false);
  expect(isTextEntry('BUTTON', null, false)).toBe(false);
});
