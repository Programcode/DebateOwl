import { useState, useEffect, useCallback } from 'react';
import { useSettingsStore } from '@/lib/stores/settings-store';
import { toIntlLocale } from '@/lib/languages';

// Use type assertion for window because SpeechRecognition is not standard yet
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export function useSpeechToText() {
  const language = useSettingsStore((state) => state.language);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Lazy initializer: reads `window` once at mount instead of on every render.
  const [hasSupport] = useState(() => !!(window.SpeechRecognition || window.webkitSpeechRecognition));

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setIsListening(false);
      const recognitionInstance = new SpeechRecognition();
      recognitionInstance.continuous = true;
      recognitionInstance.interimResults = true;
      recognitionInstance.lang = toIntlLocale(language);

      recognitionInstance.onresult = (event: SpeechRecognitionEvent) => {
        setError(null);
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            // interim logic if needed, but we usually just want final
          }
        }
        if (finalTranscript) {
          setTranscript((prev) => prev + (prev ? ' ' : '') + finalTranscript);
        }
      };

      recognitionInstance.onend = () => {
        setIsListening(false);
      };

      recognitionInstance.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error', event.error);
        setError(event.error);
        setIsListening(false);
      };

      setRecognition(recognitionInstance);

      return () => {
        recognitionInstance.onresult = () => {};
        recognitionInstance.onend = () => {};
        recognitionInstance.onerror = () => {};
        recognitionInstance.abort();
      };
    }
  }, [language]);

  const startListening = useCallback(async () => {
    if (recognition && !isListening) {
      try {
        setError(null);
        if (navigator.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => track.stop());
        }
        recognition.start();
        setIsListening(true);
      } catch (e) {
        console.error("Failed to start speech recognition", e);
        const name = e instanceof DOMException ? e.name : '';
        setError(name === 'NotAllowedError' || name === 'PermissionDeniedError' ? 'not-allowed' : 'start-failed');
        setIsListening(false);
      }
    }
  }, [recognition, isListening]);

  const stopListening = useCallback(() => {
    if (recognition && isListening) {
      recognition.stop();
      setIsListening(false);
    }
  }, [recognition, isListening]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  return {
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    resetTranscript,
    hasSupport
  };
}
