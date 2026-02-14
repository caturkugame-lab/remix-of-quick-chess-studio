import { useRef, useCallback, useState, useEffect } from 'react';

type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

export function useConnectionStatus() {
  const [status, setStatus] = useState<ConnectionStatus>('connected');
  const [offlineSince, setOfflineSince] = useState<number | null>(null);

  useEffect(() => {
    const handleOnline = () => {
      setStatus('connected');
      setOfflineSince(null);
    };
    const handleOffline = () => {
      setStatus('reconnecting');
      setOfflineSince(Date.now());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Also check periodically
    const interval = setInterval(() => {
      if (!navigator.onLine && status === 'connected') {
        setStatus('reconnecting');
        setOfflineSince(Date.now());
      }
      if (navigator.onLine && status !== 'connected') {
        setStatus('connected');
        setOfflineSince(null);
      }
      // Auto-disconnect after 30s offline
      if (offlineSince && Date.now() - offlineSince > 30000) {
        setStatus('disconnected');
      }
    }, 1000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [status, offlineSince]);

  return { status, offlineSince };
}

export function useMoveRetry() {
  const pendingMoves = useRef<Map<string, { 
    fn: () => Promise<any>; 
    retries: number;
    maxRetries: number;
  }>>(new Map());
  const [pendingCount, setPendingCount] = useState(0);

  const submitMove = useCallback(async (
    moveId: string,
    fn: () => Promise<any>,
    maxRetries = 3
  ): Promise<boolean> => {
    const attempt = async (retryCount: number): Promise<boolean> => {
      try {
        await fn();
        pendingMoves.current.delete(moveId);
        setPendingCount(pendingMoves.current.size);
        return true;
      } catch (err) {
        if (retryCount < maxRetries) {
          // Exponential backoff: 500ms, 1s, 2s
          const delay = Math.min(500 * Math.pow(2, retryCount), 4000);
          await new Promise(r => setTimeout(r, delay));
          return attempt(retryCount + 1);
        }
        pendingMoves.current.delete(moveId);
        setPendingCount(pendingMoves.current.size);
        return false;
      }
    };

    pendingMoves.current.set(moveId, { fn, retries: 0, maxRetries });
    setPendingCount(pendingMoves.current.size);
    return attempt(0);
  }, []);

  return { submitMove, pendingCount };
}

export function useMusicPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.3);

  useEffect(() => {
    // Create audio context with a generated ambient tone
    const stored = localStorage.getItem('chess-music-enabled');
    if (stored === 'true') {
      startMusic();
    }
  }, []);

  const createAmbientAudio = useCallback(() => {
    // Generate a simple ambient audio using Web Audio API
    const ctx = new AudioContext();
    
    // Create a gentle ambient pad sound
    const createOscillator = (freq: number, gain: number, type: OscillatorType = 'sine') => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gainNode.gain.setValueAtTime(gain * volume, ctx.currentTime);
      
      // Gentle volume modulation
      gainNode.gain.setValueAtTime(gain * volume * 0.7, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(gain * volume, ctx.currentTime + 4);
      gainNode.gain.linearRampToValueAtTime(gain * volume * 0.7, ctx.currentTime + 8);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      return { osc, gainNode };
    };

    // Ambient chord: C major with 7th
    const oscs = [
      createOscillator(130.81, 0.05, 'sine'),   // C3
      createOscillator(164.81, 0.03, 'sine'),    // E3
      createOscillator(196.00, 0.03, 'sine'),    // G3
      createOscillator(246.94, 0.02, 'triangle'), // B3
    ];

    oscs.forEach(({ osc }) => osc.start());

    return { ctx, oscs };
  }, [volume]);

  const startMusic = useCallback(() => {
    setIsPlaying(true);
    localStorage.setItem('chess-music-enabled', 'true');
  }, []);

  const stopMusic = useCallback(() => {
    setIsPlaying(false);
    localStorage.setItem('chess-music-enabled', 'false');
  }, []);

  const toggleMusic = useCallback(() => {
    if (isPlaying) stopMusic();
    else startMusic();
  }, [isPlaying, startMusic, stopMusic]);

  const updateVolume = useCallback((v: number) => {
    setVolume(v);
    localStorage.setItem('chess-music-volume', String(v));
  }, []);

  return { isPlaying, volume, toggleMusic, updateVolume };
}
