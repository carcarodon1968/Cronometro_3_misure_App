import { useEffect, useRef } from 'react';

interface WakeLockSentinelLike {
  released?: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

/**
 * Mantiene il display dello smartphone sempre acceso e alla massima luminosità
 * (senza attenuarsi né spegnersi) finché l'app è in primo piano (foreground).
 * Quando l'app passa in background (visibilityState === 'hidden'), rilascia
 * immediatamente il blocco permettendo al display di spegnersi normalmente.
 */
export function useScreenWakeLock(): void {
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const isRequestingRef = useRef<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    const releaseWakeLock = async () => {
      const currentLock = wakeLockRef.current;
      wakeLockRef.current = null;
      if (currentLock && !currentLock.released) {
        try {
          await currentLock.release();
        } catch {
          // Ignora eventuali errori di rilascio se già rilasciato dal sistema
        }
      }
    };

    const requestWakeLock = async () => {
      if (!isMounted) return;
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') {
        return;
      }
      if (wakeLockRef.current && !wakeLockRef.current.released) {
        return;
      }
      if (isRequestingRef.current) {
        return;
      }

      const nav = navigator as Navigator & {
        wakeLock?: {
          request: (type: 'screen') => Promise<WakeLockSentinelLike>;
        };
      };

      if (!nav.wakeLock || typeof nav.wakeLock.request !== 'function') {
        return;
      }

      isRequestingRef.current = true;
      try {
        const sentinel = await nav.wakeLock.request('screen');
        if (!isMounted || document.visibilityState !== 'visible') {
          await sentinel.release().catch(() => {});
          return;
        }

        wakeLockRef.current = sentinel;

        const handleSentinelRelease = () => {
          if (wakeLockRef.current === sentinel) {
            wakeLockRef.current = null;
          }
          // Se l'app è ancora in primo piano, riattiva subito il blocco schermo
          if (isMounted && document.visibilityState === 'visible') {
            requestWakeLock().catch(() => {});
          }
        };

        sentinel.addEventListener?.('release', handleSentinelRelease);
      } catch {
        // Alcuni browser richiedono un primo tocco utente prima di concedere il Wake Lock;
        // i listener su pointerdown/touchstart/keydown provvederanno a riattivarlo subito.
      } finally {
        isRequestingRef.current = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock().catch(() => {});
      } else {
        // App in background: rilascia il Wake Lock così il display può spegnersi
        releaseWakeLock().catch(() => {});
      }
    };

    const handleWindowFocus = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock().catch(() => {});
      }
    };

    const handlePageHide = () => {
      releaseWakeLock().catch(() => {});
    };

    const handleUserInteraction = () => {
      if (
        document.visibilityState === 'visible' &&
        (!wakeLockRef.current || wakeLockRef.current.released)
      ) {
        requestWakeLock().catch(() => {});
      }
    };

    // Richiedi subito all'avvio se l'app è visibile in primo piano
    requestWakeLock().catch(() => {});

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handleWindowFocus);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pointerdown', handleUserInteraction, { passive: true });
    window.addEventListener('touchstart', handleUserInteraction, { passive: true });
    window.addEventListener('keydown', handleUserInteraction, { passive: true });

    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handleWindowFocus);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pointerdown', handleUserInteraction);
      window.removeEventListener('touchstart', handleUserInteraction);
      window.removeEventListener('keydown', handleUserInteraction);
      releaseWakeLock().catch(() => {});
    };
  }, []);
}
