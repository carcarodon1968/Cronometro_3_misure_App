/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Calculator,
  StickyNote,
  Copy,
  Check,
  Trash2,
  Plus,
  Search,
  Share2,
  Download,
  Pin,
  PinOff,
  Edit3,
  Clock,
  Smartphone,
  ExternalLink,
  X,
  FileText,
} from 'lucide-react';

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  category: 'Generale' | 'Misure' | 'Impianto' | 'Diga / Vasca' | 'Promemoria';
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

const NOTE_CATEGORIES: NoteItem['category'][] = [
  'Generale',
  'Misure',
  'Impianto',
  'Diga / Vasca',
  'Promemoria',
];

const CATEGORY_COLORS: Record<NoteItem['category'], { bg: string; text: string; border: string }> = {
  Generale: { bg: 'bg-slate-800', text: 'text-slate-300', border: 'border-slate-700' },
  Misure: { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30' },
  Impianto: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
  'Diga / Vasca': { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  Promemoria: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
};

const STORAGE_KEY_NOTES = 'cronometro3_utility_notes_v1';

export function UtilityView() {
  // ---------- NOTES STATE ----------
  const [notes, setNotes] = useState<NoteItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_NOTES);
      if (saved) return JSON.parse(saved);
      return [
        {
          id: 'sample-1',
          title: 'Promemoria Misure Flusso',
          content: 'Registrare 3 prove consecutive per ogni vasca prima di validare la media. Verificare il livello idrometrico iniziale.',
          category: 'Misure',
          pinned: true,
          createdAt: Date.now() - 3600000 * 2,
          updatedAt: Date.now() - 3600000 * 2,
        },
      ];
    } catch {
      return [];
    }
  });

  const [notesSearch, setNotesSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Tutti');
  const [isComposing, setIsComposing] = useState<boolean>(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState<string>('');
  const [noteContent, setNoteContent] = useState<string>('');
  const [noteCategory, setNoteCategory] = useState<NoteItem['category']>('Generale');
  const [notePinned, setNotePinned] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [systemNotice, setSystemNotice] = useState<string | null>(null);

  // Save notes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(notes));
    } catch (e) {
      console.error('Failed to save notes:', e);
    }
  }, [notes]);

  const triggerHaptic = () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(15);
      } catch {
        // ignore
      }
    }
  };

  // Launch external Phone Calculator App
  const handleLaunchPhoneCalculator = () => {
    triggerHaptic();
    try {
      const intentUri =
        'intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.APP_CALCULATOR;end';
      window.location.href = intentUri;
      setSystemNotice('Richiesta apertura Calcolatrice del telefono inviata...');
      setTimeout(() => setSystemNotice(null), 4000);
    } catch {
      setSystemNotice('Impossibile aprire automaticamente la calcolatrice di sistema.');
      setTimeout(() => setSystemNotice(null), 4000);
    }
  };

  // Launch external Phone Notes App
  const handleLaunchPhoneNotes = () => {
    triggerHaptic();
    try {
      const intentUri =
        'intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.APP_NOTES;end';
      window.location.href = intentUri;
      setSystemNotice('Richiesta apertura Note del telefono inviata...');
      setTimeout(() => setSystemNotice(null), 4000);
    } catch {
      if (navigator.share) {
        navigator.share({ title: 'Note', text: '' }).catch(() => {});
      } else {
        setSystemNotice('Impossibile aprire direttamente le note di sistema.');
        setTimeout(() => setSystemNotice(null), 4000);
      }
    }
  };

  // Filtered & sorted notes
  const filteredNotes = useMemo(() => {
    return notes
      .filter((n) => {
        const matchesCat = selectedCategory === 'Tutti' || n.category === selectedCategory;
        const matchesQuery =
          !notesSearch.trim() ||
          n.title.toLowerCase().includes(notesSearch.toLowerCase()) ||
          n.content.toLowerCase().includes(notesSearch.toLowerCase());
        return matchesCat && matchesQuery;
      })
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return b.updatedAt - a.updatedAt;
      });
  }, [notes, selectedCategory, notesSearch]);

  const handleOpenNewNote = () => {
    triggerHaptic();
    setEditingNoteId(null);
    setNoteTitle('');
    setNoteContent('');
    setNoteCategory('Generale');
    setNotePinned(false);
    setIsComposing(true);
  };

  const handleEditNote = (note: NoteItem) => {
    triggerHaptic();
    setEditingNoteId(note.id);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    setNoteCategory(note.category);
    setNotePinned(note.pinned);
    setIsComposing(true);
  };

  const handleSaveNote = () => {
    triggerHaptic();
    if (!noteTitle.trim() && !noteContent.trim()) {
      setIsComposing(false);
      return;
    }

    const titleToSave = noteTitle.trim() || 'Appunto senza titolo';

    if (editingNoteId) {
      setNotes((prev) =>
        prev.map((n) =>
          n.id === editingNoteId
            ? {
                ...n,
                title: titleToSave,
                content: noteContent,
                category: noteCategory,
                pinned: notePinned,
                updatedAt: Date.now(),
              }
            : n
        )
      );
    } else {
      const newNote: NoteItem = {
        id: 'note-' + Date.now(),
        title: titleToSave,
        content: noteContent,
        category: noteCategory,
        pinned: notePinned,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setNotes((prev) => [newNote, ...prev]);
    }

    setIsComposing(false);
    setEditingNoteId(null);
  };

  const handleDeleteNote = (id: string) => {
    triggerHaptic();
    if (window.confirm('Vuoi eliminare questa nota?')) {
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (editingNoteId === id) {
        setIsComposing(false);
        setEditingNoteId(null);
      }
    }
  };

  const handleTogglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic();
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, pinned: !n.pinned, updatedAt: Date.now() } : n))
    );
  };

  const handleCopyNote = async (note: NoteItem, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic();
    const text = `${note.title}\n\n${note.content}\n\n[${note.category} - ${new Date(note.updatedAt).toLocaleString('it-IT')}]`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(note.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // fallback
    }
  };

  const handleShareNote = async (note: NoteItem, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic();
    const shareData = {
      title: note.title,
      text: `${note.title}\n\n${note.content}`,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // cancelled
      }
    } else {
      handleCopyNote(note, e);
    }
  };

  const handleExportTxt = (note: NoteItem, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic();
    const text = `${note.title}\nCategoria: ${note.category}\nData: ${new Date(note.updatedAt).toLocaleString('it-IT')}\n\n${note.content}`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${note.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAllNotes = () => {
    triggerHaptic();
    if (notes.length === 0) return;
    const allText = notes
      .map(
        (n, i) =>
          `=== NOTA ${i + 1}: ${n.title} [${n.category}] ===\nData: ${new Date(n.updatedAt).toLocaleString('it-IT')}\n\n${n.content}\n\n`
      )
      .join('\n----------------------------------------\n\n');

    const blob = new Blob([allText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Tutti_gli_appunti_${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleInsertTimestamp = () => {
    triggerHaptic();
    const stamp = `[${new Date().toLocaleString('it-IT')}] `;
    setNoteContent((prev) => prev + (prev.endsWith('\n') || prev === '' ? '' : '\n') + stamp);
  };

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 mb-20 md:mb-6 shadow-xl space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400 shrink-0">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Utility & Strumenti</h2>
            <p className="text-xs text-slate-400">
              Accesso rapido alle applicazioni del telefono e gestione del blocco note
            </p>
          </div>
        </div>
      </div>

      {/* Notice Toast */}
      {systemNotice && (
        <div className="p-3 bg-slate-800 border border-slate-700 text-xs text-slate-300 rounded-xl flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-orange-400 shrink-0" />
            <span>{systemNotice}</span>
          </div>
          <button
            onClick={() => setSystemNotice(null)}
            className="text-slate-400 hover:text-white ml-2 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Phone System Apps Action Launchers */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Smartphone className="w-4 h-4 text-orange-400" />
          <h3 className="text-sm font-bold text-white">Applicazioni del Telefono</h3>
          <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
            Android
          </span>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Avvia con un tocco le app native già installate sul tuo smartphone per calcoli o note veloci:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* Button 1: Calcolatrice del Telefono */}
          <button
            onClick={handleLaunchPhoneCalculator}
            className="min-h-[58px] p-3.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-700/80 hover:border-orange-500/50 rounded-xl flex items-center justify-between text-left transition-all cursor-pointer group shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400 group-hover:scale-105 transition-transform shrink-0">
                <Calculator className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-white group-hover:text-orange-400 transition-colors">
                  Apri Calcolatrice del Telefono
                </div>
                <div className="text-[11px] text-slate-400">
                  App predefinita calcolatrice Android
                </div>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-orange-400 transition-colors shrink-0 ml-2" />
          </button>

          {/* Button 2: Note del Telefono */}
          <button
            onClick={handleLaunchPhoneNotes}
            className="min-h-[58px] p-3.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-700/80 hover:border-cyan-500/50 rounded-xl flex items-center justify-between text-left transition-all cursor-pointer group shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors">
                  Apri le Note del Telefono
                </div>
                <div className="text-[11px] text-slate-400">
                  Google Keep, Samsung Notes o Note di sistema
                </div>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors shrink-0 ml-2" />
          </button>
        </div>
      </div>

      {/* In-App Blocco Note Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StickyNote className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-bold text-white">Blocco Note Locale</h3>
            <span className="text-xs text-slate-400 font-mono">({notes.length})</span>
          </div>

          <div className="flex items-center gap-2">
            {notes.length > 0 && (
              <button
                onClick={handleExportAllNotes}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                title="Scarica tutti gli appunti in un file .txt"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Esporta Tutto (.txt)</span>
              </button>
            )}
            <button
              onClick={handleOpenNewNote}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold shadow-md shadow-orange-500/20 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nuova Nota</span>
            </button>
          </div>
        </div>

        {/* Search & Category Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Cerca negli appunti..."
              value={notesSearch}
              onChange={(e) => setNotesSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
            />
            {notesSearch && (
              <button
                onClick={() => setNotesSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {['Tutti', ...NOTE_CATEGORIES].map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Composer / Edit Card */}
        {isComposing && (
          <div className="bg-slate-950 border-2 border-orange-500/50 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-orange-400" />
                <span>{editingNoteId ? 'Modifica Nota' : 'Scrivi Nuova Nota'}</span>
              </h4>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setNotePinned(!notePinned)}
                  className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                    notePinned
                      ? 'bg-orange-500/20 border-orange-500 text-orange-400'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                  title={notePinned ? 'In evidenza' : 'Metti in evidenza'}
                >
                  {notePinned ? <Pin className="w-4 h-4" /> : <PinOff className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setIsComposing(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-900 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Title & Category */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Titolo
                </label>
                <input
                  type="text"
                  placeholder="Es. Ispezione Diga Sud - Scarico 2"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 font-semibold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Categoria
                </label>
                <select
                  value={noteCategory}
                  onChange={(e) => setNoteCategory(e.target.value as NoteItem['category'])}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-orange-500 cursor-pointer"
                >
                  {NOTE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Content textarea */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-semibold text-slate-400">
                  Testo / Appunto
                </label>
                <button
                  type="button"
                  onClick={handleInsertTimestamp}
                  className="text-[11px] text-orange-400 hover:text-orange-300 flex items-center gap-1 cursor-pointer"
                >
                  <Clock className="w-3 h-3" />
                  <span>Inserisci Ora Corrente</span>
                </button>
              </div>
              <textarea
                rows={5}
                placeholder="Scrivi qui osservazioni, numeri, misure, dettagli tecnici o anomalie riscontrate..."
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 leading-relaxed font-sans"
              />
            </div>

            {/* Composer Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsComposing(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleSaveNote}
                className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold shadow-md shadow-orange-500/20 transition-colors cursor-pointer"
              >
                Salva Nota
              </button>
            </div>
          </div>
        )}

        {/* Notes Cards List */}
        {filteredNotes.length === 0 ? (
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-8 text-center text-slate-500">
            <StickyNote className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-semibold text-slate-400">Nessuna nota trovata</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {notesSearch
                ? 'Nessun appunto corrisponde alla ricerca corrente.'
                : 'Crea una nuova nota per appuntare parametri, misure sul campo o note di manutenzione.'}
            </p>
            {!isComposing && (
              <button
                onClick={handleOpenNewNote}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-orange-400" />
                <span>Crea il tuo primo appunto</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredNotes.map((note) => {
              const catStyle = CATEGORY_COLORS[note.category] || CATEGORY_COLORS.Generale;
              const isCopied = copiedId === note.id;

              return (
                <div
                  key={note.id}
                  onClick={() => handleEditNote(note)}
                  className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 sm:p-5 flex flex-col justify-between transition-all cursor-pointer group hover:shadow-lg relative"
                >
                  <div>
                    {/* Top Bar of Card */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}
                        >
                          {note.category}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {new Date(note.updatedAt).toLocaleDateString('it-IT', {
                            day: '2-digit',
                            month: '2-digit',
                            year: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      {/* Pin Button */}
                      <button
                        onClick={(e) => handleTogglePin(note.id, e)}
                        className={`p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer ${
                          note.pinned ? 'text-orange-400' : 'text-slate-600 hover:text-slate-400'
                        }`}
                        title={note.pinned ? 'Rimuovi evidenza' : 'Metti in evidenza'}
                      >
                        <Pin className={`w-3.5 h-3.5 ${note.pinned ? 'fill-orange-400' : ''}`} />
                      </button>
                    </div>

                    {/* Title */}
                    <h4 className="text-sm font-bold text-white mb-2 group-hover:text-orange-400 transition-colors line-clamp-1">
                      {note.title}
                    </h4>

                    {/* Content Preview */}
                    <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap line-clamp-4 font-sans">
                      {note.content}
                    </p>
                  </div>

                  {/* Bottom Action Footer */}
                  <div
                    className="flex items-center justify-between pt-3 mt-3 border-t border-slate-900"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => handleEditNote(note)}
                      className="text-[11px] font-semibold text-slate-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-orange-400" />
                      <span>Modifica</span>
                    </button>

                    <div className="flex items-center gap-1">
                      {/* Copy button */}
                      <button
                        onClick={(e) => handleCopyNote(note, e)}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="Copia testo negli appunti"
                      >
                        {isCopied ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {/* Share button */}
                      <button
                        onClick={(e) => handleShareNote(note, e)}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="Condividi nota con altre app del telefono"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>

                      {/* Export .txt button */}
                      <button
                        onClick={(e) => handleExportTxt(note, e)}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="Scarica come file .txt"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete button */}
                      <button
                        onClick={() => handleDeleteNote(note.id)}
                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                        title="Elimina nota"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
