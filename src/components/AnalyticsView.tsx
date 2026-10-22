/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  MeasurementRecord,
  computeFlowFromAverage,
  formatFlowValue,
  formatTimeParts,
} from '../types/measurement';
import {
  ArrowUpRight,
  BarChart3,
  RotateCcw,
  FileDown,
  TrendingUp,
  TrendingDown,
  Minus,
  Droplets,
  Clock,
  Sparkles,
  Layers,
  Activity,
} from 'lucide-react';
import { exportLinearChartPdf } from '../utils/exportChartPdf';

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
  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    const found = sessions.find((s) => s.category && s.category.trim())?.category;
    return found || 'Diga Sud';
  });
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // All distinct categories present in recorded sessions or defaults
  const categoriesList = useMemo(() => {
    const defaultCats = ['Diga Sud', 'Diga Nord', 'Flusso'];
    const set = new Set<string>(defaultCats);
    sessions.forEach((s) => {
      if (s.category && s.category.trim()) set.add(s.category.trim());
    });
    return Array.from(set);
  }, [sessions]);

  // Display the single selected category
  const displayedCategories = useMemo(() => {
    return [selectedCategory];
  }, [selectedCategory]);

  if (sessions.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center max-w-xl mx-auto my-8 shadow-xl">
        <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
          <BarChart3 className="w-6 h-6" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-white">
          Nessun dato statistico disponibile
        </h2>
        <p className="mt-2 text-sm text-slate-400 leading-relaxed">
          Registra almeno una sessione con il cronometro a 3 campi per sbloccare l&apos;analisi delle perdite per ciascuna categoria (Diga Sud, Diga Nord, Flusso) con i rispettivi grafici a barre ed esportazione in PDF lineare.
        </p>
        <button
          onClick={onNavigateToChrono}
          className="mt-6 min-h-[44px] px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors inline-flex items-center gap-2 cursor-pointer shadow-md shadow-orange-600/20"
        >
          <span>Vai al Cronometro</span>
          <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Handle PDF Export for a specific category
  const handleExportCategoryPdf = async (categoryName: string, catSessions: MeasurementRecord[]) => {
    if (catSessions.length === 0) {
      alert(`Nessuna misura registrata per la categoria "${categoryName}".`);
      return;
    }

    setIsExporting(true);
    setExportNotice(`Generazione PDF Grafico Lineare per "${categoryName}" in corso...`);

    // Determine whether to highlight flow or times
    const hasFlow = catSessions.some((s) => {
      const f = s.flowRatePerSec ?? computeFlowFromAverage(s.containerAmount, s.finalAverage);
      return f !== null && f > 0;
    });

    try {
      await exportLinearChartPdf({
        type: hasFlow ? 'flow' : 'averages',
        title: `Report Andamento Perdita: ${categoryName}`,
        categoryFilter: categoryName,
        sessions: catSessions,
      });

      setExportNotice(`PDF Grafico Lineare per "${categoryName}" scaricato con successo!`);
      setTimeout(() => setExportNotice(null), 3500);
    } catch (err) {
      console.error('PDF export failed:', err);
      setExportNotice(`Errore durante la generazione del PDF per "${categoryName}".`);
      setTimeout(() => setExportNotice(null), 4000);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 mb-20 md:mb-8">
      {/* Category selector filter bar */}
      <div className="flex flex-col items-center text-center gap-3">
        <h2 className="text-2xl font-bold text-white tracking-tight">
          Analisi Medie e Perdite nel Tempo
        </h2>
        <p className="text-xs text-slate-400 max-w-lg">
          Grafico a barre dedicato per ciascuna perdita (Diga Sud, Diga Nord, Flusso) con pulsante di esportazione in PDF con regressione lineare per monitorare l'evoluzione nel tempo.
        </p>

        {/* Filter Chips - Singola Scelta */}
        <div className="flex items-center justify-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto max-w-full">
          {categoriesList.map((cat) => {
            const count = sessions.filter((s) => (s.category || 'Flusso') === cat).length;
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`min-h-[36px] px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>{cat}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isSelected ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Export notification toast */}
      {exportNotice && (
        <div className="p-3 bg-slate-900 border border-orange-500/40 text-orange-400 text-xs rounded-xl flex items-center justify-between animate-in fade-in max-w-lg mx-auto shadow-lg">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-orange-400 shrink-0 animate-spin" />
            <span className="font-semibold">{exportNotice}</span>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* DEDICATED BAR CHART & LINEAR PDF EXPORT PER EACH CATEGORY / PERDITA   */}
      {/* ====================================================================== */}
      {displayedCategories.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-500 max-w-md mx-auto">
          <Layers className="w-8 h-8 mx-auto mb-2 opacity-40 text-orange-400" />
          <p className="text-sm font-semibold text-slate-300">
            Nessuna sessione registrata per {selectedCategory}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Seleziona questa categoria nel cronometro per registrare le prime misure di questa perdita.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {displayedCategories.map((catName) => {
            // Sessions for this specific category
            const catSessions = sessions.filter((s) => (s.category || 'Flusso') === catName);

            if (catSessions.length === 0) return null;

            // Chronological order (last 12 sessions)
            const chronological = [...catSessions].reverse().slice(-12);
            const maxAvg = Math.max(...chronological.map((s) => s.maxTime || s.finalAverage), 1);

            // Flow analysis
            const flowSessions = chronological.map((s) => {
              const flowVal =
                s.flowRatePerSec ??
                computeFlowFromAverage(s.containerAmount, s.finalAverage);
              return {
                session: s,
                flowVal: flowVal || 0,
                flowPerHour: flowVal ? flowVal * 3.6 : 0,
              };
            });

            const hasFlow = flowSessions.some((f) => f.flowVal > 0);
            const validFlows = flowSessions.map((f) => f.flowVal).filter((f) => f > 0);
            const avgFlow = validFlows.length > 0 ? validFlows.reduce((a, b) => a + b, 0) / validFlows.length : null;
            const lastSession = chronological[chronological.length - 1];
            const firstSession = chronological[0];

            // Trend calculation: Compare first and last final average
            let trendType: 'stable' | 'up' | 'down' = 'stable';
            let trendPct = 0;
            if (chronological.length > 1 && firstSession.finalAverage > 0) {
              // Note: If finalAverage in seconds decreased, flow/leak increased!
              const timeDeltaPct = ((firstSession.finalAverage - lastSession.finalAverage) / firstSession.finalAverage) * 100;
              trendPct = Math.abs(parseFloat(timeDeltaPct.toFixed(1)));
              if (timeDeltaPct > 2.5) {
                trendType = 'up'; // Loss is increasing (faster fill time)
              } else if (timeDeltaPct < -2.5) {
                trendType = 'down'; // Loss is decreasing (slower fill time)
              } else {
                trendType = 'stable';
              }
            }

            return (
              <div
                key={catName}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4"
              >
                {/* Header for this Category Chart */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400 shrink-0">
                      <Droplets className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base sm:text-lg font-bold text-white">
                          Andamento Perdita: <span className="text-orange-400">{catName}</span>
                        </h3>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                          {catSessions.length} {catSessions.length === 1 ? 'misura' : 'misure'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Cronologia delle ultime {chronological.length} rilevazioni con confronto tra 1°, 2°, 3° dato e media finale
                      </p>
                    </div>
                  </div>

                  {/* DEDICATED PDF EXPORT BUTTON FOR THIS SPECIFIC BAR CHART */}
                  <button
                    onClick={() => handleExportCategoryPdf(catName, catSessions)}
                    disabled={isExporting}
                    className="min-h-[42px] px-4 py-2 bg-orange-500/15 hover:bg-orange-500/25 active:bg-orange-500/35 border border-orange-500/40 hover:border-orange-500 text-orange-400 hover:text-orange-300 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-orange-500/5 shrink-0 group"
                    title={`Esporta l'andamento di ${catName} in un file PDF con Grafico Lineare vettoriale e tabella dati`}
                  >
                    <FileDown className="w-4 h-4 text-orange-400 group-hover:scale-110 transition-transform" />
                    <TrendingUp className="w-3.5 h-3.5 text-orange-400" />
                    <span>Esporta PDF {catName} (Grafico Lineare)</span>
                  </button>
                </div>

                {/* Metric Summary Badges for this category */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                  {/* Ultima Misura */}
                  <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Ultima Media
                    </span>
                    <span className="text-sm font-mono font-bold text-white">
                      {formatTimeParts(lastSession.finalAverage).full}
                    </span>
                  </div>

                  {/* Portata Media */}
                  <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Portata Stimata
                    </span>
                    <span className="text-sm font-mono font-bold text-cyan-400">
                      {avgFlow !== null ? `${formatFlowValue(avgFlow)} L/s` : 'Tempo puro'}
                    </span>
                  </div>

                  {/* Volume Contenitore */}
                  <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Contenitore
                    </span>
                    <span className="text-sm font-mono font-bold text-slate-300">
                      {lastSession.containerAmount ? `${lastSession.containerAmount} L` : '-'}
                    </span>
                  </div>

                  {/* Tendenza Perdita nel Tempo */}
                  <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Tendenza Perdita
                      </span>
                      <span
                        className={`text-xs font-bold flex items-center gap-1 ${
                          trendType === 'up'
                            ? 'text-red-400'
                            : trendType === 'down'
                            ? 'text-emerald-400'
                            : 'text-slate-300'
                        }`}
                      >
                        {trendType === 'up' && <TrendingUp className="w-3.5 h-3.5" />}
                        {trendType === 'down' && <TrendingDown className="w-3.5 h-3.5" />}
                        {trendType === 'stable' && <Minus className="w-3.5 h-3.5" />}
                        <span>
                          {trendType === 'up'
                            ? `In Aumento (+${trendPct}%)`
                            : trendType === 'down'
                            ? `In Riduzione (-${trendPct}%)`
                            : 'Stabile'}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Legend for this bar chart */}
                <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/80">
                  <div className="text-[11px] text-slate-500 font-mono">
                    Cronologia da sinistra (meno recente) a destra (più recente)
                  </div>
                  <div className="flex items-center gap-4 text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-slate-600 inline-block" />
                      Tempi 1-2-3
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-orange-500 inline-block" />
                      Media Finale
                    </span>
                  </div>
                </div>

                {/* The Bar Chart Columns for this Category */}
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-3 items-end min-h-[220px] pt-4">
                  {chronological.map((session, sIdx) => {
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
                        className="flex flex-col items-center group relative"
                      >
                        {/* Time label */}
                        <div className="text-[11px] font-mono font-semibold text-slate-300 mb-0.5">
                          {formatTimeParts(session.finalAverage).full}
                        </div>

                        {/* Flow label if available */}
                        {flowVal !== null && flowVal > 0 ? (
                          <div className="text-[10px] font-mono text-cyan-400 font-bold mb-1">
                            {formatFlowValue(flowVal)} L/s
                          </div>
                        ) : (
                          <div className="text-[10px] font-mono text-slate-500 mb-1">
                            Prova {sIdx + 1}
                          </div>
                        )}

                        {/* Bar display box */}
                        <div className="w-full h-36 bg-slate-950/80 rounded-xl p-2 flex items-end justify-center gap-1 border border-slate-800 hover:border-orange-500/40 transition-colors">
                          {t1Pct > 0 && (
                            <div
                              style={{ height: `${t1Pct}%` }}
                              title={`1° Dato: ${formatTimeParts(session.time1).fullMs}`}
                              className="w-2 bg-slate-600 hover:bg-slate-500 rounded-t-sm transition-all"
                            />
                          )}
                          {t2Pct > 0 && (
                            <div
                              style={{ height: `${t2Pct}%` }}
                              title={`2° Dato: ${formatTimeParts(session.time2).fullMs}`}
                              className="w-2 bg-slate-600 hover:bg-slate-500 rounded-t-sm transition-all"
                            />
                          )}
                          {t3Pct > 0 && (
                            <div
                              style={{ height: `${t3Pct}%` }}
                              title={`3° Dato: ${formatTimeParts(session.time3).fullMs}`}
                              className="w-2 bg-slate-600 hover:bg-slate-500 rounded-t-sm transition-all"
                            />
                          )}
                          <div
                            style={{ height: `${avgHeightPct}%` }}
                            title={`Media Finale: ${formatTimeParts(session.finalAverage).fullMs}`}
                            className="w-3 bg-orange-500 hover:bg-orange-400 rounded-t-sm shadow-sm"
                          />
                        </div>

                        {/* Date and label */}
                        <p className="mt-2 text-xs font-semibold text-slate-300 truncate max-w-full text-center">
                          {session.label || `#${sIdx + 1}`}
                        </p>
                        <p className="text-[10px] text-slate-500 font-mono text-center">
                          {new Date(session.createdAt).toLocaleDateString('it-IT', {
                            day: '2-digit',
                            month: '2-digit',
                          })}
                        </p>

                        {/* Reload Button */}
                        <button
                          onClick={() => onLoadSessionIntoChrono(session)}
                          className="mt-1 text-[11px] text-orange-400 hover:text-orange-300 flex items-center gap-1 cursor-pointer transition-colors"
                          title="Ricarica questa sessione nel cronometro"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Ricarica</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
