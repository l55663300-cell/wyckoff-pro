import { useState, useEffect, useRef, useCallback } from 'react';

export function useCountdown(totalMs: number, onComplete?: () => void) {
  const [remainingMs, setRemainingMs] = useState(totalMs);
  const [isRunning, setIsRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRunning(false);
  }, []);

  const start = useCallback(() => {
    stopTimer();
    setIsRunning(true);
    startTimeRef.current = Date.now();
    setRemainingMs(totalMs);

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, totalMs - elapsed);
      setRemainingMs(remaining);

      if (remaining === 0) {
        stopTimer();
        onCompleteRef.current?.();
      }
    }, 500);
  }, [totalMs, stopTimer]);

  const reset = useCallback(() => {
    stopTimer();
    setRemainingMs(totalMs);
  }, [totalMs, stopTimer]);

  useEffect(() => {
    return () => stopTimer();
  }, [stopTimer]);

  const minutes = Math.floor(remainingMs / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);
  const progress = ((totalMs - remainingMs) / totalMs) * 100;

  return {
    remainingMs,
    minutes,
    seconds,
    progress,
    isRunning,
    start,
    stop: stopTimer,
    reset,
  };
}
