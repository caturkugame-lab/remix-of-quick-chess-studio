import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const COOLDOWN_KEY = 'pwa-install-dismissed-at';
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Check if already in standalone mode (installed)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // Check cooldown
    const dismissedAt = localStorage.getItem(COOLDOWN_KEY);
    const inCooldown = dismissedAt && Date.now() - parseInt(dismissedAt) < COOLDOWN_MS;

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);
      setCanInstall(true);

      if (!inCooldown) {
        // Show install prompt after a short delay on first visit
        setTimeout(() => setShowPrompt(true), 2000);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setCanInstall(false);
      setShowPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        setIsInstalled(true);
        setShowPrompt(false);
        setCanInstall(false);
        return true;
      } else {
        // Set cooldown
        localStorage.setItem(COOLDOWN_KEY, Date.now().toString());
        setShowPrompt(false);
        return false;
      }
    } catch {
      return false;
    }
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    localStorage.setItem(COOLDOWN_KEY, Date.now().toString());
    setShowPrompt(false);
  }, []);

  const openPrompt = useCallback(() => {
    if (canInstall) setShowPrompt(true);
  }, [canInstall]);

  return {
    canInstall,
    isInstalled,
    showPrompt,
    install,
    dismiss,
    openPrompt,
  };
}
