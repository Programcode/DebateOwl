import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AskChat } from '@/components/features/ask/AskChat';

vi.mock('@/hooks/use-subscription', () => ({
  useSubscription: () => ({ isPro: false, tier: 'trial', loading: false }),
}));

describe('AskChat', () => {
  it('sends citation and web search toggles with the message', () => {
    const onSend = vi.fn();

    render(
      <AskChat
        messages={[]}
        isLoading={false}
        onSend={onSend}
        onClear={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText('Citations'));
    fireEvent.click(screen.getByLabelText('Web search'));
    fireEvent.click(screen.getByLabelText('Pros/Cons'));
    fireEvent.click(screen.getByLabelText('Arg Map'));
    fireEvent.change(screen.getByPlaceholderText('Ask your debate coach...'), {
      target: { value: 'Find current examples for school phone bans' },
    });
    fireEvent.click(screen.getByLabelText('Send message'));

    expect(onSend).toHaveBeenCalledWith(
      'Find current examples for school phone bans',
      'general',
      true,
      true,
      true,
      true,
      []
    );
  });

  it('renders citations, argument maps, pros and cons, and uncertainties', () => {
    render(
      <AskChat
        messages={[{
          id: 'm1',
          role: 'assistant',
          content: 'Use a clear weighing frame.',
          timestamp: 0,
          output: {
            response: 'Use a clear weighing frame.',
            citations: [{ claim: 'Phones can distract students', source: 'https://example.com/study', verified: true }],
            searchInfo: {
              webSearchUsed: true,
              queries: ['school phone ban evidence'],
              sources: [{ title: 'example.com', url: 'https://example.com/study', verified: true }],
            },
            followUpQuestions: ['What side are you on?'],
            prosConsAnalysis: { pros: ['Simple to explain'], cons: ['Needs evidence'] },
            argumentMap: {
              mainClaim: 'Phone bans improve attention',
              supportingPoints: ['Less distraction'],
              counterpoints: ['Enforcement costs'],
              assumptions: ['Teachers enforce consistently'],
            },
            uncertainties: ['Local policy varies'],
          },
        }]}
        isLoading={false}
        onSend={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(screen.getByText('Citations:')).toBeDefined();
    expect(screen.getByText('Web research used:')).toBeDefined();
    expect(screen.getByText((content) => content.includes('school phone ban evidence'))).toBeDefined();
    expect(screen.getAllByText('Verified').length).toBeGreaterThan(0);
    expect(screen.getByText('Argument map:')).toBeDefined();
    expect(screen.getByText('Phone bans improve attention')).toBeDefined();
    expect(screen.getByText((content) => content.includes('Simple to explain'))).toBeDefined();
    expect(screen.getByText((content) => content.includes('Local policy varies'))).toBeDefined();
  });

  it('keeps saved chats collapsed by default and loads a selected chat', () => {
    const onLoadChat = vi.fn();

    render(
      <AskChat
        messages={[]}
        isLoading={false}
        onSend={vi.fn()}
        onClear={vi.fn()}
        savedChats={[{ id: 'chat-1', title: 'School phone bans', createdAt: Date.now(), messageCount: 4 }]}
        onLoadChat={onLoadChat}
      />
    );

    expect(screen.queryByText('School phone bans')).toBeNull();
    fireEvent.click(screen.getByLabelText('Open saved chats'));
    fireEvent.click(screen.getByText('School phone bans'));

    expect(onLoadChat).toHaveBeenCalledWith('chat-1');
  });
});
