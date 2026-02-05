import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, RotateCcw, Bell, Volume2, VolumeX, Keyboard } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface DebateFormat {
  id: string;
  name: string;
  speeches: {
    id: string;
    label: string;
    minutes: number;
    color: string;
  }[];
}

const FORMATS: DebateFormat[] = [
  {
    id: 'standard',
    name: 'Standard (4-6-6-3)',
    speeches: [
      { id: 'intro', label: 'Introductor', minutes: 4, color: 'bg-blue-500' },
      { id: 'r1', label: 'Refutation 1', minutes: 6, color: 'bg-orange-500' },
      { id: 'r2', label: 'Refutation 2', minutes: 6, color: 'bg-red-500' },
      { id: 'conc', label: 'Conclusor', minutes: 3, color: 'bg-green-500' },
    ]
  },
  {
    id: 'ld',
    name: 'Lincoln-Douglas',
    speeches: [
      { id: 'ac', label: 'Aff Constructive', minutes: 6, color: 'bg-blue-500' },
      { id: 'nc', label: 'Neg Constructive', minutes: 7, color: 'bg-red-500' },
      { id: 'ar1', label: '1st Aff Rebuttal', minutes: 4, color: 'bg-blue-400' },
      { id: 'nr', label: 'Neg Rebuttal', minutes: 6, color: 'bg-red-400' },
      { id: 'ar2', label: '2nd Aff Rebuttal', minutes: 3, color: 'bg-blue-600' },
    ]
  },
  {
    id: 'pf',
    name: 'Public Forum',
    speeches: [
      { id: 'team1_c', label: 'Team 1 Constructive', minutes: 4, color: 'bg-blue-500' },
      { id: 'team2_c', label: 'Team 2 Constructive', minutes: 4, color: 'bg-red-500' },
      { id: 'team1_r', label: 'Team 1 Rebuttal', minutes: 4, color: 'bg-blue-400' },
      { id: 'team2_r', label: 'Team 2 Rebuttal', minutes: 4, color: 'bg-red-400' },
      { id: 'team1_s', label: 'Team 1 Summary', minutes: 3, color: 'bg-blue-600' },
      { id: 'team2_s', label: 'Team 2 Summary', minutes: 3, color: 'bg-red-600' },
      { id: 'team1_ff', label: 'Team 1 Final Focus', minutes: 2, color: 'bg-blue-700' },
      { id: 'team2_ff', label: 'Team 2 Final Focus', minutes: 2, color: 'bg-red-700' },
    ]
  },
  {
    id: 'policy',
    name: 'Policy (CX)',
    speeches: [
      { id: '1ac', label: '1AC', minutes: 8, color: 'bg-blue-500' },
      { id: '1nc', label: '1NC', minutes: 8, color: 'bg-red-500' },
      { id: '2ac', label: '2AC', minutes: 8, color: 'bg-blue-400' },
      { id: '2nc', label: '2NC', minutes: 8, color: 'bg-red-400' },
      { id: '1nr', label: '1NR', minutes: 5, color: 'bg-red-600' },
      { id: '1ar', label: '1AR', minutes: 5, color: 'bg-blue-600' },
      { id: '2nr', label: '2NR', minutes: 5, color: 'bg-red-700' },
      { id: '2ar', label: '2AR', minutes: 5, color: 'bg-blue-700' },
    ]
  }
];

// Simple audio synth
const playSignal = (type: 'beep' | 'double-beep' | 'alarm') => {
  try {
    const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContext) return;

    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === 'beep') {
      osc.frequency.setValueAtTime(880, now); // A5
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    } else if (type === 'double-beep') {
      // First beep
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.setValueAtTime(0, now + 0.1);

      // Second beep
      osc.frequency.setValueAtTime(880, now + 0.15);
      gain.gain.setValueAtTime(0.1, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc.start(now);
      osc.stop(now + 0.6);
    } else if (type === 'alarm') {
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.linearRampToValueAtTime(880, now + 0.3);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  } catch (e) {
    console.error("Audio playback failed", e);
  }
};

