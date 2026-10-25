import React, { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw, Sparkles, X } from 'lucide-react';
import { useOnlineStatus } from '../hooks/usePWAInstall';

interface VersionManifest {
  version: string;
  buildNumber: number;
  commit?: string;
  builtAt?: string;
  apkUrl: string;
  directApkUrl?: string;
  githubApkUrl?: string;
  releasesPageUrl?: string;
  githubReleasesUrl?: string;
}

const REMOTE_VERSION_URL =
  'https://carcarodon1968.github.io/Cronometro_3_misure_App/version.json';
const GITHUB_RELEASES_API =
  'https://api.github.com/repos/carcarodon1968/Cronometro_3_misure_App/releases';
const DEFAULT_APK_URL =
  'https://carcarodon1968.github.io/Cronometro_3_misure_App/Cronometro_3_misure_v.1.0.7.apk';
const DEFAULT_UPDATE_PAGE_URL =
  'https://carcarodon1968.github.io/Cronometro_3_misure_App/update.html?v=1.0.7';

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
  const cap = (
    window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
    }
  ).Capacitor;
  if (cap?.isNativePlatform?.()) return true;
  if (cap?.getPlatform?.() === 'android') return true;
  const ua = navigator.userAgent || '';
  if (/wv/i.test(ua) && /Android/i.test(ua)) return true;
  if (/Android/i.test(ua) && window.location.hostname === 'localhost') return true;
  return false;
}

function isBrowserApkUpdateLanding(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname || '';
  const params = new URLSearchParams(window.location.search || '');
  return /update\.html/i.test(path) || params.has('v') || params.has('b');
}

interface ApkDownloadProgressDetail {
  status: 'downloading' | 'completed' | 'error';
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  message?: string;
}

interface AndroidApkUpdaterBridge {
  isAvailable?: () => boolean;
  downloadAndInstall?: (apkUrl: string, fileName: string) => void;
  installPendingApk?: () => void;
}

