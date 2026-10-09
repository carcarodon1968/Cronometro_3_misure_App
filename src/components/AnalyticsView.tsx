import React, { useMemo, useState } from 'react';
import {
  MeasurementRecord,
  computeFlowFromAverage,
  formatFlowValue,
  formatTimeParts,
} from '../types/measurement';
import { ArrowUpRight, BarChart3, RotateCcw } from 'lucide-react';

interface AnalyticsViewProps {
  sessions: MeasurementRecord[];
  onLoadSessionIntoChrono: (record: MeasurementRecord) => void;
  onNavigateToChrono: () => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  sessions,
  onLoadSessionIntoChrono,
  onNavigateToChrono,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('Tutte');

  const categories = useMemo(() => {
    const set = new Set<string>(['Tutte', 'Diga Sud', 'Diga Nord', 'Flusso']);
    sessions.forEach((s) => {
      if (s.category) set.add(s.category);
    });
    return Array.from(set);
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    if (selectedCategory === 'Tutte') return sessions;
    return sessions.filter((s) => s.category === selectedCategory);
  }, [sessions, selectedCategory]);

  const summary = useMemo(() => {
    if (filteredSessions.length === 0) return null;

    const averages = filteredSessions.map((s) => s.finalAverage);
    const globalMean = Math.round(
      averages.reduce((acc, v) => acc + v, 0) / averages.length
    );
    const bestSession = filteredSessions.reduce((best, cur) =>
      cur.finalAverage < best.finalAverage ? cur : best
    );
    const mostConsistentSession = filteredSessions.reduce((best, cur) =>
      cur.spread < best.spread ? cur : best
    );

    const flowValues = filteredSessions
      .map(
        (s) =>
          s.flowRatePerSec ?? computeFlowFromAverage(s.containerAmount, s.finalAverage)
      )
      .filter((v): v is number => v !== null && !Number.isNaN(v));

    const meanFlowPerSec =
      flowValues.length > 0
        ? flowValues.reduce((a, b) => a + b, 0) / flowValues.length
        : null;

    // Slot-by-slot mean comparison (1° dato vs 2° dato vs 3° dato)
    const t1List = filteredSessions
      .map((s) => s.time1)
      .filter((v): v is number => v !== null);
    const t2List = filteredSessions
      .map((s) => s.time2)
      .filter((v): v is number => v !== null);
    const t3List = filteredSessions
      .map((s) => s.time3)
      .filter((v): v is number => v !== null);

    const meanSlot1 = t1List.length
      ? Math.round(t1List.reduce((a, b) => a + b, 0) / t1List.length)
      : null;
    const meanSlot2 = t2List.length
      ? Math.round(t2List.reduce((a, b) => a + b, 0) / t2List.length)
      : null;
    const meanSlot3 = t3List.length
      ? Math.round(t3List.reduce((a, b) => a + b, 0) / t3List.length)
      : null;

    return {
      totalSessions: filteredSessions.length,
      totalMeasurements: filteredSessions.reduce((acc, s) => acc + s.count, 0),
      globalMean,
      bestSession,
      mostConsistentSession,
      meanFlowPerSec,
      meanSlot1,
      meanSlot2,
      meanSlot3,
    };
  }, [filteredSessions]);

