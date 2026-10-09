import React, { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw, Sparkles, X } from 'lucide-react';
import { useOnlineStatus } from '../hooks/usePWAInstall';

interface VersionManifest {
  version: string;
  buildNumber: number;
  commit?: string;
  builtAt?: string;
  apkUrl: string;
  releasesPageUrl?: string;
}

const REMOTE_VERSION_URL =
  'https://carcarodon1968.github.io/Cronometro_3_misure_App/version.json';
const GITHUB_RELEASES_API =
  'https://api.github.com/repos/carcarodon1968/Cronometro_3_misure_App/releases';
const DEFAULT_APK_URL =
  'https://github.com/carcarodon1968/Cronometro_3_misure_App/releases/download/v.1.0.2/Cronometro_3_misure_v.1.0.2.apk';

function normalizeVersion(v: string): string {
  return String(v || '')
    .trim()
    .replace(/^v\.?/i, '');
}

/**
 * Confronta due versioni semantiche (es. "1.0.2" vs "1.0.1").
 * Restituisce:
 *   1 se v1 > v2
 *  -1 se v1 < v2
 *   0 se v1 === v2
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = normalizeVersion(v1)
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const parts2 = normalizeVersion(v2)
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const maxLen = Math.max(parts1.length, parts2.length, 3);
  for (let i = 0; i < maxLen; i++) {
    const a = parts1[i] ?? 0;
    const b = parts2[i] ?? 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

function isRunningInAndroidApk(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
  if (cap?.isNativePlatform?.()) return true;
  if (cap?.getPlatform?.() === 'android') return true;
  const ua = navigator.userAgent || '';
  if (/wv/i.test(ua) && /Android/i.test(ua)) return true;
  return false;
}

export const PWAInstallButton: React.FC = () => {
  return null;
};

export const AppUpdateBanner: React.FC = () => {
  const isOnline = useOnlineStatus();
  const [localInfo, setLocalInfo] = useState<VersionManifest | null>(null);
  const [remoteInfo, setRemoteInfo] = useState<VersionManifest | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const [dismissedBuild, setDismissedBuild] = useState<number | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [manualStatus, setManualStatus] = useState<string | null>(null);
  const isNativeApk = isRunningInAndroidApk();

  const checkUpdates = useCallback(async (isManual = false) => {
    if (typeof window === 'undefined' || !navigator.onLine) {
      if (isManual) {
        setManualStatus('Nessuna connessione Internet disponibile.');
        setTimeout(() => setManualStatus(null), 3500);
      }
      return;
    }

    try {
      setIsChecking(true);
      const ts = Date.now();

      // 1. Read local bundled version.json
      let currentLocal: VersionManifest = {
        version: '1.0.2',
        buildNumber: 0,
        apkUrl: DEFAULT_APK_URL,
      };
      try {
        const localRes = await fetch(`./version.json?t=${ts}`, { cache: 'no-store' });
        if (localRes.ok) {
          currentLocal = await localRes.json();
          setLocalInfo(currentLocal);
        }
      } catch {
        // Fallback to default local manifest
      }

      // 2. Read remote version.json published on GitHub Pages
      let fetchedRemote: VersionManifest | null = null;
      try {
        const remoteRes = await fetch(`${REMOTE_VERSION_URL}?t=${ts}`, {
          cache: 'no-store',
        });
        if (remoteRes.ok) {
          fetchedRemote = await remoteRes.json();
        }
      } catch {
        // Fallback to GitHub Releases API if version.json is not reachable yet
      }

      // 3. Fallback to GitHub Releases API (seleziona sempre la versione numerica più alta, ignorando release più vecchie caricate dopo)
      if (!fetchedRemote) {
        try {
          const releaseRes = await fetch(GITHUB_RELEASES_API, {
            cache: 'no-store',
          });
          if (releaseRes.ok) {
            const releasesList = await releaseRes.json();
            if (Array.isArray(releasesList) && releasesList.length > 0) {
              const sortedReleases = [...releasesList].sort((a, b) =>
                compareVersions(String(b?.tag_name || ''), String(a?.tag_name || ''))
              );
              const highestRelease = sortedReleases[0];
              const tagVersion =
                normalizeVersion(highestRelease?.tag_name || '') || '1.0.2';
              const apkAsset = Array.isArray(highestRelease?.assets)
                ? highestRelease.assets.find((a: { name?: string }) =>
                    String(a.name || '').endsWith('.apk')
                  )
                : null;
              fetchedRemote = {
                version: tagVersion,
                buildNumber: 0,
                apkUrl: apkAsset?.browser_download_url || DEFAULT_APK_URL,
                releasesPageUrl: highestRelease?.html_url,
              };
            }
          }
        } catch {
          // Ignore network error
        }
      }

      if (fetchedRemote) {
        setRemoteInfo(fetchedRemote);
        const versionCmp = compareVersions(
          fetchedRemote.version,
          currentLocal.version
        );
        const hasNewerVersion = versionCmp > 0;
        const hasNewerBuild =
          versionCmp === 0 &&
          currentLocal.buildNumber > 0 &&
          fetchedRemote.buildNumber > currentLocal.buildNumber;

        if (hasNewerVersion || hasNewerBuild) {
          setUpdateAvailable(true);
          setDismissedBuild(null);
          if (isManual) {
            setManualStatus(`Nuova versione v.${fetchedRemote.version} trovata!`);
            setTimeout(() => setManualStatus(null), 3500);
          }
        } else {
          setUpdateAvailable(false);
          if (isManual) {
            setManualStatus(
              `Hai già l’ultima versione installata (v.${currentLocal.version}).`
            );
            setTimeout(() => setManualStatus(null), 3500);
          }
        }
      }
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkUpdates(false);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkUpdates(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [checkUpdates, isOnline]);

  const handleWebAppReload = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.update();
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        }
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    } catch {
      // Ignore cache clear errors
    }
    window.location.reload();
  };

  const apkDownloadUrl = remoteInfo?.apkUrl || localInfo?.apkUrl || DEFAULT_APK_URL;
  const showBanner =
    updateAvailable &&
    remoteInfo !== null &&
    dismissedBuild !== remoteInfo.buildNumber;

  return (
    <>
      {/* Subtle quick-check & direct APK download bar inside header area */}
      <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-400">
        {localInfo && localInfo.buildNumber > 0 && (
          <span className="font-mono-tabular text-slate-400">
            Build #{localInfo.buildNumber}
          </span>
        )}
        <button
          type="button"
          onClick={() => checkUpdates(true)}
          disabled={isChecking}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 font-semibold border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
          title="Controlla se è disponibile un nuovo aggiornamento su GitHub"
        >
          <RefreshCw className={`w-3 h-3 text-orange-400 ${isChecking ? 'animate-spin' : ''}`} />
          <span>{isChecking ? 'Controllo...' : 'Verifica Aggiornamenti'}</span>
        </button>

        {manualStatus && (
          <span className="text-orange-400 font-semibold">{manualStatus}</span>
        )}
      </div>

      {/* Automatic Update Banner when a new GitHub build/version is detected */}
      {showBanner && remoteInfo && (
        <div className="w-full bg-gradient-to-r from-orange-600 to-amber-600 text-white px-4 py-3 shadow-lg border-b border-orange-400/40">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-center sm:text-left">
              <Sparkles className="w-5 h-5 shrink-0 text-white animate-pulse" />
              <div className="text-xs sm:text-sm font-bold">
                <span>
                  Nuovo aggiornamento disponibile: v.{remoteInfo.version}
                  {remoteInfo.buildNumber > 0 ? ` (Build #${remoteInfo.buildNumber})` : ''}
                </span>
                <p className="text-[11px] font-normal text-orange-100 mt-0.5">
                  {isNativeApk
                    ? 'Scarica e installa il nuovo APK direttamente sopra questa versione senza perdere i dati del database.'
                    : 'È stata pubblicata una nuova versione su GitHub.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!isNativeApk && (
                <button
                  type="button"
                  onClick={handleWebAppReload}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-orange-700 hover:bg-orange-50 text-xs font-extrabold shadow-sm transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Aggiorna Web App</span>
                </button>
              )}

              <a
                href={apkDownloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-900 text-white text-xs font-extrabold shadow-sm border border-white/20 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-orange-400" />
                <span>Scarica e Aggiorna APK</span>
              </a>

              <button
                type="button"
                onClick={() => setDismissedBuild(remoteInfo.buildNumber)}
                className="p-1.5 rounded-lg hover:bg-white/15 text-white/90 transition-colors cursor-pointer"
                aria-label="Chiudi avviso aggiornamento"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg">
      <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
      <span>Modalità Offline — Database locale IndexedDB attivo</span>
    </div>
  );
};

