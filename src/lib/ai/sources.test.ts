import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { autosaveDiscoveredSources, normalizeSourceUrl } from './sources';
import { useSessionStore, type Source } from '@/lib/stores/session-store';

const DEBATE = 'debate-1';
const PAGE = 'https://www.sciencemediacentre.es/en/homework-primary-school/';

describe('normalizeSourceUrl', () => {
  it('gives one key to the variants research returns for the same page', () => {
    const key = normalizeSourceUrl(PAGE);
    expect(key).toBe('sciencemediacentre.es/en/homework-primary-school');
    for (const variant of [
      'https://sciencemediacentre.es/en/homework-primary-school',
      'http://WWW.ScienceMediaCentre.es/en/homework-primary-school/#key-points',
      'https://www.sciencemediacentre.es/en/homework-primary-school?utm_source=x&utm_medium=y&fbclid=abc',
    ]) expect(normalizeSourceUrl(variant)).toBe(key);
  });

  it('keeps parameters and paths that name a different page', () => {
    expect(normalizeSourceUrl('https://example.org/article?id=1')).not.toBe(normalizeSourceUrl('https://example.org/article?id=2'));
    expect(normalizeSourceUrl('https://example.org/en/a')).not.toBe(normalizeSourceUrl('https://example.org/es/a'));
    expect(normalizeSourceUrl('https://news.example.org/a')).not.toBe(normalizeSourceUrl('https://example.org/a'));
    expect(normalizeSourceUrl('not a url')).toBeNull();
  });
});

describe('autosaveDiscoveredSources', () => {
  type Store = ReturnType<typeof useSessionStore.getState>;
  const addSource = vi.fn<Store['addSource']>();
  const updateSource = vi.fn<Store['updateSource']>();
  const original = useSessionStore.getState();

  beforeEach(() => {
    addSource.mockReset();
    updateSource.mockReset();
    // The stubbed write lands in the library like the real one, a moment later.
    addSource.mockImplementation(async (source) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const saved: Source = {
        ...source,
        id: `row-${useSessionStore.getState().sourceLibrary.length + 1}`,
        folder: source.folder ?? 'General',
        debateId: source.debateId ?? null,
        isActive: source.isActive ?? true,
        createdAt: Date.now(),
      };
      useSessionStore.setState((state) => ({ sourceLibrary: [saved, ...state.sourceLibrary] }));
    });
    useSessionStore.setState({ sourceLibrary: [], addSource, updateSource });
  });

  afterEach(() => {
    useSessionStore.setState({ sourceLibrary: [], addSource: original.addSource, updateSource: original.updateSource });
  });

  it('saves a page once per debate when two tools find it at the same time, and updates it after', async () => {
    const generate = autosaveDiscoveredSources([
      { title: 'Homework study', url: PAGE, content: 'Findings', qualityLabel: 'strong' },
      { title: 'Homework study (again)', url: `${PAGE}#methods`, qualityLabel: 'strong' },
    ], 'generate', DEBATE);
    const brainstorm = autosaveDiscoveredSources([
      { title: 'Homework study', url: 'https://sciencemediacentre.es/en/homework-primary-school?utm_source=exa', qualityLabel: 'moderate', query: 'homework' },
    ], 'brainstorm', DEBATE);
    await Promise.all([generate, brainstorm]);

    expect(addSource).toHaveBeenCalledOnce();
    expect(updateSource).toHaveBeenCalledOnce();
    const [id, patch] = updateSource.mock.calls[0];
    expect(id).toBe('row-1');
    expect(patch.metadata).toMatchObject({ capturedVia: 'brainstorm', query: 'homework', qualityLabel: 'moderate' });
    // The student's title, folder and on/off choice are theirs.
    expect(patch).not.toHaveProperty('title');
    expect(patch).not.toHaveProperty('isActive');
    expect(patch).not.toHaveProperty('folder');
  });

  it('saves the same page again in a different debate', async () => {
    await autosaveDiscoveredSources([{ title: 'Homework study', url: PAGE }], 'generate', DEBATE);
    await autosaveDiscoveredSources([{ title: 'Homework study', url: PAGE }], 'attack', 'debate-2');

    expect(addSource).toHaveBeenCalledTimes(2);
    expect(updateSource).not.toHaveBeenCalled();
  });

  it('keeps going after a failed batch', async () => {
    addSource.mockRejectedValueOnce(new Error('offline'));
    await autosaveDiscoveredSources([{ title: 'A', url: 'https://example.org/a' }], 'generate', DEBATE);
    await autosaveDiscoveredSources([{ title: 'B', url: 'https://example.org/b' }], 'generate', DEBATE);

    expect(addSource).toHaveBeenCalledTimes(2);
  });
});
