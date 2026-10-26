import { createElement, type ComponentType } from 'react';
import type { ToolRoute } from '@/lib/seo/tool-pages';
import type { LocalizedToolsCopy } from './copy-types';
import { LocalizedToolPage } from './LocalizedToolPages';

/** Each free tool page in one language, keyed by its English route. */
export function localizedToolPages(copy: LocalizedToolsCopy): Record<ToolRoute, ComponentType> {
  const page = (route: ToolRoute): ComponentType => () => createElement(LocalizedToolPage, { route, copy, page: copy.pages[route] });
  return {
    '/tools': page('/tools'),
    '/tools/debate-timer': page('/tools/debate-timer'),
    '/tools/debate-motion-generator': page('/tools/debate-motion-generator'),
    '/tools/debate-flow-sheet': page('/tools/debate-flow-sheet'),
    '/tools/speech-time-calculator': page('/tools/speech-time-calculator'),
  };
}
