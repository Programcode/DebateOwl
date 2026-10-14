import type { FlowchartDocument } from '@debatelab/core/flowchart';
import { describe, expect, it } from 'vitest';

import { findDraft, getDraft, NEW_MAP, newDraft, openDraft, savedDraft, showDraft, updateDraft } from './flowchart-drafts';

const doc = { nodes: [], edges: [] } as unknown as FlowchartDocument;

describe('flowchart drafts', () => {
  it('keeps a map found by its handle when saving moves it to its new row', () => {
    const scope = 'debate-1';
    showDraft(scope, newDraft('debate-1', doc));
    const handle = openDraft(scope)!.draft.handle;

    // Save, as the Flowchart screen does: the held new map becomes the saved row.
    const row = savedDraft({ id: 'row-1', title: 'Cars', debateId: 'debate-1', createdAt: 1, doc });
    updateDraft(scope, NEW_MAP, () => row);

    expect(getDraft(scope, NEW_MAP)).toBeUndefined();
    expect(findDraft(scope, handle)).toMatchObject({ key: 'row-1', draft: { savedId: 'row-1', handle } });
    expect(openDraft(scope)?.key).toBe('row-1');
  });
});