function getAndroidApkUpdater(): AndroidApkUpdaterBridge | null {
  if (typeof window === 'undefined') return null;
  const bridge = (
    window as unknown as { AndroidApkUpdater?: AndroidApkUpdaterBridge }
  ).AndroidApkUpdater;
  if (bridge && typeof bridge.downloadAndInstall === 'function') {
    return bridge;
  }
  return null;
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
  const [apkProgress, setApkProgress] = useState<ApkDownloadProgressDetail | null>(
    null
  );
  const isNativeApk = isRunningInAndroidApk();

  useEffect(() => {
    const handleApkProgress = (event: Event) => {
      const customEvent = event as CustomEvent<ApkDownloadProgressDetail>;
      if (customEvent.detail) {
        setApkProgress(customEvent.detail);
      }
    };
    window.addEventListener('apk-download-progress', handleApkProgress);
    return () => {
      window.removeEventListener('apk-download-progress', handleApkProgress);
    };
  }, []);

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
        version: '1.0.7',
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
                normalizeVersion(highestRelease?.tag_name || '') || '1.0.7';
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

  const handleWebAppReload = useCallback(async () => {
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
  }, []);

  const isBrowserUpdateLanding = isBrowserApkUpdateLanding();
  const [browserLandingDismissed, setBrowserLandingDismissed] = useState(false);

  const targetVersion = normalizeVersion(
    remoteInfo?.version ||
      (typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('v') || '1.0.7'
        : '1.0.7')
  );
  const directBinaryApkUrl =
    remoteInfo?.directApkUrl ||
    `https://carcarodon1968.github.io/Cronometro_3_misure_App/Cronometro_3_misure_v.${targetVersion}.apk`;
  const githubReleaseApkUrl =
    remoteInfo?.githubApkUrl ||
    `https://github.com/carcarodon1968/Cronometro_3_misure_App/releases/download/v.${targetVersion}/Cronometro_3_misure_v.${targetVersion}.apk`;
  const updatePageUrl =
    remoteInfo?.releasesPageUrl ||
    remoteInfo?.apkUrl ||
    DEFAULT_UPDATE_PAGE_URL;

  // On the Web App (browser or installed PWA), trigger silent auto-update if a newer build is detected
  useEffect(() => {
    if (!isNativeApk && updateAvailable && remoteInfo) {
      const autoReloadKey = `cronometro3_autoreload_${remoteInfo.version}_${remoteInfo.buildNumber}`;
      try {
        if (!sessionStorage.getItem(autoReloadKey)) {
          sessionStorage.setItem(autoReloadKey, '1');
          handleWebAppReload();
        }
      } catch {
        // Ignore sessionStorage errors
      }
    }
  }, [isNativeApk, updateAvailable, remoteInfo, handleWebAppReload]);

  // If the browser opened update.html?v=... (and an older Service Worker served index.html),
  // automatically start downloading the .apk file immediately.
  useEffect(() => {
    if (!isNativeApk && isBrowserUpdateLanding && typeof window !== 'undefined') {
      const timer = setTimeout(() => {
        const a = document.createElement('a');
        a.href = directBinaryApkUrl;
        a.setAttribute('download', `Cronometro_3_misure_v.${targetVersion}.apk`);
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [isNativeApk, isBrowserUpdateLanding, directBinaryApkUrl, targetVersion]);

  if (!isNativeApk && isBrowserUpdateLanding && !browserLandingDismissed) {
    return (
      <div className="fixed inset-0 z-[9999] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-5 overflow-y-auto">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center shadow-2xl">
          <div className="inline-block bg-orange-500/15 text-orange-400 border border-orange-500/40 text-xs font-extrabold px-3 py-1 rounded-full mb-3">
            AGGIORNAMENTO UFFICIALE APK v.{targetVersion}
          </div>
          <h1 className="text-xl font-extrabold text-orange-500 mb-2">
            Cronometro 3 misure
          </h1>
          <p className="text-xs text-slate-300 leading-relaxed mb-4">
            Installa la nuova versione sopra quella attuale. Tutte le misure salvate nel database restano intatte.
          </p>

          <a
            href={directBinaryApkUrl}
            download={`Cronometro_3_misure_v.${targetVersion}.apk`}
            className="flex items-center justify-center gap-2 w-full py-4 px-4 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-extrabold text-sm shadow-lg border border-white/20 mb-3"
          >
            <Download className="w-4 h-4" />
            <span>⬇ SCARICA E INSTALLA APK v.{targetVersion}</span>
          </a>

          <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-semibold p-3 mb-4 text-left leading-relaxed">
            ⏳ <strong>Download automatico avviato!</strong>
            <br />
            Se Chrome mostra un avviso in basso o in alto, tocca{' '}
            <strong>&quot;Scarica comunque&quot;</strong> e poi{' '}
            <strong>&quot;Apri&quot;</strong>.
            <br />
            <span className="text-amber-300 font-bold">
              ⚠️ Non chiudere questa pagina finché non si apre la schermata di installazione Android.
            </span>
          </div>

          <a
            href={githubReleaseApkUrl}
            className="block w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 mb-2"
          >
            Scarica da Server Alternativo (GitHub Release)
          </a>

          <button
            type="button"
            onClick={() => setBrowserLandingDismissed(true)}
            className="text-[11px] text-slate-400 hover:text-slate-200 underline mt-1 cursor-pointer"
          >
            Chiudi finestra e vai alla Web App
          </button>
        </div>
      </div>
    );
  }

  // Show the Verifica Aggiornamenti button and APK update banner ONLY inside the Android APK
  if (!isNativeApk) {
    return null;
  }

  const isDownloadingNative = apkProgress?.status === 'downloading';
  const isCompletedNative = apkProgress?.status === 'completed';

  const handleStartApkUpdate = () => {
    const updater = getAndroidApkUpdater();
    const targetVersion = remoteInfo?.version || '1.0.7';
    const fileName = `Cronometro_3_misure_v.${targetVersion}.apk`;

    if (updater && typeof updater.downloadAndInstall === 'function') {
      if (isCompletedNative && typeof updater.installPendingApk === 'function') {
        updater.installPendingApk();
        return;
      }
      setApkProgress({
        status: 'downloading',
        percent: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        message: 'Avvio download diretto...',
      });
      updater.downloadAndInstall(directBinaryApkUrl, fileName);
      return;
    }

    // Fallback: open update.html (which MainActivity also intercepts natively in Java,
    // and on older APKs opens a real HTML page instead of Chrome's .pending interstitial)
    window.open(updatePageUrl, '_blank', 'noopener,noreferrer');
  };

  const formatMB = (bytes: number) => (bytes / (1024 * 1024)).toFixed(2);

  const showBanner =
    updateAvailable &&
    remoteInfo !== null &&
    dismissedBuild !== remoteInfo.buildNumber;

  return (
    <>
      {/* Subtle quick-check & direct APK download bar inside header area (APK only) */}
      <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-400">
        <button
          type="button"
          onClick={() => checkUpdates(true)}
          disabled={isChecking || isDownloadingNative}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 font-semibold border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
          title="Controlla se è disponibile un nuovo aggiornamento APK su GitHub"
        >
          <RefreshCw className={`w-3 h-3 text-orange-400 ${isChecking ? 'animate-spin' : ''}`} />
          <span>{isChecking ? 'Controllo...' : 'Verifica Aggiornamenti'}</span>
        </button>

        {manualStatus && (
          <span className="text-orange-400 font-semibold">{manualStatus}</span>
        )}
      </div>

      {/* Automatic Update Banner when a new GitHub APK build/version is detected */}
      {showBanner && remoteInfo && (
        <div className="w-full bg-gradient-to-r from-orange-600 to-amber-600 text-white px-4 py-3 shadow-lg border-b border-orange-400/40">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-center sm:text-left">
              <Sparkles className="w-5 h-5 shrink-0 text-white animate-pulse" />
              <div className="text-xs sm:text-sm font-bold">
                <span>
                  Nuovo aggiornamento disponibile: v.{remoteInfo.version}
                </span>
                <p className="text-[11px] font-normal text-orange-100 mt-0.5">
                  Scarica e installa il nuovo APK direttamente sopra questa versione senza perdere i dati del database.
                </p>

                {apkProgress && (
                  <div className="mt-2 space-y-1 text-left">
                    <div className="w-full bg-slate-950/40 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-white h-full transition-all duration-200"
                        style={{
                          width: `${Math.min(100, Math.max(0, apkProgress.percent || 0))}%`,
                        }}
                      />
                    </div>
                    <p className="text-[11px] font-mono-tabular text-white">
                      {apkProgress.status === 'downloading' && (
                        <>
                          Scaricamento diretto in corso: {apkProgress.percent}%
                          {apkProgress.totalBytes > 0
                            ? ` (${formatMB(apkProgress.downloadedBytes)} / ${formatMB(
                                apkProgress.totalBytes
                              )} MB)`
                            : ''}
                        </>
                      )}
                      {apkProgress.status === 'completed' && (
                        <span>
                          Download completato! Apertura installatore Android...
                        </span>
                      )}
                      {apkProgress.status === 'error' && (
                        <span className="text-rose-200">
                          Errore download diretto ({apkProgress.message}). Usa &quot;Apri Release GitHub&quot;.
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleStartApkUpdate}
                disabled={isDownloadingNative}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-900 disabled:opacity-60 text-white text-xs font-extrabold shadow-sm border border-white/20 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-orange-400" />
                <span>
                  {isDownloadingNative
                    ? `Scaricamento ${apkProgress?.percent ?? 0}%...`
                    : isCompletedNative
                    ? 'Installa APK Scaricato'
                    : 'Scarica e Aggiorna APK'}
                </span>
              </button>

              {apkProgress?.status === 'error' && (
                <a
                  href={updatePageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-[11px] font-bold transition-colors"
                >
                  <span>Apri Pagina Aggiornamento</span>
                </a>
              )}

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

