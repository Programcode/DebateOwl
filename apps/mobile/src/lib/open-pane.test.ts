import { describe, expect, it } from 'vitest';

import { openClaim, openRowId, type PaneClaim } from './open-pane';

const claim: PaneClaim & { node: string } = { userId: 'user-1', scope: 'debate-1', map: 'map-1', node: 'card-1' };
const screen = { userId: 'user-1', scope: 'debate-1', map: 'map-1' };

describe('openRowId', () => {
  it('keeps the open row while the list is still loading', () => {
    expect(openRowId('source-1', null)).toBe('source-1');
  });

  it('keeps the open row when the refreshed list still has it', () => {
    expect(openRowId('source-1', [{ id: 'source-2' }, { id: 'source-1' }])).toBe('source-1');
  });

  it('closes the pane once a refresh no longer has the row', () => {
    expect(openRowId('source-1', [{ id: 'source-2' }])).toBeNull();
    expect(openRowId('source-1', [])).toBeNull();
  });

  it('has nothing open when nothing was selected', () => {
    expect(openRowId(null, [{ id: 'source-1' }])).toBeNull();
  });
});

describe('openClaim', () => {
  it('keeps the docked card for the map on screen', () => {
    expect(openClaim(claim, screen)).toBe(claim);
  });

  it('clears the card when the map changes, so returning does not reopen it', () => {
    expect(openClaim(claim, { ...screen, map: 'map-2' })).toBeNull();
    expect(openClaim(claim, { ...screen, map: null })).toBeNull();
  });

  it('clears the card when the debate or the account changes', () => {
    expect(openClaim(claim, { ...screen, scope: 'debate-2' })).toBeNull();
    expect(openClaim(claim, { ...screen, scope: null })).toBeNull();
    expect(openClaim(claim, { ...screen, userId: 'user-2' })).toBeNull();
    expect(openClaim(claim, { ...screen, userId: null })).toBeNull();
  });

  it('stays closed when nothing is docked', () => {
    expect(openClaim(null, screen)).toBeNull();
  });
});
