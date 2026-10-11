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
      <div className="flex flex-col items-center text-center gap-4">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight text-center">
          Analisi Medie e Flusso
        </h2>

        <div className="flex items-center justify-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-xl overflow-x-auto max-w-full">
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

      {filteredSessions.length > 0 && (
        <>
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