export default function TimerPage() {
  const [formatId, setFormatId] = useState('standard');
  const [currentSpeechIdx, setCurrentSpeechIdx] = useState(0);

  const currentFormat = FORMATS.find(f => f.id === formatId) || FORMATS[0];
  const currentSpeech = currentFormat.speeches[currentSpeechIdx] || currentFormat.speeches[0];

  const [timeLeft, setTimeLeft] = useState(currentSpeech.minutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Reset when format changes
  useEffect(() => {
    setCurrentSpeechIdx(0);
    setIsRunning(false);
    setIsFinished(false);
    // currentFormat is correct here due to render cycle
    const firstSpeech = currentFormat.speeches[0];
    setTimeLeft(firstSpeech.minutes * 60);
  }, [formatId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Safety check if index is out of bounds for new format
  useEffect(() => {
    if (!currentFormat.speeches[currentSpeechIdx]) {
      setCurrentSpeechIdx(0);
      setIsRunning(false);
      setIsFinished(false);
      setTimeLeft(currentFormat.speeches[0].minutes * 60);
    }
  }, [currentFormat, currentSpeechIdx]);

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          const next = prev - 1;

          if (soundEnabled) {
            if (next === 60) playSignal('beep');
            if (next === 0) playSignal('double-beep');
          }

          if (next <= 0) {
            setIsRunning(false);
            setIsFinished(true);
            return 0;
          }
          return next;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, timeLeft, soundEnabled]);

  const toggleTimer = useCallback(() => setIsRunning(prev => !prev), []);

  const resetTimer = useCallback(() => {
    setIsRunning(false);
    setIsFinished(false);
    const speech = currentFormat.speeches[currentSpeechIdx] || currentFormat.speeches[0];
    setTimeLeft(speech.minutes * 60);
  }, [currentFormat, currentSpeechIdx]);

  const nextSpeech = useCallback(() => {
    if (currentSpeechIdx < currentFormat.speeches.length - 1) {
      setCurrentSpeechIdx(prev => prev + 1);
      // Automatically reset timer for next speech
      setIsRunning(false);
      setIsFinished(false);
      const nextSpeechObj = currentFormat.speeches[currentSpeechIdx + 1];
      setTimeLeft(nextSpeechObj.minutes * 60);
    }
  }, [currentSpeechIdx, currentFormat]);

  const prevSpeech = useCallback(() => {
    if (currentSpeechIdx > 0) {
      setCurrentSpeechIdx(prev => prev - 1);
      setIsRunning(false);
      setIsFinished(false);
      const prevSpeechObj = currentFormat.speeches[currentSpeechIdx - 1];
      setTimeLeft(prevSpeechObj.minutes * 60);
    }
  }, [currentSpeechIdx, currentFormat]);

  // Handle manual speech selection
  const handleSpeechSelect = (idx: number) => {
    setCurrentSpeechIdx(idx);
    setIsRunning(false);
    setIsFinished(false);
    const speech = currentFormat.speeches[idx];
    setTimeLeft(speech.minutes * 60);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          toggleTimer();
          break;
        case 'KeyR':
        case 'Escape':
          resetTimer();
          break;
        case 'ArrowRight':
          nextSpeech();
          break;
        case 'ArrowLeft':
          prevSpeech();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleTimer, resetTimer, nextSpeech, prevSpeech]); // Include all dependencies

  const totalDuration = (currentSpeech.minutes || 0) * 60;
  const progress = Math.min(100, Math.max(0, ((totalDuration - timeLeft) / totalDuration) * 100));

  return (
    <div className="container py-8 px-4">
      <div className="max-w-3xl mx-auto text-center">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Debate Timer</h1>
          <p className="text-muted-foreground mt-1">
            Professional timer with signals and multiple formats
          </p>
        </div>

        <div className="flex justify-between items-center mb-6 max-w-xl mx-auto">
          <Select value={formatId} onValueChange={(val) => {
            setFormatId(val);
            // Safety handling is done in useEffect, but we can also reset state here if desired
          }}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select Format" />
            </SelectTrigger>
            <SelectContent>
              {FORMATS.map(f => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="ghost" size="icon" onClick={() => setSoundEnabled(!soundEnabled)}>
            {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5 text-muted-foreground" />}
          </Button>
        </div>

        <Card className="border-primary/20 bg-card/50 backdrop-blur-sm shadow-xl">
          <CardHeader>
            <div className="flex justify-center gap-2 mb-4 flex-wrap">
              {currentFormat.speeches.map((s, idx) => (
                <Button
                  key={s.id}
                  variant={idx === currentSpeechIdx ? "default" : "outline"}
                  onClick={() => handleSpeechSelect(idx)}
                  className={`transition-all ${idx === currentSpeechIdx ? s.color : "opacity-70 hover:opacity-100"}`}
                  size="sm"
                >
                  {s.label} ({s.minutes}m)
                </Button>
              ))}
            </div>
            <CardTitle className="sr-only">Timer Display</CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* Timer Display */}
            <div className="relative flex items-center justify-center h-72 w-72 mx-auto rounded-full border-8 border-muted bg-background/50 shadow-inner">
              <div className={`absolute inset-0 rounded-full border-8 border-primary transition-all duration-1000`}
                style={{ clipPath: `inset(${100 - progress}% 0 0 0)` }} />

              <div className="text-center z-10 flex flex-col items-center justify-center">
                <div className={`text-7xl font-mono font-bold tracking-tighter tabular-nums ${timeLeft < 30 && timeLeft > 0 ? 'text-destructive animate-pulse' : 'text-foreground'}`}>
                  {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                </div>
                <div className="text-sm text-muted-foreground mt-4 font-medium uppercase tracking-widest flex items-center gap-2">
                  {isFinished ? "TIME UP" : isRunning ? "SPEAKING" : "PAUSED"}
                  {soundEnabled && <Bell className="h-3 w-3" />}
                </div>
                <Badge variant="outline" className="mt-2 text-xs">
                  {currentSpeech.name || currentSpeech.label}
                </Badge>
              </div>
            </div>

            <Progress value={progress} className="h-2 w-full" />

            {/* Controls */}
            <div className="flex justify-center gap-4">
              <Button
                size="lg"
                variant={isRunning ? "secondary" : "default"}
                className="h-16 w-32 text-xl shadow-lg"
                onClick={toggleTimer}
              >
                {isRunning ? (
                  <>
                    <Pause className="mr-2 h-6 w-6" /> Pause
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-6 w-6" /> Start
                  </>
                )}
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-16 w-16 shadow-sm"
                onClick={resetTimer}
              >
                <RotateCcw className="h-6 w-6" />
              </Button>
            </div>

            <div className="text-xs text-muted-foreground pt-4 flex items-center justify-center gap-4">
              <span className="flex items-center gap-1"><Keyboard className="h-3 w-3" /> Space: Start/Stop</span>
              <span className="flex items-center gap-1"><Keyboard className="h-3 w-3" /> R/Esc: Reset</span>
              <span className="flex items-center gap-1"><Keyboard className="h-3 w-3" /> Arrows: Change Speech</span>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8">
          <Card className="bg-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4" /> Signals
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm flex justify-center gap-8 text-muted-foreground">
              <span className="flex items-center gap-2">1 min left: <b>1 Beep</b></span>
              <span className="flex items-center gap-2">Time up: <b>2 Beeps</b></span>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
