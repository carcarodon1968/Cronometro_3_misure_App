import React, { useMemo, useRef, useState } from 'react';
import {
  MeasurementRecord,
  computeFlowFromAverage,
  formatFlowValue,
  formatTimeParts,
  parseContainerAmount,
} from '../types/measurement';
import { exportSessionsToCSV } from '../db/localDatabase';
import {
  Download,
  FileSpreadsheet,
  FolderUp,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Check,
  Edit3,
  X,
} from 'lucide-react';

interface HistoryViewProps {
  sessions: MeasurementRecord[];
  onDeleteSession: (id: string) => Promise<void>;
  onClearAll: () => Promise<void>;
  onLoadSession: (record: MeasurementRecord) => void;
  onUpdateSession: (record: MeasurementRecord) => Promise<void>;
  onImportSessions: (records: MeasurementRecord[]) => Promise<void>;
  onLoadDemoData: () => Promise<void>;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  sessions,
  onDeleteSession,
  onClearAll,
  onLoadSession,
  onUpdateSession,
  onImportSessions,
  onLoadDemoData,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Tutte');
  const [sortBy, setSortBy] = useState<'date_desc' | 'avg_asc' | 'spread_asc'>('date_desc');
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editContainer, setEditContainer] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>([
      'Tutte',
      'Diga Sud',
      'Diga Nord',
      'Flusso',
    ]);
    sessions.forEach((s) => {
      if (s.category) set.add(s.category);
    });
    return Array.from(set);
  }, [sessions]);

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = sessions.filter((s) => {
      const matchesCat = categoryFilter === 'Tutte' || s.category === categoryFilter;
      const matchesQuery =
        !q ||
        s.label.toLowerCase().includes(q) ||
        (s.notes && s.notes.toLowerCase().includes(q)) ||
        s.category.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });

    list.sort((a, b) => {
      if (sortBy === 'avg_asc') return a.finalAverage - b.finalAverage;
      if (sortBy === 'spread_asc') return a.spread - b.spread;
      return b.createdAt - a.createdAt;
    });

    return list;
  }, [sessions, searchQuery, categoryFilter, sortBy]);

  const handleDownloadCSV = () => {
    const csv = exportSessionsToCSV(filteredAndSorted);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cronotri_storico_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJSON = () => {
    const json = JSON.stringify(filteredAndSorted, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cronotri_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const content = String(ev.target?.result || '');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          await onImportSessions(parsed);
          setImportStatus(`Importate ${parsed.length} sessioni nel database locale.`);
          setTimeout(() => setImportStatus(null), 4000);
        }
      } catch {
        setImportStatus('File JSON non valido.');
        setTimeout(() => setImportStatus(null), 4000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const startEditing = (record: MeasurementRecord) => {
    setEditingId(record.id);
    setEditLabel(record.label);
    setEditCategory(record.category);
    setEditContainer(
      record.containerAmount !== null && record.containerAmount !== undefined
        ? String(record.containerAmount)
        : ''
    );
    setEditNotes(record.notes || '');
  };

  const saveEdit = async (record: MeasurementRecord) => {
    const parsedContainer = parseContainerAmount(editContainer);
    const updatedFlow = computeFlowFromAverage(parsedContainer, record.finalAverage);
    await onUpdateSession({
      ...record,
      label: editLabel.trim() || record.label,
      category: editCategory || record.category,
      containerAmount: parsedContainer,
      flowRatePerSec: updatedFlow,
      flowRatePerMin: updatedFlow !== null ? updatedFlow * 60 : null,
      flowRatePerHour: updatedFlow !== null ? updatedFlow * 3600 : null,
      flowRatePer24Hours: updatedFlow !== null ? updatedFlow * 86400 : null,
      notes: editNotes.trim(),
    });
    setEditingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Header & Database Export Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Storico Database Locale
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Archivio persistente salvato su IndexedDB con le terne di misura, il quantitativo Contenitore, le medie e il calcolo Contenitore ÷ Media
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileImport}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <FolderUp className="w-4 h-4 text-slate-500" />
              <span>Importa JSON</span>
            </button>

            <button
              onClick={handleDownloadJSON}
              disabled={sessions.length === 0}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>Backup JSON</span>
            </button>

            <button
              onClick={handleDownloadCSV}
              disabled={sessions.length === 0}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Esporta CSV</span>
            </button>
          </div>
        </div>

        {importStatus && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs font-medium text-emerald-800 dark:text-emerald-200">
            {importStatus}
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cerca per Nome misura, Categoria o note..."
              className="w-full min-h-[42px] pl-10 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Category Segmented Filter */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-x-auto">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    categoryFilter === cat
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Sort selector */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date_desc' | 'avg_asc' | 'spread_asc')}
              aria-label="Ordina storico"
              className="min-h-[42px] px-3 py-2 text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 focus:outline-none focus:border-orange-500 cursor-pointer"
            >
              <option value="date_desc">Più recenti prima</option>
              <option value="avg_asc">Media più veloce</option>
              <option value="spread_asc">Scarto minore (costanza)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filteredAndSorted.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center">
          <p className="text-base font-semibold text-slate-900 dark:text-white">
            {sessions.length === 0
              ? 'Il database locale è attualmente vuoto'
              : 'Nessuna sessione corrisponde ai filtri selezionati'}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {sessions.length === 0
              ? 'Inserisci il quantitativo Contenitore, avvia il cronometro e premi Stop per calcolare media e rapporto Contenitore ÷ Media.'
              : 'Prova a modificare la ricerca testuale o seleziona la categoria "Tutte".'}
          </p>
          {sessions.length === 0 && (
            <button
              onClick={onLoadDemoData}
              className="mt-5 min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 transition-opacity inline-flex items-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-orange-500" />
              <span>Carica 4 Sessioni di Esempio nel Database</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAndSorted.map((item) => {
            const isEditing = editingId === item.id;
            const dateStr = new Date(item.createdAt).toLocaleString('it-IT', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            const calculatedFlow =
              item.flowRatePerSec ??
              computeFlowFromAverage(item.containerAmount, item.finalAverage);
            const flow60s =
              item.flowRatePerMin ??
              (calculatedFlow !== null ? calculatedFlow * 60 : null);
            const flow60m =
              item.flowRatePerHour ??
              (calculatedFlow !== null ? calculatedFlow * 3600 : null);
            const flow24h =
              item.flowRatePer24Hours ??
              (calculatedFlow !== null ? calculatedFlow * 86400 : null);

            return (
              <div
                key={item.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 transition-colors hover:border-slate-300 dark:hover:border-slate-700"
              >
                {/* Top row: Title & Metadata (Zero-Pill unboxed metadata with · separators) */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div className="space-y-1">
                    {isEditing ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          className="min-h-[38px] px-3 py-1.5 text-center text-sm font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-white"
                          placeholder="Nome misura"
                        />
                        <select
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                          className="min-h-[38px] px-3 py-1.5 text-center [text-align-last:center] text-xs font-bold bg-slate-800 border border-slate-700 rounded-lg text-white"
                        >
                          <option value="Diga Sud">Diga Sud</option>
                          <option value="Diga Nord">Diga Nord</option>
                          <option value="Flusso">Flusso</option>
                        </select>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={editContainer}
                          onChange={(e) => setEditContainer(e.target.value)}
                          className="min-h-[38px] w-36 px-3 py-1.5 text-center text-xs font-mono-tabular bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                          placeholder="Litri contenitore"
                        />
                        <input
                          type="text"
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          className="min-h-[38px] px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                          placeholder="Note opzionali..."
                        />
                        <button
                          onClick={() => saveEdit(item)}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Salva</span>
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs flex items-center cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-base font-bold text-cyan-400">
                            {item.category}
                          </span>
                          <span aria-hidden="true" className="text-xs font-bold text-cyan-400 leading-none">
                            •
                          </span>
                          <h3 className="text-base font-bold text-cyan-400">
                            {item.label}
                          </h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                          <span className="text-amber-300">{dateStr}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.count}/3 misure</span>
                          {item.containerAmount !== null &&
                            item.containerAmount !== undefined && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono-tabular text-slate-200 font-semibold">
                                  Contenitore Lt: {item.containerAmount}
                                </span>
                              </>
                            )}
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular">
                            Scarto ±{formatTimeParts(item.spread).full}
                          </span>
                          {item.notes && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-slate-300 italic">
                                {item.notes}
                              </span>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Final Average + Contenitore/Media Highlight & Actions */}
                  <div className="flex flex-wrap items-center justify-between md:justify-end gap-5">
                    {calculatedFlow !== null && (
                      <div className="text-left md:text-right pr-4 border-r border-slate-200 dark:border-slate-800">
                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                          Contenitore ÷ Media
                        </span>
                        <span className="text-2xl font-bold font-mono-tabular text-emerald-600 dark:text-emerald-400">
                          {formatFlowValue(calculatedFlow)}
                        </span>
                        <span className="text-xs font-mono-tabular text-emerald-400 font-semibold ml-1.5">
                          l/s
                        </span>
                      </div>
                    )}

                    <div className="text-center">
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                        Media tempi
                      </span>
                      <span className="text-2xl font-bold font-mono-tabular text-orange-600 dark:text-orange-400">
                        {formatTimeParts(item.finalAverage).fullMs}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onLoadSession(item)}
                        title="Carica questi dati nel cronometro"
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => startEditing(item)}
                        title="Modifica etichetta, contenitore o note"
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDeleteSession(item.id)}
                        title="Elimina dal database locale"
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3 Recorded Fields */}
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="flex items-center justify-between sm:block bg-slate-800/40 rounded-xl px-4 py-3">
                    <div className="text-xs text-slate-400">
                      1° Dato Registrato
                    </div>
                    <div className="mt-0.5 text-base font-bold font-mono-tabular text-white">
                      {formatTimeParts(item.time1).fullMs}
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:block bg-slate-800/40 rounded-xl px-4 py-3">
                    <div className="text-xs text-slate-400">
                      2° Dato Registrato
                    </div>
                    <div className="mt-0.5 text-base font-bold font-mono-tabular text-white">
                      {formatTimeParts(item.time2).fullMs}
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:block bg-slate-800/40 rounded-xl px-4 py-3">
                    <div className="text-xs text-slate-400">
                      3° Dato Registrato
                    </div>
                    <div className="mt-0.5 text-base font-bold font-mono-tabular text-white">
                      {formatTimeParts(item.time3).fullMs}
                    </div>
                  </div>
                </div>

                {calculatedFlow !== null && (
                  <div className="mt-3 pt-3 border-t border-slate-800 flex flex-col gap-1 text-xs font-mono-tabular text-slate-300">
                    <div>
                      <span className="text-slate-400 font-sans">60 Secondi:</span>{' '}
                      <strong className="text-emerald-400">
                        {flow60s !== null ? `${flow60s.toFixed(2)} l` : '--'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 font-sans">60 Minuti:</span>{' '}
                      <strong className="text-emerald-400">
                        {flow60m !== null ? `${flow60m.toFixed(2)} l` : '--'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 font-sans">24 Ore:</span>{' '}
                      <strong className="text-emerald-400">
                        {flow24h !== null ? `${flow24h.toFixed(2)} l` : '--'}
                      </strong>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Footer DB Clear Control */}
          <div className="pt-4 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              Totale record nel database locale: <strong>{sessions.length}</strong>
            </span>

            {!confirmClearAll ? (
              <button
                onClick={() => setConfirmClearAll(true)}
                className="min-h-[40px] px-3 py-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-medium transition-colors cursor-pointer"
              >
                Svuota intero database locale
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-rose-600 dark:text-rose-400 font-semibold">
                  Confermi l&apos;eliminazione di tutti i dati?
                </span>
                <button
                  onClick={async () => {
                    await onClearAll();
                    setConfirmClearAll(false);
                  }}
                  className="min-h-[36px] px-3 py-1 rounded-lg bg-rose-600 text-white font-semibold cursor-pointer"
                >
                  Sì, svuota tutto
                </button>
                <button
                  onClick={() => setConfirmClearAll(false)}
                  className="min-h-[36px] px-3 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium cursor-pointer"
                >
                  Annulla
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
