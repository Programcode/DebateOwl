import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import TimerPage from '@/pages/TimerPage';

// Mock AudioContext
const mockAudioContext = {
    createOscillator: () => ({
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        frequency: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
    }),
    createGain: () => ({
        connect: vi.fn(),
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
    }),
    currentTime: 0,
    destination: {},
    state: 'running',
    resume: vi.fn(),
};

// Mock UI components
vi.mock('@/components/ui/select', () => ({
    Select: ({ onValueChange, children, value }: { onValueChange: (val: string) => void; children: React.ReactNode; value: string }) => (
        <div data-testid="select-container">
            <button
                data-testid="select-trigger"
                onClick={() => onValueChange('ld')}
            >
                {value}
            </button>
            {children}
        </div>
    ),
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectValue: () => <span>Select Value</span>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <div data-value={value}>{children}</div>,
}));

describe('TimerPage', () => {
    beforeEach(() => {
        // Do NOT set fake timers globaly. Only for specific tests.
        window.AudioContext = vi.fn(function MockAudioContext() {
            return mockAudioContext;
        }) as unknown as typeof AudioContext;
        global.ResizeObserver = vi.fn().mockImplementation(() => ({
            observe: vi.fn(),
            unobserve: vi.fn(),
            disconnect: vi.fn(),
        }));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('renders correctly with default standard format', () => {
        render(<TimerPage />);
        expect(screen.getByText('Debate Timer')).toBeInTheDocument();
        expect(screen.getByText('Introductor (4m)')).toBeInTheDocument();
        expect(screen.getByText('4:00')).toBeInTheDocument();
    });

    it('switches formats correctly', async () => {
        render(<TimerPage />);

        const trigger = screen.getByTestId('select-trigger');

        await act(async () => {
            fireEvent.click(trigger);
        });

        // Wait for both the buttons/label AND the time to update
        // The time update happens in a useEffect so it might be one tick later
        const newLabel = await screen.findByText('Aff Constructive (6m)');
        const newTime = await screen.findByText('6:00');

        expect(newLabel).toBeInTheDocument();
        expect(newTime).toBeInTheDocument();
    });

    it('starts and stops timer', () => {
        vi.useFakeTimers();
        render(<TimerPage />);

        const startButton = screen.getByText('Start');
        fireEvent.click(startButton);

        expect(screen.getByText('Pause')).toBeInTheDocument();
        expect(screen.getByText('SPEAKING')).toBeInTheDocument();

        act(() => {
            vi.advanceTimersByTime(1000);
        });

        expect(screen.getByText('3:59')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Pause'));
        expect(screen.getByText('PAUSED')).toBeInTheDocument();
    });

    it('catches up to elapsed wall-clock time after a delayed tick', () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        render(<TimerPage />);
        fireEvent.click(screen.getByText('Start'));

        vi.setSystemTime(4_000);
        act(() => {
            vi.advanceTimersByTime(1000);
        });

        expect(screen.getByText('3:55')).toBeInTheDocument();
    });

    it('reuses one audio context across countdown signals', () => {
        vi.useFakeTimers();
        render(<TimerPage />);
        fireEvent.click(screen.getByText('Start'));

        const totalSeconds = 4 * 60;
        act(() => {
            vi.advanceTimersByTime((totalSeconds - 61) * 1000);
        });

        act(() => {
            vi.advanceTimersByTime(2000);
        });

        expect(screen.getByText('0:59')).toBeInTheDocument();
        expect(window.AudioContext).toHaveBeenCalledTimes(1);

        act(() => {
            vi.advanceTimersByTime(59 * 1000);
        });

        expect(screen.getByText('TIME UP')).toBeInTheDocument();
        expect(window.AudioContext).toHaveBeenCalledTimes(1);
    });

    it('handles keyboard shortcuts', async () => {
        // Use real timers for interaction test to avoid conflict
        render(<TimerPage />);

        // Space to start
        await act(async () => {
            fireEvent.keyDown(window, { code: 'Space' });
        });
        expect(screen.getByText('SPEAKING')).toBeInTheDocument();

        // Space to pause
        await act(async () => {
            fireEvent.keyDown(window, { code: 'Space' });
        });
        expect(screen.getByText('PAUSED')).toBeInTheDocument();

        // Arrow Right to next speech
        await act(async () => {
            fireEvent.keyDown(window, { code: 'ArrowRight' });
        });

        // WaitFor allows some leniency for state updates
        const refutationLabel = await screen.findByText('Refutation 1 (6m)');
        expect(refutationLabel).toHaveClass('bg-orange-500');
        expect(screen.getByText('6:00')).toBeInTheDocument();
    });
});
