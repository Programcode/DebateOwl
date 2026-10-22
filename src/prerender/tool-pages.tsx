// The free /tools pages, for src/prerender/entry.tsx.
import type { ComponentType } from 'react';
import type { ToolRoute } from '@/lib/seo/tool-pages';
import ToolsHubPage from '@/pages/tools/ToolsHubPage';
import DebateTimerToolPage from '@/pages/tools/DebateTimerToolPage';
import MotionGeneratorToolPage from '@/pages/tools/MotionGeneratorToolPage';
import FlowSheetToolPage from '@/pages/tools/FlowSheetToolPage';
import SpeechTimeCalculatorToolPage from '@/pages/tools/SpeechTimeCalculatorToolPage';

export const TOOL_PAGES: { route: ToolRoute; module: string; Page: ComponentType }[] = [
  { route: '/tools', module: 'src/pages/tools/ToolsHubPage.tsx', Page: ToolsHubPage },
  { route: '/tools/debate-timer', module: 'src/pages/tools/DebateTimerToolPage.tsx', Page: DebateTimerToolPage },
  { route: '/tools/debate-motion-generator', module: 'src/pages/tools/MotionGeneratorToolPage.tsx', Page: MotionGeneratorToolPage },
  { route: '/tools/debate-flow-sheet', module: 'src/pages/tools/FlowSheetToolPage.tsx', Page: FlowSheetToolPage },
  { route: '/tools/speech-time-calculator', module: 'src/pages/tools/SpeechTimeCalculatorToolPage.tsx', Page: SpeechTimeCalculatorToolPage },
];