  if (sessions.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center max-w-xl mx-auto my-8">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
          <BarChart3 className="w-6 h-6" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">
          Nessun dato statistico disponibile
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          Registra almeno una sessione con il cronometro a 3 campi per sbloccare l&apos;analisi delle medie progressive, il rapporto Contenitore ÷ Media e il grafico di andamento.
        </p>
        <button
          onClick={onNavigateToChrono}
          className="mt-6 min-h-[44px] px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors inline-flex items-center gap-2 cursor-pointer"
        >
          <span>Vai al Cronometro</span>
          <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const chronological = [...filteredSessions].reverse().slice(-12);
  const maxAvg = Math.max(...chronological.map((s) => s.maxTime || s.finalAverage), 1);

  return (
    <div className="space-y-6">
      {/* Category filter bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Analisi Medie e Flusso (Contenitore ÷ Media)
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Confronto statistico tra il 1°, 2° e 3° campo di misura e portata calcolata nel database locale
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-xl overflow-x-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {summary && (
        <>
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Media Globale Tempi
              </p>
              <p className="mt-2 text-2xl font-bold font-mono-tabular text-slate-900 dark:text-white">
                {formatTimeParts(summary.globalMean).fullMs}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Su {summary.totalSessions} sessioni · {summary.totalMeasurements} misure
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Flusso Medio (Contenitore ÷ Media)
              </p>
              <p className="mt-2 text-2xl font-bold font-mono-tabular text-emerald-600 dark:text-emerald-400">
                {summary.meanFlowPerSec !== null
                  ? `${formatFlowValue(summary.meanFlowPerSec)} l/s`
                  : '--'}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                {summary.meanFlowPerSec !== null
                  ? `Pari a ${(summary.meanFlowPerSec * 60).toFixed(2)} litri/min`
                  : 'Inserisci Contenitore per calcolare'}
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Sessione Più Costante (Scarto Min)
              </p>
              <p className="mt-2 text-2xl font-bold font-mono-tabular text-slate-900 dark:text-white">
                ±{formatTimeParts(summary.mostConsistentSession.spread).fullMs}
              </p>
              <p className="mt-1 text-xs font-semibold text-cyan-400 truncate">
                {summary.mostConsistentSession.category} · {summary.mostConsistentSession.label}
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Rendimento per Campo (1° · 2° · 3°)
              </p>
              <div className="mt-2 space-y-1 text-xs font-mono-tabular">
                <div className="flex justify-between">
                  <span className="text-slate-500">1° Dato medio:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {formatTimeParts(summary.meanSlot1).full}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">2° Dato medio:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {formatTimeParts(summary.meanSlot2).full}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">3° Dato medio:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {formatTimeParts(summary.meanSlot3).full}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Visual Progression Chart of the Last 12 Sessions */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Andamento delle Medie e dei 3 Campi (Ultime {chronological.length} sessioni)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Confronto visivo tra 1° dato, 2° dato, 3° dato e la Media Finale di ogni sessione
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-slate-300 dark:bg-slate-600 inline-block" />
                  Singole Misure (1-3)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-orange-600 inline-block" />
                  Media Sessione
                </span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-3 items-end min-h-[220px] pt-6">
              {chronological.map((session) => {
                const avgHeightPct = Math.max(
                  12,
                  Math.round((session.finalAverage / maxAvg) * 100)
                );
                const t1Pct = session.time1
                  ? Math.max(8, Math.round((session.time1 / maxAvg) * 100))
                  : 0;
                const t2Pct = session.time2
                  ? Math.max(8, Math.round((session.time2 / maxAvg) * 100))
                  : 0;
                const t3Pct = session.time3
                  ? Math.max(8, Math.round((session.time3 / maxAvg) * 100))
                  : 0;

                const flowVal =
                  session.flowRatePerSec ??
                  computeFlowFromAverage(session.containerAmount, session.finalAverage);

                return (
                  <div
                    key={session.id}
                    className="flex flex-col items-center group"
                  >
                    <div className="text-[11px] font-mono-tabular font-semibold text-slate-700 dark:text-slate-300 mb-0.5">
                      {formatTimeParts(session.finalAverage).full}
                    </div>
                    {flowVal !== null && (
                      <div className="text-[10px] font-mono-tabular text-emerald-500 mb-1">
                        {formatFlowValue(flowVal)} l/s
                      </div>
                    )}

                    <div className="w-full h-36 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-2 flex items-end justify-center gap-1 border border-slate-100 dark:border-slate-800">
                      {t1Pct > 0 && (
                        <div
                          style={{ height: `${t1Pct}%` }}
                          title={`1° Dato: ${formatTimeParts(session.time1).fullMs}`}
                          className="w-2 bg-slate-300 dark:bg-slate-600 rounded-t-sm transition-opacity"
                        />
                      )}
                      {t2Pct > 0 && (
                        <div
                          style={{ height: `${t2Pct}%` }}
                          title={`2° Dato: ${formatTimeParts(session.time2).fullMs}`}
                          className="w-2 bg-slate-300 dark:bg-slate-600 rounded-t-sm transition-opacity"
                        />
                      )}
                      {t3Pct > 0 && (
                        <div
                          style={{ height: `${t3Pct}%` }}
                          title={`3° Dato: ${formatTimeParts(session.time3).fullMs}`}
                          className="w-2 bg-slate-300 dark:bg-slate-600 rounded-t-sm transition-opacity"
                        />
                      )}
                      <div
                        style={{ height: `${avgHeightPct}%` }}
                        title={`Media: ${formatTimeParts(session.finalAverage).fullMs}`}
                        className="w-3 bg-orange-600 rounded-t-sm"
                      />
                    </div>

                    <p className="mt-2 text-xs font-bold text-cyan-400 truncate max-w-full">
                      {session.category}
                    </p>
                    <p className="text-xs font-bold text-cyan-400 truncate max-w-full">
                      {session.label}
                    </p>
                    <button
                      onClick={() => onLoadSessionIntoChrono(session)}
                      className="mt-1 text-[11px] text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Ricarica</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
