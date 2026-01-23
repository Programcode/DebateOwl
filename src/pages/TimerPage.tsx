import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, RotateCcw, Timer as TimerIcon, Bell } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

type TimerMode = 'intro' | 'r1' | 'r2' | 'conc' | 'custom';

const MODES: { id: TimerMode; label: string; minutes: number; color: string }[] = [
  { id: 'intro', label: 'Introductor', minutes: 4, color: 'bg-blue-500' },
  { id: 'r1', label: 'Refutation 1', minutes: 6, color: 'bg-orange-500' },
  { id: 'r2', label: 'Refutation 2', minutes: 6, color: 'bg-red-500' },
  { id: 'conc', label: 'Conclusor', minutes: 3, color: 'bg-green-500' },
];

export default function TimerPage() {
  const [mode, setMode] = useState<TimerMode>('intro');
  const [timeLeft, setTimeLeft] = useState(4 * 60);
  const [totalTime, setTotalTime] = useState(4 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Initialize audio (using a simple beep if file not present, or just visual for now)
    // audioRef.current = new Audio('/beep.mp3'); 
  }, []);

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            setIsRunning(false);
            setIsFinished(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, timeLeft]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const setTimerMode = (newMode: TimerMode) => {
    setIsRunning(false);
    setIsFinished(false);
    setMode(newMode);
    const selectedMode = MODES.find(m => m.id === newMode);
    if (selectedMode) {
      setTotalTime(selectedMode.minutes * 60);
      setTimeLeft(selectedMode.minutes * 60);
    }
  };

  const toggleTimer = () => setIsRunning(!isRunning);
  
  const resetTimer = () => {
    setIsRunning(false);
    setIsFinished(false);
    const selectedMode = MODES.find(m => m.id === mode);
    if (selectedMode) {
      setTimeLeft(selectedMode.minutes * 60);
    }
  };

  const progress = ((totalTime - timeLeft) / totalTime) * 100;

  return (
    <div className="container py-8 px-4">
      <div className="max-w-3xl mx-auto text-center">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Debate Timer</h1>
          <p className="text-muted-foreground mt-1">
            Track speech times for the Standard Tournament format (4-6-6-3)
          </p>
        </div>

        <Card className="border-primary/20 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <div className="flex justify-center gap-2 mb-4 flex-wrap">
              {MODES.map((m) => (
                <Button
                  key={m.id}
                  variant={mode === m.id ? "default" : "outline"}
                  onClick={() => setTimerMode(m.id)}
                  className={mode === m.id ? m.color : ""}
                >
                  {m.label} ({m.minutes}m)
                </Button>
              ))}
            </div>
            <CardTitle className="sr-only">Timer Display</CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* Timer Display */}
            <div className="relative flex items-center justify-center h-64 w-64 mx-auto rounded-full border-8 border-muted">
               <div className={`absolute inset-0 rounded-full border-8 border-primary transition-all duration-1000`} 
                    style={{ clipPath: `inset(${100 - progress}% 0 0 0)` }} />
               
               <div className="text-center z-10">
                 <div className={`text-7xl font-mono font-bold tracking-tighter ${timeLeft < 30 ? 'text-destructive animate-pulse' : 'text-foreground'}`}>
                   {formatTime(timeLeft)}
                 </div>
                 <div className="text-sm text-muted-foreground mt-2 font-medium uppercase tracking-widest">
                   {isFinished ? "TIME UP" : isRunning ? "SPEAKING" : "PAUSED"}
                 </div>
               </div>
            </div>

            <Progress value={progress} className="h-2 w-full" />

            {/* Controls */}
            <div className="flex justify-center gap-4">
              <Button
                size="lg"
                variant={isRunning ? "secondary" : "default"}
                className="h-16 w-32 text-xl"
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
                className="h-16 w-16"
                onClick={resetTimer}
              >
                <RotateCcw className="h-6 w-6" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 text-left">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TimerIcon className="h-4 w-4" /> Role Format
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex justify-between">
                <span>Introductor</span>
                <span className="font-mono text-muted-foreground">4:00</span>
              </div>
              <div className="flex justify-between">
                <span>Refutation 1 (R1)</span>
                <span className="font-mono text-muted-foreground">6:00</span>
              </div>
              <div className="flex justify-between">
                <span>Refutation 2 (R2)</span>
                <span className="font-mono text-muted-foreground">6:00</span>
              </div>
              <div className="flex justify-between">
                <span>Conclusor</span>
                <span className="font-mono text-muted-foreground">3:00</span>
              </div>
            </CardContent>
          </Card>

          <Card>
             <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4" /> Signals
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2 text-muted-foreground">
              <p>• 1 min protected time (start/end)</p>
              <p>• Single knock: 1 min remaining</p>
              <p>• Double knock: Time up</p>
              <p>• Continuous: 15s over time</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
