import { describe, expect, it } from 'vitest';
import { decideMotionTarget, shouldPrefillMotion } from '@/lib/debate/motion';
import type { Debate } from '@/lib/stores/debate-store';

const debate = (id: string, motion: string): Debate => ({ id, motion, settings: {}, instructions: '', lastActivityAt: 0, createdAt: 0 });
const homework = debate('d1', 'This House would ban homework');
const zoos = debate('d2', 'This House would abolish zoos');

describe('decideMotionTarget', () => {
  it('attaches silently when the motion matches the Current Debate, ignoring case and spacing', () => {
    expect(decideMotionTarget('  this house would   BAN homework ', { debates: [homework, zoos], currentDebateId: 'd1', oneOff: false }))
      .toEqual({ kind: 'attach', debateId: 'd1' });
  });

  it('asks before using a different motion and offers only exactly matching debates to switch to', () => {
    const decision = decideMotionTarget('This House would abolish zoos', { debates: [homework, zoos], currentDebateId: 'd1', oneOff: false });
    expect(decision).toEqual({ kind: 'ask', matches: [zoos] });
    expect(decideMotionTarget('A brand new motion', { debates: [homework, zoos], currentDebateId: 'd1', oneOff: false }))
      .toEqual({ kind: 'ask', matches: [] });
  });

  it('asks when there is no Current Debate yet', () => {
    expect(decideMotionTarget('Anything', { debates: [], currentDebateId: null, oneOff: false })).toEqual({ kind: 'ask', matches: [] });
  });

  it('never attaches in one-off mode', () => {
    expect(decideMotionTarget('This House would ban homework', { debates: [homework], currentDebateId: 'd1', oneOff: true }))
      .toEqual({ kind: 'one-off' });
  });
});

describe('shouldPrefillMotion', () => {
  const known = [homework.motion, zoos.motion];
  it('fills an empty field', () => expect(shouldPrefillMotion('', homework.motion, known)).toBe(true));
  it('replaces another debate’s motion after a switch', () => expect(shouldPrefillMotion(zoos.motion, homework.motion, known)).toBe(true));
  it('never overwrites text the user typed', () => expect(shouldPrefillMotion('My own draft motion', homework.motion, known)).toBe(false));
  it('leaves the current motion alone', () => expect(shouldPrefillMotion(homework.motion, homework.motion, known)).toBe(false));
});
