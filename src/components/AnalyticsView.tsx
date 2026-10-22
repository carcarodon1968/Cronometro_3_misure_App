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
  Droplets,
  Clock,
  Sparkles,
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
  const [selectedCategory, setSelectedCategory] = useState<string>('Tutte');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

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
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center max-w-xl mx-auto my-8 shadow-xl">
        <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
          <BarChart3 className="w-6 h-6" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-white">
          Nessun dato statistico disponibile
        </h2>
        <p className="mt-2 text-sm text-slate-400 leading-relaxed">
          Registra almeno una sessione con il cronometro a 3 campi per sbloccare l&apos;analisi delle medie progressive, il rapporto Contenitore ÷ Media, i grafici di andamento e l&apos;esportazione in PDF con grafico lineare.
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

  // Chronological order for progression (last 12 sessions)
  const chronological = [...filteredSessions].reverse().slice(-12);
  const maxAvg = Math.max(...chronological.map((s) => s.maxTime || s.finalAverage), 1);

  // Sessions with flow rates
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

  const maxFlow = Math.max(...flowSessions.map((f) => f.flowVal), 0.1);

  // Handle PDF Export
  const handleExportPdf = async (type: 'averages' | 'flow') => {
    setIsExporting(true);
    setExportNotice(type === 'averages' ? 'Generazione PDF Grafico Lineare Medie in corso...' : 'Generazione PDF Grafico Lineare Portata in corso...');

    try {
      if (type === 'averages') {
        await exportLinearChartPdf({
          type: 'averages',
          title: 'Report Andamento Medie e Tempi di Misura',
          categoryFilter: selectedCategory,
          sessions: filteredSessions,
        });
      } else {
        await exportLinearChartPdf({
          type: 'flow',
          title: 'Report Andamento Portate di Flusso',
          categoryFilter: selectedCategory,
          sessions: filteredSessions,
        });
      }
      setExportNotice('PDF generato e scaricato con successo!');
      setTimeout(() => setExportNotice(null), 3000);
    } catch (err) {
      console.error('PDF export failed:', err);
      setExportNotice('Errore durante la generazione del PDF.');
      setTimeout(() => setExportNotice(null), 4000);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 mb-20 md:mb-8">
      {/* Category filter bar */}
      <div className="flex flex-col items-center text-center gap-3">
        <h2 className="text-2xl font-bold text-white tracking-tight">
          Analisi Medie e Flusso
        </h2>
        <p className="text-xs text-slate-400 max-w-md">
          Grafici di andamento comparativi e generazione di report PDF con regressione lineare per le verifiche sul campo
        </p>

        <div className="flex items-center justify-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto max-w-full">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`min-h-[36px] px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
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

      {filteredSessions.length > 0 && (
        <>
          {/* ======================================================== */}
          {/* 1. GRAFICO A BARRE: ANDAMENTO MEDIE E 3 CAMPI            */}
          {/* ======================================================== */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-400" />
                  <h3 className="text-base font-bold text-white">
                    Andamento delle Medie e dei 3 Tempi (Ultime {chronological.length} sessioni)
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Confronto visivo tra 1° dato, 2° dato, 3° dato e la Media Finale
                </p>
              </div>

              {/* PULSANTE ESPORTAZIONE IN PDF CON GRAFICO LINEARE */}
              <button
                onClick={() => handleExportPdf('averages')}
                disabled={isExporting}
                className="min-h-[40px] px-4 py-2 bg-orange-500/15 hover:bg-orange-500/25 active:bg-orange-500/35 border border-orange-500/40 text-orange-400 hover:text-orange-300 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-sm shrink-0 group"
                title="Genera ed esporta un documento PDF con Grafico Lineare vettoriale e tabella riepilogativa"
              >
                <FileDown className="w-4 h-4 text-orange-400 group-hover:scale-110 transition-transform" />
                <TrendingUp className="w-3.5 h-3.5 text-orange-400" />
                <span>Esporta PDF (Grafico Lineare)</span>
              </button>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-end gap-4 text-xs text-slate-400 pt-3">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-slate-600 inline-block" />
                Singoli Tempi (1-3)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-orange-500 inline-block" />
                Media Finale
              </span>
            </div>

            {/* The Bar Chart */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-3 items-end min-h-[220px] pt-4">
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
                    <div className="text-[11px] font-mono font-semibold text-slate-300 mb-0.5">
                      {formatTimeParts(session.finalAverage).full}
                    </div>
                    {flowVal !== null && flowVal > 0 && (
                      <div className="text-[10px] font-mono text-emerald-400 mb-1">
                        {formatFlowValue(flowVal)} l/s
                      </div>
                    )}

                    <div className="w-full h-36 bg-slate-950/80 rounded-xl p-2 flex items-end justify-center gap-1 border border-slate-800">
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
                        title={`Media: ${formatTimeParts(session.finalAverage).fullMs}`}
                        className="w-3 bg-orange-500 hover:bg-orange-400 rounded-t-sm shadow-sm"
                      />
                    </div>

                    <p className="mt-2 text-xs font-bold text-cyan-400 truncate max-w-full text-center">
                      {session.category}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate max-w-full text-center">
                      {session.label}
                    </p>
                    <button
                      onClick={() => onLoadSessionIntoChrono(session)}
                      className="mt-1 text-[11px] text-orange-400 hover:text-orange-300 flex items-center gap-1 cursor-pointer transition-colors"
                      title="Carica questa sessione nel cronometro"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Ricarica</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ======================================================== */}
          {/* 2. GRAFICO A BARRE: ANDAMENTO DELLE PORTATE DI FLUSSO    */}
          {/* ======================================================== */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <Droplets className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-base font-bold text-white">
                    Andamento Portate di Flusso (Litri/Secondo e m³/h)
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Velocità di scarico e portata calcolata in base alla media dei tempi e volume vasca
                </p>
              </div>

              {/* PULSANTE ESPORTAZIONE IN PDF CON GRAFICO LINEARE */}
              <button
                onClick={() => handleExportPdf('flow')}
                disabled={isExporting}
                className="min-h-[40px] px-4 py-2 bg-cyan-500/15 hover:bg-cyan-500/25 active:bg-cyan-500/35 border border-cyan-500/40 text-cyan-400 hover:text-cyan-300 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-sm shrink-0 group"
                title="Genera ed esporta un documento PDF con Grafico Lineare di portata e tabella riepilogativa"
              >
                <FileDown className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
                <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                <span>Esporta PDF (Grafico Lineare)</span>
              </button>
            </div>

            {/* The Flow Bar Chart */}
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-3 items-end min-h-[220px]">
              {flowSessions.map(({ session, flowVal, flowPerHour }) => {
                const heightPct = Math.max(
                  12,
                  Math.round((flowVal / maxFlow) * 100)
                );

                return (
                  <div
                    key={session.id}
                    className="flex flex-col items-center group"
                  >
                    <div className="text-[11px] font-mono font-bold text-cyan-400 mb-0.5">
                      {formatFlowValue(flowVal)} L/s
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 mb-1">
                      {flowPerHour.toFixed(1)} m³/h
                    </div>

                    <div className="w-full h-36 bg-slate-950/80 rounded-xl p-2 flex items-end justify-center border border-slate-800">
                      <div
                        style={{ height: `${heightPct}%` }}
                        title={`Portata: ${formatFlowValue(flowVal)} L/s (${flowPerHour.toFixed(2)} m³/h)`}
                        className="w-5 bg-gradient-to-t from-cyan-600 to-cyan-400 hover:to-cyan-300 rounded-t-md shadow-sm transition-all"
                      />
                    </div>

                    <p className="mt-2 text-xs font-bold text-white truncate max-w-full text-center">
                      {session.category}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate max-w-full text-center">
                      {session.label}
                    </p>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                      {new Date(session.createdAt).toLocaleDateString('it-IT', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </div>
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
