/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Database,
  Edit3,
  History,
  Play,
  RotateCcw,
  Save,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react';
import {
  MeasurementRecord,
  computeFlowFromAverage,
  computeStatsFromTimes,
  formatFlowValue,
  formatTimeParts,
  parseContainerAmount,
  parseManualTimeToMs,
} from './types/measurement';
import {
  clearAllSessionsFromDB,
  deleteSessionFromDB,
  getAllSessions,
  importSessionsToDB,
  saveSessionToDB,
} from './db/localDatabase';
import { PWAInstallButton, OfflineIndicator } from './components/PWAInstallButton';
import { HistoryView } from './components/HistoryView';
import { AnalyticsView } from './components/AnalyticsView';
import { AndroidCodeView } from './components/AndroidCodeView';

type ActiveTab = 'chrono' | 'history' | 'analytics' | 'android_code';

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<ActiveTab>('chrono');

  // Stopwatch state (Always single independent trial from 00:00.00)
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [pendingTimeMs, setPendingTimeMs] = useState<number | null>(null);
  const [activeSlot, setActiveSlot] = useState<1 | 2 | 3>(1);
  const [autoSaveOnThirdStop, setAutoSaveOnThirdStop] = useState<boolean>(true);

  // 3 Measurement Fields (in ms)
  const [time1, setTime1] = useState<number | null>(null);
  const [time2, setTime2] = useState<number | null>(null);
  const [time3, setTime3] = useState<number | null>(null);

  // Top Session Inputs (Placed above the stopwatch: Categoria with Diga Sud, Nome Misura, Litri Contenitore empty by default)
  const [sessionCategory, setSessionCategory] = useState<string>('Diga Sud');
  const [sessionLabel, setSessionLabel] = useState<string>('');
  const [containerInput, setContainerInput] = useState<string>('');
  const [containerError, setContainerError] = useState<boolean>(false);
  const [sessionNotes, setSessionNotes] = useState<string>('');
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Manual field editing state
  const [editingSlot, setEditingSlot] = useState<1 | 2 | 3 | null>(null);
  const [manualInputValue, setManualInputValue] = useState<string>('');

  // Local Database History State
  const [sessions, setSessions] = useState<MeasurementRecord[]>([]);
  const [isLoadingDB, setIsLoadingDB] = useState<boolean>(true);

  // Refs
  const rafRef = useRef<number | null>(null);
  const startPerfRef = useRef<number>(0);
  const containerInputRef = useRef<HTMLInputElement | null>(null);

  // Ensure dark class is always set on root html element & automatically enter fullscreen in Web App mode
  useEffect(() => {
    document.documentElement.classList.add('dark');

    const enterFullscreenAutomatically = () => {
      try {
        if (
          typeof window !== 'undefined' &&
          window.self === window.top &&
          !document.fullscreenElement &&
          document.documentElement.requestFullscreen
        ) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } catch {
        // Ignore if blocked by browser policy
      }
    };

    window.addEventListener('pointerdown', enterFullscreenAutomatically, { once: true });
    return () => {
      window.removeEventListener('pointerdown', enterFullscreenAutomatically);
    };
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  // Load initial sessions from local IndexedDB
  useEffect(() => {
    let mounted = true;
    getAllSessions()
      .then((records) => {
        if (mounted) {
          setSessions(records);
          setIsLoadingDB(false);
        }
      })
      .catch(() => {
        if (mounted) setIsLoadingDB(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // Parsed container quantity & derived statistics (works for 1, 2, or 3 recorded times)
  const parsedContainerAmount = parseContainerAmount(containerInput);
  const currentStats = computeStatsFromTimes(time1, time2, time3, parsedContainerAmount);

  // Save a session record into IndexedDB
  const persistRecordToLocalDB = useCallback(
    async (
      t1: number | null,
      t2: number | null,
      t3: number | null,
      existingId?: string | null,
      isAutoSaved?: boolean
    ) => {
      const containerVal = parseContainerAmount(containerInput);
      const stats = computeStatsFromTimes(t1, t2, t3, containerVal);
      if (stats.count === 0 || stats.currentAverage === null) return;

      const defaultNumber = sessions.length + 1;
      const finalLabel =
        sessionLabel.trim() || `Misurazione #${defaultNumber}`;

      const record: MeasurementRecord = {
        id: existingId || `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        label: finalLabel,
        category: sessionCategory,
        notes: sessionNotes.trim(),
        containerAmount: containerVal,
        flowRatePerSec: stats.currentFlowPerSec,
        flowRatePerMin: stats.currentFlowPerMin,
        flowRatePerHour: stats.currentFlowPerHour,
        flowRatePer24Hours: stats.currentFlowPer24Hours,
        time1: t1,
        time2: t2,
        time3: t3,
        averageAfterStop1: stats.averageAfterStop1,
        averageAfterStop2: stats.averageAfterStop2,
        averageAfterStop3: stats.averageAfterStop3,
        finalAverage: stats.currentAverage,
        minTime: stats.minTime ?? stats.currentAverage,
        maxTime: stats.maxTime ?? stats.currentAverage,
        spread: stats.spread ?? 0,
        count: stats.count,
        mode: 'independent',
        createdAt: Date.now(),
      };

      const updatedList = await saveSessionToDB(record);
      setSessions(updatedList);
      setLastSavedId(record.id);

      const flowSuffix =
        stats.currentFlowPerSec !== null
          ? ` · ${formatFlowValue(stats.currentFlowPerSec)} l/s`
          : '';

      if (isAutoSaved) {
        showToast(
          `3° dato acquisito — Media ${formatTimeParts(record.finalAverage).fullMs}${flowSuffix} salvata nel DB`
        );
      } else {
        showToast(
          `Sessione "${record.label}" salvata nel DB (Media: ${formatTimeParts(record.finalAverage).fullMs}${flowSuffix})`
        );
      }
    },
    [
      containerInput,
      sessionCategory,
      sessionLabel,
      sessionNotes,
      sessions.length,
      showToast,
    ]
  );

  // Start the stopwatch (Requires Contenitore to be filled in before starting, and blocked if a stopped measurement is awaiting validation/reset)
  const handleStart = useCallback(() => {
    if (isRunning || pendingTimeMs !== null) return;

    const validContainer = parseContainerAmount(containerInput);
    if (validContainer === null) {
      setContainerError(true);
      containerInputRef.current?.focus();
      showToast('Compila obbligatoriamente il campo Litri contenitore prima di avviare il cronometro');
      return;
    }

    setContainerError(false);

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(30);
    }

    // If all 3 fields are already filled and we are starting a brand-new cycle on Slot 1, clear for the new session
    if (time1 !== null && time2 !== null && time3 !== null && activeSlot === 1) {
      setTime1(null);
      setTime2(null);
      setTime3(null);
      setLastSavedId(null);
    }

    setElapsedMs(0);
    setPendingTimeMs(null);
    startPerfRef.current = performance.now();
    setIsRunning(true);

    const tick = () => {
      const now = performance.now();
      const current = Math.round(now - startPerfRef.current);
      setElapsedMs(current);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [activeSlot, containerInput, isRunning, pendingTimeMs, showToast, time1, time2, time3]);

  // Stop the stopwatch -> hold measured time in pendingTimeMs waiting for user validation (or single-measurement reset)
  const handleStop = useCallback(() => {
    if (!isRunning) return;

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([40, 30, 40]);
    }

    const finalMeasuredMs = Math.max(
      1,
      Math.round(performance.now() - startPerfRef.current)
    );

    setElapsedMs(finalMeasuredMs);
    setPendingTimeMs(finalMeasuredMs);
    setIsRunning(false);
  }, [isRunning]);

  // Validate and record the stopped time into the active field (1, 2, or 3), compute average & flow, and auto-save to DB on 3rd datum
  const handleValidateAndRecord = useCallback(() => {
    if (isRunning || pendingTimeMs === null) return;

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(35);
    }

    const finalMeasuredMs = pendingTimeMs;
    const nextT1 = activeSlot === 1 ? finalMeasuredMs : time1;
    const nextT2 = activeSlot === 2 ? finalMeasuredMs : time2;
    const nextT3 = activeSlot === 3 ? finalMeasuredMs : time3;

    setTime1(nextT1);
    setTime2(nextT2);
    setTime3(nextT3);
    setPendingTimeMs(null);
    setElapsedMs(0);

    const containerVal = parseContainerAmount(containerInput);
    const statsAfterStop = computeStatsFromTimes(nextT1, nextT2, nextT3, containerVal);
    const runningAvg = statsAfterStop.currentAverage ?? finalMeasuredMs;
    const runningFlow = statsAfterStop.currentFlowPerSec;

    // Determine next empty slot (1 -> 2 -> 3 -> 1)
    let nextSlot: 1 | 2 | 3 = 1;
    if (activeSlot === 1) {
      nextSlot = nextT2 === null ? 2 : nextT3 === null ? 3 : 2;
    } else if (activeSlot === 2) {
      nextSlot = nextT3 === null ? 3 : nextT1 === null ? 1 : 3;
    } else {
      nextSlot = 1;
    }
    setActiveSlot(nextSlot);

    // If all 3 fields are now filled and auto-save is active, save immediately to local DB
    const allThreeFilled = nextT1 !== null && nextT2 !== null && nextT3 !== null;
    if (allThreeFilled && autoSaveOnThirdStop) {
      persistRecordToLocalDB(nextT1, nextT2, nextT3, lastSavedId, true);
    } else {
      const flowToast =
        runningFlow !== null
          ? ` · ${formatFlowValue(runningFlow)} l/s`
          : '';
      showToast(
        `${activeSlot}° Dato registrato (${formatTimeParts(finalMeasuredMs).full}) · Media: ${formatTimeParts(runningAvg).full}${flowToast}`
      );
    }
  }, [
    activeSlot,
    autoSaveOnThirdStop,
    containerInput,
    isRunning,
    lastSavedId,
    pendingTimeMs,
    persistRecordToLocalDB,
    showToast,
    time1,
    time2,
    time3,
  ]);

  // Reset current measurement (if running or waiting validation) OR reset all 3 measurement fields (only after saving to DB)
  const handleReset = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    // If running or holding an unvalidated time, reset ONLY this single measurement so user can repeat it
    if (isRunning || pendingTimeMs !== null) {
      setIsRunning(false);
      setElapsedMs(0);
      setPendingTimeMs(null);
      showToast(`${activeSlot}° Dato azzerato — premi Avvia per ripetere la misura`);
      return;
    }

    // Block "Azzera Tutto" until the measurements are saved in the database
    if (lastSavedId === null) {
      return;
    }

    setIsRunning(false);
    setElapsedMs(0);
    setPendingTimeMs(null);
    setTime1(null);
    setTime2(null);
    setTime3(null);
    setActiveSlot(1);
    setLastSavedId(null);
    setEditingSlot(null);
  }, [activeSlot, isRunning, lastSavedId, pendingTimeMs, showToast]);

  // Keyboard shortcuts (Space = Start/Stop, Enter = Validate, R = Reset) when not typing in an input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (activeTab !== 'chrono') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (isRunning) handleStop();
        else handleStart();
      } else if (e.key === 'Enter' && pendingTimeMs !== null && !isRunning) {
        e.preventDefault();
        handleValidateAndRecord();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleReset();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, handleReset, handleStart, handleStop, handleValidateAndRecord, isRunning, pendingTimeMs]);

  // Clear a single measurement slot
  const handleClearSingleSlot = (slot: 1 | 2 | 3) => {
    if (slot === 1) setTime1(null);
    if (slot === 2) setTime2(null);
    if (slot === 3) setTime3(null);
    setActiveSlot(slot);
  };

  // Save manual input edit for a slot
  const handleSaveManualSlot = (slot: 1 | 2 | 3) => {
    const parsedMs = parseManualTimeToMs(manualInputValue);
    if (parsedMs === null) {
      setEditingSlot(null);
      return;
    }
    const nextT1 = slot === 1 ? parsedMs : time1;
    const nextT2 = slot === 2 ? parsedMs : time2;
    const nextT3 = slot === 3 ? parsedMs : time3;

    setTime1(nextT1);
    setTime2(nextT2);
    setTime3(nextT3);
    setEditingSlot(null);
  };

  // Load a saved session from history back into the 3 fields
  const handleLoadSessionIntoChrono = (record: MeasurementRecord) => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsRunning(false);
    setPendingTimeMs(null);
    setTime1(record.time1);
    setTime2(record.time2);
    setTime3(record.time3);
    setElapsedMs(record.finalAverage);
    setSessionLabel(record.label);
    setSessionCategory(record.category);
    if (record.containerAmount !== null && record.containerAmount !== undefined) {
      setContainerInput(String(record.containerAmount));
      setContainerError(false);
    } else {
      setContainerInput('');
    }
    setSessionNotes(record.notes || '');
    setLastSavedId(record.id);
    setActiveSlot(1);
    setActiveTab('chrono');
    showToast(`Sessione "${record.label}" caricata nei 3 campi di misura`);
  };

  // Load sample sessions into local DB
  const handleLoadDemoData = async () => {
    const now = Date.now();
    const demoRecords: MeasurementRecord[] = [
      {
        id: 'demo_flusso_1',
        label: 'Misurazione Portata Principale',
        category: 'Flusso',
        notes: 'Recipiente tarato da 10 litri',
        containerAmount: 10,
        flowRatePerSec: 10 / 5.0,
        time1: 5040,
        time2: 4980,
        time3: 4980,
        averageAfterStop1: 5040,
        averageAfterStop2: 5010,
        averageAfterStop3: 5000,
        finalAverage: 5000,
        minTime: 4980,
        maxTime: 5040,
        spread: 60,
        count: 3,
        mode: 'independent',
        createdAt: now - 3600_000 * 18,
      },
      {
        id: 'demo_diga_sud_2',
        label: 'Scarico Controllo Mattina',
        category: 'Diga Sud',
        notes: 'Recipiente da 20 litri',
        containerAmount: 20,
        flowRatePerSec: 20 / 8.0,
        time1: 8050,
        time2: 7950,
        time3: 8000,
        averageAfterStop1: 8050,
        averageAfterStop2: 8000,
        averageAfterStop3: 8000,
        finalAverage: 8000,
        minTime: 7950,
        maxTime: 8050,
        spread: 100,
        count: 3,
        mode: 'independent',
        createdAt: now - 3600_000 * 10,
      },
      {
        id: 'demo_diga_nord_3',
        label: 'Rilevazione Condotta Est',
        category: 'Diga Nord',
        notes: 'Contenitore 50 litri',
        containerAmount: 50,
        flowRatePerSec: 50 / 12.5,
        time1: 12550,
        time2: 12450,
        time3: 12500,
        averageAfterStop1: 12550,
        averageAfterStop2: 12500,
        averageAfterStop3: 12500,
        finalAverage: 12500,
        minTime: 12450,
        maxTime: 12550,
        spread: 100,
        count: 3,
        mode: 'independent',
        createdAt: now - 3600_000 * 4,
      },
      {
        id: 'demo_diga_sud_4',
        label: 'Verifica Pomeridiana',
        category: 'Diga Sud',
        notes: 'Contenitore 25 litri',
        containerAmount: 25,
        flowRatePerSec: 25 / 10.0,
        time1: 10100,
        time2: 9900,
        time3: 10000,
        averageAfterStop1: 10100,
        averageAfterStop2: 10000,
        averageAfterStop3: 10000,
        finalAverage: 10000,
        minTime: 9900,
        maxTime: 10100,
        spread: 200,
        count: 3,
        mode: 'independent',
        createdAt: now - 3600_000 * 1,
      },
    ];

    const updated = await importSessionsToDB(demoRecords);
    setSessions(updated);
    showToast('4 sessioni di esempio caricate nel database locale');
  };

  const formattedLive = formatTimeParts(elapsedMs);
  const formattedAvg = formatTimeParts(currentStats.currentAverage);
  const avgInSeconds =
    currentStats.currentAverage !== null
      ? (currentStats.currentAverage / 1000).toFixed(3)
      : null;

  const slotsData: Array<{
    slot: 1 | 2 | 3;
    title: string;
    subtitle: string;
    valueMs: number | null;
  }> = [
    {
      slot: 1,
      title: '01. Primo Dato',
      subtitle: 'Riempito al 1° Stop',
      valueMs: time1,
    },
    {
      slot: 2,
      title: '02. Secondo Dato',
      subtitle: 'Riempito al 2° Stop',
      valueMs: time2,
    },
    {
      slot: 3,
      title: '03. Terzo Dato',
      subtitle: 'Riempito al 3° Stop',
      valueMs: time3,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 pb-20 md:pb-10">
      {/* Top Bar: Centered App Title in Orange + Desktop Nav */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 sm:px-8 py-3 flex flex-col items-center justify-center gap-2">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('chrono');
          }}
          className="text-xl font-bold tracking-tight text-orange-500 font-display text-center whitespace-nowrap flex items-baseline justify-center gap-2"
        >
          <span>Cronometro 3 misure</span>
          <span className="text-xs font-mono-tabular font-semibold text-orange-400/90">
            v.1.0.2
          </span>
        </a>

        {/* Clean text navigation links on desktop */}
        <nav className="hidden md:flex items-center justify-center gap-7 text-sm font-medium text-slate-300">
          <button
            onClick={() => setActiveTab('chrono')}
            className={`py-1 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'chrono'
                ? 'text-orange-500 font-semibold underline underline-offset-8 decoration-2'
                : 'hover:text-white'
            }`}
          >
            Cronometro 3 Misure
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`py-1 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'history'
                ? 'text-orange-500 font-semibold underline underline-offset-8 decoration-2'
                : 'hover:text-white'
            }`}
          >
            Storico Database ({sessions.length})
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`py-1 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'analytics'
                ? 'text-orange-500 font-semibold underline underline-offset-8 decoration-2'
                : 'hover:text-white'
            }`}
          >
            Analisi Medie
          </button>
          <button
            onClick={() => setActiveTab('android_code')}
            className={`py-1 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'android_code'
                ? 'text-orange-500 font-semibold underline underline-offset-8 decoration-2'
                : 'hover:text-white'
            }`}
          >
            Codice Android
          </button>
        </nav>
      </header>

      {/* Non-intrusive Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 right-4 z-50 max-w-sm bg-slate-800 text-white px-4 py-3 rounded-xl shadow-xl text-xs font-semibold flex items-center gap-2.5 border border-slate-700">
          <CheckCircle2 className="w-4 h-4 text-orange-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Content Container (Full screen width) */}
      <main className="flex-1 w-full px-3 sm:px-6 pt-4">
        {activeTab === 'chrono' && (
          <div className="space-y-6">
            {/* TOP SECTION BEFORE THE STOPWATCH: Categoria (with Flusso), Etichetta Sessione, and mandatory Contenitore */}
            <section
              aria-label="Impostazioni Misurazione"
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                {/* 1. Categoria (Diga Sud, Diga Nord, Flusso) */}
                <div>
                  <label
                    htmlFor="select-categoria"
                    className="block text-center text-sm font-bold text-white mb-1.5"
                  >
                    Categoria
                  </label>
                  <select
                    id="select-categoria"
                    value={sessionCategory}
                    onChange={(e) => setSessionCategory(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 text-center [text-align-last:center] text-sm font-bold bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-orange-500 cursor-pointer"
                  >
                    <option value="Diga Sud">Diga Sud</option>
                    <option value="Diga Nord">Diga Nord</option>
                    <option value="Flusso">Flusso</option>
                  </select>
                </div>

                {/* 2. Nome misura */}
                <div>
                  <label
                    htmlFor="input-etichetta-sessione"
                    className="block text-center text-sm font-bold text-white mb-1.5"
                  >
                    Nome misura
                  </label>
                  <input
                    id="input-etichetta-sessione"
                    type="text"
                    value={sessionLabel}
                    onChange={(e) => setSessionLabel(e.target.value)}
                    placeholder={`es. Misurazione #${sessions.length + 1}`}
                    className="w-full min-h-[44px] px-3.5 py-2 text-center text-sm font-semibold bg-slate-950 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
                  />
                </div>

                {/* 3. Litri contenitore (Obbligatorio prima dell'avvio del cronometro, vuoto di default) */}
                <div>
                  <label
                    htmlFor="input-contenitore"
                    className="block text-center text-sm font-bold text-white mb-1.5"
                  >
                    Litri contenitore <span className="text-orange-400">*</span>
                  </label>
                  <input
                    ref={containerInputRef}
                    id="input-contenitore"
                    type="text"
                    inputMode="decimal"
                    value={containerInput}
                    onChange={(e) => {
                      setContainerInput(e.target.value);
                      if (parseContainerAmount(e.target.value) !== null) {
                        setContainerError(false);
                      }
                    }}
                    placeholder="Inserisci litri (obbligatorio)"
                    className={`w-full min-h-[44px] px-3.5 py-2 text-center text-sm font-mono-tabular font-semibold bg-slate-950 border rounded-xl text-white placeholder:text-slate-500 focus:outline-none transition-colors ${
                      containerError
                        ? 'border-rose-500 ring-2 ring-rose-500/25'
                        : 'border-slate-700 focus:border-orange-500'
                    }`}
                  />
                  {containerError && (
                    <p className="mt-1.5 text-xs font-medium text-rose-400 flex items-center justify-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Inserisci i Litri contenitore prima di avviare</span>
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Primary Instrument Grid: Left = Stopwatch & Controls | Right = Live Average + Contenitore/Media + 3 Fields + Save Button at the end */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column (5 cols on desktop): High-Precision Stopwatch & Tactile Android Controls */}
              <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
                {/* Instrument Top Status Line */}
                <div className="flex items-center justify-between text-xs text-slate-400 pb-4 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isRunning
                          ? 'bg-orange-500 animate-ping'
                          : currentStats.count === 3
                          ? 'bg-emerald-500'
                          : 'bg-slate-500'
                      }`}
                    />
                    <span className="font-semibold text-slate-200">
                      {isRunning
                        ? `Acquisizione ${activeSlot}° Dato in corso`
                        : pendingTimeMs !== null
                        ? `${activeSlot}° Dato fermato — Convalida o Azzera`
                        : `Pronto per ${activeSlot}° Dato (su 3)`}
                    </span>
                  </div>
                  <span>{currentStats.count}/3 registrati</span>
                </div>

                {/* Main Digital Readout */}
                <div className="py-8 text-center select-none">
                  <p className="text-xs font-medium text-slate-400">
                    Tempo Cronometro (Min : Sec . Centesimi)
                  </p>
                  <div className="mt-2 flex items-baseline justify-center font-mono-tabular tracking-tight">
                    <span className="text-5xl sm:text-6xl font-bold text-white">
                      {formattedLive.minutes}:{formattedLive.seconds}
                    </span>
                    <span className="text-3xl sm:text-4xl font-bold text-orange-400 ml-1">
                      .{formattedLive.centiseconds}
                    </span>
                    <span className="text-sm font-medium text-slate-500 ml-1.5">
                      {formattedLive.milliseconds.slice(2)}ms
                    </span>
                  </div>

                  {/* Step Indicator Buttons for Slot 1, 2, 3 */}
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5 text-xs text-slate-400">
                    {[1, 2, 3].map((slotNum) => {
                      const val = slotNum === 1 ? time1 : slotNum === 2 ? time2 : time3;
                      const isTarget = activeSlot === slotNum;
                      return (
                        <button
                          key={slotNum}
                          disabled={isRunning || pendingTimeMs !== null}
                          onClick={() =>
                            !isRunning &&
                            pendingTimeMs === null &&
                            setActiveSlot(slotNum as 1 | 2 | 3)
                          }
                          className={`min-h-[34px] px-3 py-1 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed font-mono-tabular font-medium ${
                            isTarget
                              ? 'bg-white text-slate-900 font-semibold'
                              : val !== null
                              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/50'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {slotNum}° Dato{val !== null ? `: ${formatTimeParts(val).full}` : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Primary Tactile Controls (Start / Stop / Reset + Convalida e Registra) */}
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {!isRunning ? (
                      <button
                        onClick={handleStart}
                        disabled={pendingTimeMs !== null}
                        className="sm:col-span-2 min-h-[54px] px-6 py-3.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed active:scale-[0.99] disabled:active:scale-100 text-white font-semibold text-base transition-all flex items-center justify-center gap-2.5 shadow-sm cursor-pointer whitespace-nowrap"
                      >
                        <Play className="w-5 h-5 fill-current shrink-0" />
                        <span>
                          {time1 !== null &&
                          time2 !== null &&
                          time3 !== null &&
                          activeSlot === 1 &&
                          pendingTimeMs === null
                            ? 'Avvia Nuova Terna (1° Dato)'
                            : `Avvia (${activeSlot}° Dato)`}
                        </span>
                      </button>
                    ) : (
                      <button
                        onClick={handleStop}
                        className="sm:col-span-2 min-h-[54px] px-6 py-3.5 rounded-xl bg-white hover:bg-slate-100 active:scale-[0.99] text-slate-950 font-semibold text-base transition-all flex items-center justify-center gap-2.5 shadow-sm cursor-pointer whitespace-nowrap"
                      >
                        <Square className="w-5 h-5 fill-current text-orange-600 shrink-0" />
                        <span>Stop ({activeSlot}° Dato)</span>
                      </button>
                    )}

                    <button
                      onClick={handleReset}
                      disabled={
                        isRunning || pendingTimeMs !== null
                          ? false
                          : lastSavedId === null ||
                            (time1 === null && time2 === null && time3 === null)
                      }
                      className="min-h-[54px] px-4 py-3.5 rounded-xl border border-slate-700 hover:bg-slate-800 disabled:bg-slate-800/60 disabled:text-slate-500 disabled:border-slate-800 disabled:cursor-not-allowed text-slate-200 font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                    >
                      <RotateCcw className="w-4 h-4 shrink-0" />
                      <span>
                        {isRunning || pendingTimeMs !== null
                          ? `Azzera ${activeSlot}°`
                          : 'Azzera Tutto'}
                      </span>
                    </button>
                  </div>

                  {/* Dedicated Validation & Recording Button */}
                  <button
                    onClick={handleValidateAndRecord}
                    disabled={isRunning || pendingTimeMs === null}
                    className="w-full min-h-[54px] px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 active:scale-[0.99] text-white font-semibold text-base transition-all flex items-center justify-center gap-2.5 shadow-sm cursor-pointer whitespace-nowrap"
                  >
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <span>Convalida e Registra {activeSlot}° dato</span>
                  </button>
                </div>

                {/* Auto-Save Toggle */}
                <div className="mt-6 pt-4 border-t border-slate-800 text-xs">
                  <label className="flex items-center justify-between gap-2 cursor-pointer select-none">
                    <span className="text-slate-400">
                      Salva automaticamente nel DB locale al 3° Stop
                    </span>
                    <input
                      type="checkbox"
                      checked={autoSaveOnThirdStop}
                      onChange={(e) => setAutoSaveOnThirdStop(e.target.checked)}
                      className="w-4 h-4 accent-orange-600 rounded cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Right Column (7 cols on desktop): Live Average + Contenitore/Media + 3 Fields + Save Button */}
              <div className="lg:col-span-7 space-y-5">
                {/* Prominent Live Average & Contenitore ÷ Media Panel */}
                <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left Half: Media dei Tempi Registrati (1, 2 o 3) */}
                    <div>
                      <div className="flex items-center gap-2 text-xs text-slate-300">
                        <span>Media dei tempi registrati</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-orange-400 font-semibold">
                          {currentStats.count === 0
                            ? 'In attesa del 1° Stop'
                            : `Su ${currentStats.count}/3 ${
                                currentStats.count === 1 ? 'misura' : 'misure'
                              }`}
                        </span>
                      </div>
                      <div className="mt-2 flex items-baseline gap-2 font-mono-tabular">
                        <span className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
                          {currentStats.currentAverage !== null
                            ? `${formattedAvg.minutes}:${formattedAvg.seconds}.${formattedAvg.centiseconds}`
                            : '--:--.--'}
                        </span>
                        {avgInSeconds !== null && (
                          <span className="text-sm text-slate-400">
                            ({avgInSeconds} s)
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-xs text-slate-400 font-mono-tabular">
                        <span>Min: {formatTimeParts(currentStats.minTime).full}</span>
                        <span aria-hidden="true">·</span>
                        <span>Max: {formatTimeParts(currentStats.maxTime).full}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          Scarto:{' '}
                          {currentStats.spread !== null
                            ? `±${formatTimeParts(currentStats.spread).full}`
                            : '--'}
                        </span>
                      </div>
                    </div>

                    {/* Right Half: Divisione Contenitore ÷ Media dei Tempi */}
                    <div className="md:pl-6 md:border-l border-slate-800 flex flex-col justify-between">
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
                        <span className="font-semibold text-emerald-400">
                          Contenitore ÷ Media Tempi
                        </span>
                        <span className="font-mono-tabular text-slate-400">
                          {parsedContainerAmount !== null
                            ? `Contenitore: ${parsedContainerAmount}`
                            : 'Contenitore non inserito'}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-baseline gap-2 font-mono-tabular">
                        <span className="text-3xl sm:text-4xl font-bold tracking-tight text-emerald-400">
                          {currentStats.currentFlowPerSec !== null
                            ? formatFlowValue(currentStats.currentFlowPerSec)
                            : '--'}
                        </span>
                        <span className="text-sm font-semibold text-emerald-300">
                          l/s
                        </span>
                      </div>

                      <div className="mt-2 text-xs text-slate-400 font-mono-tabular">
                        {parsedContainerAmount !== null && avgInSeconds !== null ? (
                          <span>
                            Calcolo: {parsedContainerAmount} ÷ {avgInSeconds} s ={' '}
                            <strong className="text-white">
                              {formatFlowValue(currentStats.currentFlowPerSec)} l/s
                            </strong>
                          </span>
                        ) : (
                          <span>
                            Divide il quantitativo Contenitore per la media di 1, 2 o 3 tempi
                          </span>
                        )}
                      </div>

                      {/* Calcoli per 60 Secondi, 60 Minuti e 24 Ore */}
                      <div className="mt-3 pt-3 border-t border-slate-800 space-y-1.5 text-xs font-mono-tabular">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-400 font-sans">60 Secondi:</span>
                          <span className="font-semibold text-emerald-300">
                            {currentStats.currentFlowPerMin !== null
                              ? `${currentStats.currentFlowPerMin.toFixed(2)} l`
                              : '--'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-400 font-sans">60 Minuti:</span>
                          <span className="font-semibold text-emerald-300">
                            {currentStats.currentFlowPerHour !== null
                              ? `${currentStats.currentFlowPerHour.toFixed(2)} l`
                              : '--'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-400 font-sans">24 Ore:</span>
                          <span className="font-semibold text-emerald-300">
                            {currentStats.currentFlowPer24Hours !== null
                              ? `${currentStats.currentFlowPer24Hours.toFixed(2)} l`
                              : '--'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* PULSANTE SALVA NEL DB LOCALE */}
                <div className="pt-1">
                  <button
                    onClick={() =>
                      persistRecordToLocalDB(time1, time2, time3, lastSavedId, false)
                    }
                    disabled={currentStats.count === 0}
                    className="w-full min-h-[52px] px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2.5 shadow-sm cursor-pointer whitespace-nowrap"
                  >
                    <Save className="w-5 h-5 shrink-0" />
                    <span>
                      {lastSavedId
                        ? 'Aggiorna Risultati nel DB Locale'
                        : 'Salva nel DB Locale'}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Recent Local Database History Preview Section */}
            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div>
                  <h2 className="text-lg font-bold text-white">
                    Storico Recente (Database Locale IndexedDB)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Tutte le sessioni salvate con Categoria, Contenitore, Media Tempi e risultato Contenitore ÷ Media
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {sessions.length === 0 && !isLoadingDB && (
                    <button
                      onClick={handleLoadDemoData}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-orange-500" />
                      <span>Carica dati di esempio</span>
                    </button>
                  )}
                  <button
                    onClick={() => setActiveTab('history')}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold text-orange-400 hover:bg-orange-950/30 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <span>Apri Storico Completo ({sessions.length})</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {isLoadingDB ? (
                <div className="py-8 text-center text-sm text-slate-400">
                  Lettura database locale in corso...
                </div>
              ) : sessions.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-slate-400">
                    Nessuna sessione ancora salvata. Inserisci il valore in <strong>Contenitore</strong>, premi <strong>Avvia</strong> e ferma il cronometro per calcolare media e divisione <code>Contenitore ÷ Media</code>.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {sessions.slice(0, 5).map((item) => {
                    const timeStr = new Date(item.createdAt).toLocaleString('it-IT', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    const itemFlow =
                      item.flowRatePerSec ??
                      computeFlowFromAverage(item.containerAmount, item.finalAverage);
                    const itemFlow60s =
                      item.flowRatePerMin ??
                      (itemFlow !== null ? itemFlow * 60 : null);
                    const itemFlow60m =
                      item.flowRatePerHour ??
                      (itemFlow !== null ? itemFlow * 3600 : null);
                    const itemFlow24h =
                      item.flowRatePer24Hours ??
                      (itemFlow !== null ? itemFlow * 86400 : null);

                    return (
                      <div
                        key={item.id}
                        className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-cyan-400">
                              {item.category}
                            </span>
                            <span aria-hidden="true" className="text-xs font-bold text-cyan-400 leading-none">
                              •
                            </span>
                            <span className="text-sm font-bold text-cyan-400">
                              {item.label}
                            </span>
                          </div>
                          {/* Clean unboxed metadata with · separators */}
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-300 font-mono-tabular">
                            <span className="font-sans text-amber-300">{timeStr}</span>
                            {item.containerAmount !== null &&
                              item.containerAmount !== undefined && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-slate-200 font-semibold">
                                    Contenitore Lt: {item.containerAmount}
                                  </span>
                                </>
                              )}
                            <span aria-hidden="true">·</span>
                            <span>1°: {formatTimeParts(item.time1).full}</span>
                            <span aria-hidden="true">·</span>
                            <span>2°: {formatTimeParts(item.time2).full}</span>
                            <span aria-hidden="true">·</span>
                            <span>3°: {formatTimeParts(item.time3).full}</span>
                          </div>
                          {itemFlow !== null && (
                            <div className="mt-2 flex flex-col gap-1 text-xs font-mono-tabular text-slate-300">
                              <div>
                                <span className="text-slate-400 font-sans">60 Secondi:</span>{' '}
                                <strong className="text-emerald-400">
                                  {itemFlow60s !== null ? `${itemFlow60s.toFixed(2)} l` : '--'}
                                </strong>
                              </div>
                              <div>
                                <span className="text-slate-400 font-sans">60 Minuti:</span>{' '}
                                <strong className="text-emerald-400">
                                  {itemFlow60m !== null ? `${itemFlow60m.toFixed(2)} l` : '--'}
                                </strong>
                              </div>
                              <div>
                                <span className="text-slate-400 font-sans">24 Ore:</span>{' '}
                                <strong className="text-emerald-400">
                                  {itemFlow24h !== null ? `${itemFlow24h.toFixed(2)} l` : '--'}
                                </strong>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-5">
                          {itemFlow !== null && (
                            <div className="text-left sm:text-right">
                              <span className="text-[11px] text-slate-400 block">
                                Contenitore ÷ Media
                              </span>
                              <span className="text-lg font-bold font-mono-tabular text-emerald-400">
                                {formatFlowValue(itemFlow)} l/s
                              </span>
                            </div>
                          )}

                          <div className="text-center">
                            <span className="text-[11px] text-slate-400 block">
                              Media tempi
                            </span>
                            <span className="text-lg font-bold font-mono-tabular text-orange-400">
                              {formatTimeParts(item.finalAverage).fullMs}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleLoadSessionIntoChrono(item)}
                              title="Ricarica nei 3 campi"
                              className="min-h-[40px] min-w-[40px] rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center cursor-pointer"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                            <button
                              onClick={async () => {
                                const updated = await deleteSessionFromDB(item.id);
                                setSessions(updated);
                              }}
                              title="Elimina"
                              className="min-h-[40px] min-w-[40px] rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 flex items-center justify-center cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'history' && (
          <HistoryView
            sessions={sessions}
            onDeleteSession={async (id) => {
              const updated = await deleteSessionFromDB(id);
              setSessions(updated);
              showToast('Sessione rimossa dal database locale');
            }}
            onClearAll={async () => {
              const updated = await clearAllSessionsFromDB();
              setSessions(updated);
              showToast('Database locale svuotato');
            }}
            onLoadSession={handleLoadSessionIntoChrono}
            onUpdateSession={async (updatedRecord) => {
              const updated = await saveSessionToDB(updatedRecord);
              setSessions(updated);
              showToast('Sessione aggiornata nel database locale');
            }}
            onImportSessions={async (imported) => {
              const updated = await importSessionsToDB(imported);
              setSessions(updated);
            }}
            onLoadDemoData={handleLoadDemoData}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsView
            sessions={sessions}
            onLoadSessionIntoChrono={handleLoadSessionIntoChrono}
            onNavigateToChrono={() => setActiveTab('chrono')}
          />
        )}

        {activeTab === 'android_code' && <AndroidCodeView />}
      </main>

      {/* Mobile Fixed Bottom Navigation Bar (Ergonomic Thumb Zone, <15% viewport height) */}
      <nav
        aria-label="Navigazione principale mobile"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 grid grid-cols-4 items-center px-2"
      >
        <button
          onClick={() => setActiveTab('chrono')}
          className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors cursor-pointer ${
            activeTab === 'chrono'
              ? 'text-orange-400 font-semibold'
              : 'text-slate-400'
          }`}
        >
          <Clock className="w-5 h-5" />
          <span className="text-[11px] mt-0.5 whitespace-nowrap">Cronometro</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors cursor-pointer ${
            activeTab === 'history'
              ? 'text-orange-400 font-semibold'
              : 'text-slate-400'
          }`}
        >
          <History className="w-5 h-5" />
          <span className="text-[11px] mt-0.5 whitespace-nowrap">
            Storico ({sessions.length})
          </span>
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors cursor-pointer ${
            activeTab === 'analytics'
              ? 'text-orange-400 font-semibold'
              : 'text-slate-400'
          }`}
        >
          <Database className="w-5 h-5" />
          <span className="text-[11px] mt-0.5 whitespace-nowrap">Analisi</span>
        </button>

        <button
          onClick={() => setActiveTab('android_code')}
          className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors cursor-pointer ${
            activeTab === 'android_code'
              ? 'text-orange-400 font-semibold'
              : 'text-slate-400'
          }`}
        >
          <Play className="w-5 h-5" />
          <span className="text-[11px] mt-0.5 whitespace-nowrap">Kotlin APK</span>
        </button>
      </nav>

      <OfflineIndicator />
    </div>
  );
}
