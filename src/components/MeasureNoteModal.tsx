/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  StickyNote,
  X,
  Mic,
  MicOff,
  Check,
  RotateCcw,
  AlertCircle,
  Clock,
  Database,
  Radio,
} from 'lucide-react';
import { MeasurementRecord, formatFlowValue, formatTimeParts } from '../types/measurement';

export interface MeasureNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  record?: MeasurementRecord | null;
  liveContext?: {
    category: string;
    label: string;
    currentAverage: number | null;
    flowPerSec: number | null;
    count: number;
    containerAmount: number | null;
    isSavedInDB: boolean;
  } | null;
  initialNote: string;
  onSaveNote: (note: string) => Promise<void> | void;
}

export const MeasureNoteModal: React.FC<MeasureNoteModalProps> = ({
  isOpen,
  onClose,
  record,
  liveContext,
  initialNote,
  onSaveNote,
}) => {
  const [noteText, setNoteText] = useState<string>('');
  const [isVoiceListening, setIsVoiceListening] = useState<boolean>(false);
  const [interimVoiceText, setInterimVoiceText] = useState<string>('');
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const recognitionRef = useRef<any>(null);
  const isUserListeningRef = useRef<boolean>(false);
  const lastFinalIndexRef = useRef<number>(-1);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync initialNote when modal opens
  useEffect(() => {
    if (isOpen) {
      setNoteText(initialNote || '');
      setInterimVoiceText('');
      setVoiceNotice(null);
      setIsVoiceListening(false);
      isUserListeningRef.current = false;
      lastFinalIndexRef.current = -1;
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    } else {
      stopVoiceListening();
    }
  }, [isOpen, initialNote]);

  // Clean up speech recognition on unmount
  useEffect(() => {
    return () => {
      stopVoiceListening();
    };
  }, []);

  const triggerHaptic = () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(15);
      } catch {}
    }
  };

  // Helper to format spoken Italian punctuation ("punto", "virgola", "vai a capo", etc.)
  const formatSpokenText = (raw: string): string => {
    let s = raw;
    s = s.replace(/\b(punto\s+e\s+(?:vai\s+)?a\s+capo|punto\s+a\s+capo)\b/gi, '.\n');
    s = s.replace(/\b(virgola\s+e\s+(?:vai\s+)?a\s+capo|virgola\s+a\s+capo)\b/gi, ',\n');
    s = s.replace(/\b(?:vai\s+a\s+capo|va\s+a\s+capo|andare\s+a\s+capo|a\s+capo|nuova\s+riga|nuovo\s+paragrafo)\b/gi, '\n');
    s = s.replace(/\bvirgola\b/gi, ',');
    s = s.replace(/\bpunto\s+e\s+virgola\b/gi, ';');
    s = s.replace(/\bdue\s+punti\b/gi, ':');
    s = s.replace(/\bpunto\s+interrogativo\b/gi, '?');
    s = s.replace(/\bpunto\s+esclamativo\b/gi, '!');
    s = s.replace(/\btrattino\b/gi, '-');
    s = s.replace(/\bpunto\b/gi, '.');
    s = s.replace(/[ \t]+([,.:;?!])/g, '$1');
    s = s.replace(/[ \t]+\n/g, '\n');
    s = s.replace(/\n[ \t]+/g, '\n');
    return s;
  };

  // Helper to strip repetitive overlapping speech chunks (at phrase and word level)
  const stripOverlap = (existingText: string, incomingText: string): string => {
    const ex = existingText.trim();
    const inc = incomingText.trim();
    if (!ex) return inc;
    if (!inc) return '';

    const exLower = ex.toLowerCase();
    const incLower = inc.toLowerCase();

    // If existing text already ends with the exact incoming string (ignoring punctuation), it is 100% duplicate
    const cleanExLower = exLower.replace(/[,.:;?!]+$/, '').trim();
    const cleanIncLower = incLower.replace(/[,.:;?!]+$/, '').trim();
    if (cleanExLower.endsWith(cleanIncLower)) {
      return '';
    }

    // Check if the beginning of incomingText overlaps with the end of existingText
    // e.g. existing ends with "misura", incoming is "misura effettuata" -> returns "effettuata"
    const incWords = inc.split(/\s+/);
    for (let k = incWords.length; k >= 1; k--) {
      const prefix = incWords.slice(0, k).join(' ').toLowerCase().replace(/[,.:;?!]+$/, '').trim();
      if (prefix && cleanExLower.endsWith(prefix)) {
        const remainder = incWords.slice(k).join(' ').trim();
        return remainder;
      }
    }

    return inc;
  };

  const appendSpokenText = (rawText: string) => {
    if (!rawText || !rawText.trim()) return;
    const formatted = formatSpokenText(rawText);

    if (formatted.replace(/\s/g, '').length === 0 && formatted.includes('\n')) {
      setNoteText((prev) => (prev ? prev.replace(/[ \t]+$/, '') + '\n' : ''));
      return;
    }

    setNoteText((prev) => {
      const cleanPrev = prev ? prev.replace(/[ \t]+$/, '') : '';
      if (!cleanPrev) {
        const capText = formatted.trim().replace(/(^|\n)(\s*)([a-zàèéìòù])/g, (_, p1, p2, p3) => p1 + p2 + p3.toUpperCase());
        return capText + (formatted.endsWith('\n') ? '\n' : '');
      }

      const hadLeadingNewline = formatted.startsWith('\n');
      const hadTrailingNewline = formatted.endsWith('\n');
      let cleanFormatted = formatted.trim();

      if (
        (cleanPrev.endsWith('.') || cleanPrev.endsWith(',')) &&
        (cleanFormatted.startsWith('.') || cleanFormatted.startsWith(','))
      ) {
        cleanFormatted = cleanFormatted.slice(1).trim();
      }

      const delta = stripOverlap(cleanPrev, cleanFormatted);
      if (!delta) {
        if ((hadLeadingNewline || hadTrailingNewline) && !cleanPrev.endsWith('\n')) {
          return cleanPrev + '\n';
        }
        return cleanPrev;
      }

      const shouldStartOnNewline = hadLeadingNewline || cleanPrev.endsWith('\n');
      const endsWithPunct =
        cleanPrev.endsWith('.') ||
        cleanPrev.endsWith('?') ||
        cleanPrev.endsWith('!') ||
        cleanPrev.endsWith('\n');

      const separator = shouldStartOnNewline
        ? (cleanPrev.endsWith('\n') ? '' : '\n')
        : (cleanPrev ? ' ' : '');

      const capitalizedDelta = (endsWithPunct || shouldStartOnNewline)
        ? delta.replace(/(^|\n)(\s*)([a-zàèéìòù])/g, (_, p1, p2, p3) => p1 + p2 + p3.toUpperCase())
        : delta;

      let result = `${cleanPrev}${separator}${capitalizedDelta}`;
      if (hadTrailingNewline && !result.endsWith('\n')) {
        result += '\n';
      }
      return result;
    });
  };

  // Android Speech Event Listener (for APK environment with native SpeechBridge)
  useEffect(() => {
    const handleAndroidSpeech = (e: Event) => {
      const customEvent = e as CustomEvent<{ type: string; error?: string; text?: string }>;
      const { type, error, text } = customEvent.detail || {};

      if (type === 'ready' || type === 'listening') {
        setIsVoiceListening(true);
        setVoiceNotice(null);
      } else if (type === 'partial') {
        if (text) setInterimVoiceText(text);
      } else if (type === 'result') {
        if (text && text.trim()) {
          appendSpokenText(text.trim());
        }
        setInterimVoiceText('');
      } else if (type === 'end') {
        setInterimVoiceText('');
        // Seamless multi-sentence continuation in APK
        if (isUserListeningRef.current) {
          setTimeout(() => {
            if (isUserListeningRef.current) {
              try {
                if (typeof window !== 'undefined' && window.AndroidSpeech && window.AndroidSpeech.isAvailable()) {
                  window.AndroidSpeech.startListening('it-IT');
                }
              } catch {}
            }
          }, 250);
        } else {
          setIsVoiceListening(false);
        }
      } else if (type === 'error') {
        if (error && error.includes('11')) {
          // code_11 is recognizer busy/transient in android
          setVoiceNotice('Microfono pronto. Parla adesso...');
          return;
        } else if (error === 'permission_denied') {
          isUserListeningRef.current = false;
          setIsVoiceListening(false);
          setInterimVoiceText('');
          setVoiceNotice('Permesso microfono non concesso nelle impostazioni Android.');
        } else if (error && error.includes('code_7')) {
          // No speech input in timeout - restart if still listening
          if (isUserListeningRef.current) {
            setTimeout(() => {
              if (isUserListeningRef.current) {
                try {
                  window.AndroidSpeech?.startListening('it-IT');
                } catch {}
              }
            }, 300);
            return;
          }
          setIsVoiceListening(false);
          setInterimVoiceText('');
        } else {
          isUserListeningRef.current = false;
          setIsVoiceListening(false);
          setInterimVoiceText('');
          setVoiceNotice(`Microfono: ${error || 'errore temporaneo'}`);
        }
        setTimeout(() => setVoiceNotice(null), 4000);
      }
    };

    window.addEventListener('androidSpeechEvent', handleAndroidSpeech);
    window.addEventListener('androidspeech', handleAndroidSpeech);
    return () => {
      window.removeEventListener('androidSpeechEvent', handleAndroidSpeech);
      window.removeEventListener('androidspeech', handleAndroidSpeech);
    };
  }, []);

  const stopVoiceListening = () => {
    isUserListeningRef.current = false;
    setIsVoiceListening(false);
    setInterimVoiceText('');
    if (typeof window !== 'undefined' && window.AndroidSpeech) {
      try {
        window.AndroidSpeech.stopListening();
      } catch {}
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }
  };

  const startVoiceListening = () => {
    triggerHaptic();
    setVoiceNotice(null);
    setInterimVoiceText('');
    lastFinalIndexRef.current = -1;

    // 1. Android APK native bridge if available
    if (typeof window !== 'undefined' && window.AndroidSpeech && window.AndroidSpeech.isAvailable()) {
      try {
        isUserListeningRef.current = true;
        setIsVoiceListening(true);
        window.AndroidSpeech.startListening('it-IT');
        return;
      } catch (err) {
        console.warn('Native AndroidSpeech failed, fallback to Web Speech:', err);
      }
    }

    // 2. Standard Web Speech API
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setVoiceNotice('Dettatura vocale non supportata da questo browser. Usa il microfono sulla tastiera virtuale (Gboard).');
      setTimeout(() => setVoiceNotice(null), 4000);
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }

      const rec = new SpeechRec();
      rec.lang = 'it-IT';
      rec.continuous = false; // continuous: false avoids Chrome cumulative duplication
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onstart = () => {
        setIsVoiceListening(true);
        setVoiceNotice(null);
        lastFinalIndexRef.current = -1;
      };

      rec.onresult = (event: any) => {
        let interim = '';
        for (let i = 0; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            if (i > lastFinalIndexRef.current) {
              lastFinalIndexRef.current = i;
              const transcript = res[0]?.transcript || '';
              if (transcript.trim()) {
                appendSpokenText(transcript);
              }
            }
          } else {
            interim += res[0]?.transcript || '';
          }
        }
        setInterimVoiceText(interim.trim());
      };

      rec.onerror = (event: any) => {
        if (event.error === 'no-speech') return;
        isUserListeningRef.current = false;
        setIsVoiceListening(false);
        setInterimVoiceText('');
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setVoiceNotice('Permesso microfono negato nel browser.');
        } else if (event.error === 'network') {
          setVoiceNotice('Microfono: connessione di rete assente.');
        } else {
          setVoiceNotice(`Microfono: ${event.error}`);
        }
        setTimeout(() => setVoiceNotice(null), 4000);
      };

      rec.onend = () => {
        setInterimVoiceText('');
        if (isUserListeningRef.current) {
          lastFinalIndexRef.current = -1;
          setTimeout(() => {
            if (isUserListeningRef.current) {
              try {
                rec.start();
              } catch {
                try {
                  startVoiceListening();
                } catch {
                  setIsVoiceListening(false);
                }
              }
            }
          }, 150);
        } else {
          setIsVoiceListening(false);
        }
      };

      recognitionRef.current = rec;
      isUserListeningRef.current = true;
      rec.start();
    } catch (err) {
      isUserListeningRef.current = false;
      setIsVoiceListening(false);
      setVoiceNotice('Impossibile avviare il microfono.');
      setTimeout(() => setVoiceNotice(null), 4000);
    }
  };

  const toggleVoiceListening = () => {
    if (isVoiceListening) {
      stopVoiceListening();
    } else {
      startVoiceListening();
    }
  };


  const handleSave = async () => {
    triggerHaptic();
    setIsSaving(true);
    try {
      stopVoiceListening();
      await onSaveNote(noteText.trim());
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  // Metadata context
  const displayLabel = record?.label || liveContext?.label || 'Misurazione';
  const displayCategory = record?.category || liveContext?.category || 'Diga Sud';
  const displayDate = record?.createdAt
    ? new Date(record.createdAt).toLocaleString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Misura attuale';

  const avgMs = record ? record.finalAverage : liveContext?.currentAverage ?? null;
  const flowVal = record ? (record.flowRatePerSec ?? null) : liveContext?.flowPerSec ?? null;
  const containerVal = record ? record.containerAmount : liveContext?.containerAmount ?? null;


  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl max-h-[92vh] flex flex-col bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="relative px-5 py-3.5 border-b border-slate-800 bg-slate-900/90 flex items-center justify-center">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <StickyNote className="w-4 h-4" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-white tracking-wide text-center">
              Nota Misura
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Chiudi finestra nota"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Measurement Context Card */}
        <div className="px-5 py-3 bg-slate-950/60 border-b border-slate-800 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 rounded font-bold bg-orange-500/20 text-orange-400">
                {displayCategory}
              </span>
              <span className="font-bold text-white text-sm">
                {displayLabel}
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-400">{displayDate}</span>
            </div>

            {avgMs !== null && (
              <div className="flex items-center gap-2 text-slate-300 font-mono-tabular">
                <span>Media: <strong className="text-white">{formatTimeParts(avgMs).fullMs}</strong></span>
                {flowVal !== null && (
                  <span className="text-emerald-400 font-bold">
                    ({formatFlowValue(flowVal)} l/s)
                  </span>
                )}
                {containerVal && (
                  <span className="text-slate-400">
                    · {containerVal} L
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Voice status banner */}
          {isVoiceListening && (
            <div className="px-3.5 py-2.5 rounded-xl bg-orange-500/15 border border-orange-500/40 text-xs text-orange-200 flex items-center justify-between gap-3 animate-pulse">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-orange-400 shrink-0" />
                <span className="font-semibold">Dettatura vocale attiva: parla vicino al microfono...</span>
              </div>
              <span className="text-[11px] text-orange-300 font-mono">Dì "punto", "virgola", "vai a capo"</span>
            </div>
          )}

          {voiceNotice && (
            <div className="px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs text-amber-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{voiceNotice}</span>
            </div>
          )}

          {/* Pulsante Dettatura Vocale centrato in alto */}
          <div className="flex items-center justify-center pt-0.5 pb-1">
            <button
              type="button"
              onClick={toggleVoiceListening}
              className={`min-h-[44px] px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm ${
                isVoiceListening
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/30 animate-pulse'
                  : 'bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-orange-400 border border-orange-500/40 hover:border-orange-400'
              }`}
              title="Avvia o ferma la dettatura vocale"
            >
              {isVoiceListening ? (
                <>
                  <MicOff className="w-4 h-4 shrink-0" />
                  <span>Ferma Dettatura Vocale</span>
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4 shrink-0" />
                  <span>Dettatura Vocale</span>
                </>
              )}
            </button>
          </div>

          {/* Textarea con etichetta Testo Nota alla Sx in alto */}
          <div className="relative">
            <label
              htmlFor="measure-note-textarea"
              className="block text-xs font-semibold text-slate-300 mb-1.5 text-left"
            >
              Testo Nota
            </label>
            <textarea
              id="measure-note-textarea"
              ref={textareaRef}
              rows={5}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Inserisci osservazioni sul campo, note sullo stramazzo, livello acqua o condizioni ambientali..."
              className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors resize-y leading-relaxed"
            />

            {interimVoiceText && (
              <div className="mt-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-xs text-orange-300 italic flex items-center gap-2">
                <Mic className="w-3.5 h-3.5 text-orange-400 animate-spin shrink-0" />
                <span className="truncate">In ascolto: "{interimVoiceText}"</span>
              </div>
            )}
          </div>

          {/* Barra inferiore: Cancella testo (a sinistra) e Conteggio caratteri (in basso a destra) */}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <div>
              {noteText && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic();
                    setNoteText('');
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Cancella testo</span>
                </button>
              )}
            </div>

            {/* In basso a DX: 0 Caratteri */}
            <span className="text-xs text-slate-400 font-mono font-medium ml-auto select-none">
              {noteText.length} Caratteri
            </span>
          </div>


        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-900/95 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="min-h-[42px] px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer"
          >
            Annulla
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="min-h-[44px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer whitespace-nowrap"
          >
            <Check className="w-4 h-4 shrink-0" />
            <span>
              {isSaving ? 'Salvataggio...' : 'Salva Nota nel Database'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
