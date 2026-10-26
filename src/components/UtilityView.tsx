/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
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
  X,
  Calculator,
  Crosshair,
  Flashlight,
  Camera,
  Image as ImageIcon,
  Sun,
  Maximize2,
  Mic,
  MicOff,
  Radio,
} from 'lucide-react';
import { CalculatorModal } from './CalculatorModal';
import { BubbleLevelModal } from './BubbleLevelModal';

declare global {
  interface Window {
    AndroidTorch?: {
      isAvailable: () => boolean;
      setTorch: (enabled: boolean) => boolean;
      toggleTorch: () => boolean;
      isTorchOn: () => boolean;
    };
    AndroidSpeech?: {
      isAvailable: () => boolean;
      startListening: (lang?: string) => void;
      stopListening: () => void;
      isListening?: () => boolean;
    };
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  category: 'Generale' | 'Misure' | 'Impianto' | 'Diga / Vasca' | 'Promemoria';
  pinned: boolean;
  photos?: string[]; // compressed base64 JPEG strings
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

export interface UtilityViewProps {
  initialOpenNote?: NoteItem | null;
  onClearInitialOpenNote?: () => void;
}

export function UtilityView({ initialOpenNote, onClearInitialOpenNote }: UtilityViewProps = {}) {
  // ---------- NOTES STATE ----------
  const [notes, setNotes] = useState<NoteItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_NOTES);
      if (saved) return JSON.parse(saved);
      return [
        {
          id: 'sample-1',
          title: 'Promemoria Misure Flusso',
          content: 'Registrare 3 prove consecutive per ogni vasca prima di validare la media. Verificare il livello idrometrico iniziale e scattare foto allo stramazzo se necessario.',
          category: 'Misure',
          pinned: true,
          photos: [],
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
  const [notePhotos, setNotePhotos] = useState<string[]>([]);
  const [isCompressingPhoto, setIsCompressingPhoto] = useState<boolean>(false);

  // If navigated from Cronometro with a new linked note, open it immediately in the editor
  useEffect(() => {
    if (initialOpenNote) {
      setNotes((prev) => {
        const exists = prev.some((n) => n.id === initialOpenNote.id);
        if (exists) {
          return prev.map((n) => (n.id === initialOpenNote.id ? initialOpenNote : n));
        }
        return [initialOpenNote, ...prev];
      });
      setEditingNoteId(initialOpenNote.id);
      setNoteTitle(initialOpenNote.title);
      setNoteContent(initialOpenNote.content);
      setNoteCategory(initialOpenNote.category);
      setNotePinned(initialOpenNote.pinned);
      setNotePhotos(initialOpenNote.photos || []);
      setIsComposing(true);
      if (onClearInitialOpenNote) {
        onClearInitialOpenNote();
      }
    }
  }, [initialOpenNote, onClearInitialOpenNote]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // ---------- TOOL MODALS & SENSORS ----------
  const [isCalculatorOpen, setIsCalculatorOpen] = useState<boolean>(false);
  const [isBubbleLevelOpen, setIsBubbleLevelOpen] = useState<boolean>(false);

  // ---------- FLASHLIGHT LED STATE ----------
  const [isFlashOn, setIsFlashOn] = useState<boolean>(false);
  const [isScreenTorchOn, setIsScreenTorchOn] = useState<boolean>(false);
  const [flashNotice, setFlashNotice] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const noteContentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const lastFinalIndexRef = useRef<number>(-1);
  const voiceTargetRef = useRef<'content' | 'title'>('content');
  const isUserListeningRef = useRef<boolean>(false);

  // ---------- VOICE DICTATION (SPEECH-TO-TEXT) ----------
  const [isVoiceListening, setIsVoiceListening] = useState<boolean>(false);
  const [voiceTarget, setVoiceTarget] = useState<'content' | 'title'>('content');
  const [interimVoiceText, setInterimVoiceText] = useState<string>('');
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // Save notes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(notes));
    } catch (e) {
      console.error('Failed to save notes:', e);
    }
  }, [notes]);

  // Clean up flashlight and speech recognition on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.AndroidTorch) {
        try {
          if (window.AndroidTorch.isTorchOn()) {
            window.AndroidTorch.setTorch(false);
          }
        } catch {}
      }
      if (typeof window !== 'undefined' && window.AndroidSpeech) {
        try {
          window.AndroidSpeech.stopListening();
        } catch {}
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
      if (trackRef.current) {
        try {
          trackRef.current.stop();
        } catch {}
      }
      if (streamRef.current) {
        try {
          streamRef.current.getTracks().forEach((t) => t.stop());
        } catch {}
      }
    };
  }, []);

  const triggerHaptic = () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(15);
      } catch {
        // ignore
      }
    }
  };

  // ------------------------------------------------------------------
  // FLASHLIGHT TOGGLE (Hardware Camera Torch via Android Bridge or WebRTC)
  // ------------------------------------------------------------------
  const handleToggleFlashlight = async () => {
    triggerHaptic();

    // 1. Android APK Nativo (CameraManager Hardware Flash senza stream WebRTC)
    if (typeof window !== 'undefined' && window.AndroidTorch && window.AndroidTorch.isAvailable()) {
      try {
        const nextState = !isFlashOn;
        const success = window.AndroidTorch.setTorch(nextState);
        if (success) {
          setIsFlashOn(nextState);
          setFlashNotice(nextState ? 'Flash LED Hardware Acceso' : 'Flash LED Spento');
          setTimeout(() => setFlashNotice(null), 3000);
          return;
        }
      } catch (err) {
        console.warn('Native AndroidTorch failed, attempting WebRTC fallback:', err);
      }
    }

    // Spegnimento sicuro del flash nativo se attivo
    if (typeof window !== 'undefined' && window.AndroidTorch) {
      try {
        if (window.AndroidTorch.isTorchOn()) {
          window.AndroidTorch.setTorch(false);
        }
      } catch {}
    }

    // 2. Web / Browser WebRTC Torch (Chrome PWA)
    if (isFlashOn) {
      // Turn off hardware torch
      try {
        if (trackRef.current) {
          await (trackRef.current as unknown as { applyConstraints: (c: unknown) => Promise<void> }).applyConstraints({
            advanced: [{ torch: false }],
          });
          trackRef.current.stop();
          trackRef.current = null;
        }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
      } catch (err) {
        console.warn('Error turning off torch:', err);
      }
      setIsFlashOn(false);
      setFlashNotice(null);
    } else {
      // Attempt hardware torch via WebRTC (Mobile Chrome / Edge)
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('WebRTC/Fotocamera non supportata nel browser');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });

        const track = stream.getVideoTracks()[0];
        const capabilities = (track.getCapabilities && (track.getCapabilities() as Record<string, unknown>)) || {};

        if ('torch' in capabilities) {
          await (track as unknown as { applyConstraints: (c: unknown) => Promise<void> }).applyConstraints({
            advanced: [{ torch: true }],
          });
          streamRef.current = stream;
          trackRef.current = track;
          setIsFlashOn(true);
          setFlashNotice('Flash LED Acceso');
          setTimeout(() => setFlashNotice(null), 3000);
        } else {
          // Hardware torch constraint not supported on this device/browser: activate screen torch
          track.stop();
          setIsScreenTorchOn(true);
          setFlashNotice('Flash fisico non disponibile: Torcia a Schermo Bianco attivata');
          setTimeout(() => setFlashNotice(null), 4000);
        }
      } catch (err) {
        console.warn('Hardware torch error, activating screen torch:', err);
        setIsScreenTorchOn(true);
        setFlashNotice('Torcia a Schermo Bianco attivata (Flash hardware non disponibile)');
        setTimeout(() => setFlashNotice(null), 4000);
      }
    }
  };

  // ------------------------------------------------------------------
  // PHOTO ATTACHMENT COMPRESSION & HANDLING
  // ------------------------------------------------------------------
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1024;
          const MAX_HEIGHT = 1024;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height = Math.round((height * MAX_WIDTH) / width);
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = Math.round((width * MAX_HEIGHT) / height);
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas context error'));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          // Compress to lightweight JPEG (~70-110KB)
          resolve(canvas.toDataURL('image/jpeg', 0.72));
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsCompressingPhoto(true);
    triggerHaptic();

    try {
      const newBase64Photos: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
          const compressed = await compressImage(file);
          newBase64Photos.push(compressed);
        }
      }
      setNotePhotos((prev) => [...prev, ...newBase64Photos]);
    } catch (err) {
      console.error('Failed to compress photo:', err);
    } finally {
      setIsCompressingPhoto(false);
      // Reset input value so same photo can be re-selected if desired
      if (e.target) e.target.value = '';
    }
  };

  const handleRemovePhoto = (index: number) => {
    triggerHaptic();
    setNotePhotos((prev) => prev.filter((_, i) => i !== index));
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

  // Helper to format spoken Italian punctuation ("punto", "virgola", "due punti", "vai a capo", etc.)
  const formatSpokenText = (raw: string): string => {
    let s = raw;

    // Line breaks with punctuation
    s = s.replace(/\b(punto\s+e\s+(?:vai\s+)?a\s+capo|punto\s+a\s+capo)\b/gi, '.\n');
    s = s.replace(/\b(virgola\s+e\s+(?:vai\s+)?a\s+capo|virgola\s+a\s+capo)\b/gi, ',\n');

    // Line break commands
    s = s.replace(/\b(?:vai\s+a\s+capo|va\s+a\s+capo|andare\s+a\s+capo|a\s+capo|nuova\s+riga|nuovo\s+paragrafo)\b/gi, '\n');

    // Standard Italian punctuation
    s = s.replace(/\bvirgola\b/gi, ',');
    s = s.replace(/\bpunto\s+e\s+virgola\b/gi, ';');
    s = s.replace(/\bdue\s+punti\b/gi, ':');
    s = s.replace(/\bpunto\s+interrogativo\b/gi, '?');
    s = s.replace(/\bpunto\s+esclamativo\b/gi, '!');
    s = s.replace(/\btrattino\b/gi, '-');
    s = s.replace(/\bpunto\b/gi, '.');

    // Spacing cleanup
    s = s.replace(/[ \t]+([,.:;?!])/g, '$1');
    s = s.replace(/[ \t]+\n/g, '\n');
    s = s.replace(/\n[ \t]+/g, '\n');
    return s;
  };

  // Helper to remove any overlap when browsers emit cumulative or partially-repeated speech transcripts
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
    // e.g. existing ends with "ispezione", incoming is "ispezione canale" -> returns "canale"
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

  const appendSpokenText = (spoken: string, target: 'content' | 'title') => {
    let formatted = formatSpokenText(spoken);
    if (!formatted) return;

    // Handle purely newline command (e.g. user said "vai a capo" by itself)
    if (formatted.replace(/\s/g, '').length === 0 && formatted.includes('\n')) {
      if (target === 'content') {
        setNoteContent((prev) => (prev ? prev.replace(/[ \t]+$/, '') + '\n' : ''));
      }
      return;
    }

    if (target === 'title') {
      // For title, replace any newlines with space and apply stripOverlap
      const cleanTitleFormatted = formatted.replace(/\n+/g, ' ').trim();
      if (!cleanTitleFormatted) return;
      setNoteTitle((prev) => {
        const cleanPrev = prev.trim();
        if (!cleanPrev) {
          return cleanTitleFormatted.charAt(0).toUpperCase() + cleanTitleFormatted.slice(1);
        }
        const delta = stripOverlap(cleanPrev, cleanTitleFormatted);
        if (!delta) return cleanPrev;
        return `${cleanPrev} ${delta}`;
      });
    } else {
      setNoteContent((prev) => {
        // Strip trailing horizontal spaces only, keep intentional newlines
        const cleanPrev = prev ? prev.replace(/[ \t]+$/, '') : '';
        if (!cleanPrev) {
          const capText = formatted.trim().replace(/(^|\n)(\s*)([a-zàèéìòù])/g, (_, p1, p2, p3) => p1 + p2 + p3.toUpperCase());
          return capText + (formatted.endsWith('\n') ? '\n' : '');
        }

        const hadLeadingNewline = formatted.startsWith('\n');
        const hadTrailingNewline = formatted.endsWith('\n');

        let cleanFormatted = formatted.trim();
        // Avoid double punctuation if previous ended with punctuation and incoming starts with punctuation
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
        const endsWithPunctuationOrNewline =
          cleanPrev.endsWith('.') ||
          cleanPrev.endsWith('?') ||
          cleanPrev.endsWith('!') ||
          cleanPrev.endsWith('\n');

        const separator = shouldStartOnNewline
          ? (cleanPrev.endsWith('\n') ? '' : '\n')
          : (cleanPrev ? ' ' : '');

        const capitalizedDelta = (endsWithPunctuationOrNewline || shouldStartOnNewline)
          ? delta.replace(/(^|\n)(\s*)([a-zàèéìòù])/g, (_, p1, p2, p3) => p1 + p2 + p3.toUpperCase())
          : delta;

        let result = `${cleanPrev}${separator}${capitalizedDelta}`;
        if (hadTrailingNewline && !result.endsWith('\n')) {
          result += '\n';
        }
        return result;
      });
    }
  };

  // Listener for Android Native Speech events (if running inside APK with AndroidSpeech)
  useEffect(() => {
    const handleAndroidSpeech = (e: Event) => {
      const customEvent = e as CustomEvent<{ type: string; error?: string; text?: string }>;
      const { type, error, text } = customEvent.detail || {};

      if (type === 'ready' || type === 'listening') {
        setIsVoiceListening(true);
        setVoiceError(null);
      } else if (type === 'partial') {
        if (text) {
          setInterimVoiceText(text);
        }
      } else if (type === 'result') {
        if (text) {
          appendSpokenText(text, voiceTargetRef.current);
        }
        setInterimVoiceText('');
      } else if (type === 'end') {
        setIsVoiceListening(false);
        setInterimVoiceText('');
      } else if (type === 'error') {
        setIsVoiceListening(false);
        setInterimVoiceText('');
        if (error === 'permission_denied') {
          setVoiceError("Permesso microfono non concesso. Abilita l'accesso al microfono per l'app.");
        } else if (error === 'code_11') {
          // If native Android code_11 (ERROR_SERVER_DISCONNECTED) occurs, auto-reconnect silently
          if (typeof window !== 'undefined' && window.AndroidSpeech && window.AndroidSpeech.isAvailable()) {
            setTimeout(() => {
              try {
                window.AndroidSpeech.startListening('it-IT');
              } catch {}
            }, 100);
          }
        } else if (error && error !== 'code_7' && error !== 'code_11') {
          setVoiceError(`Microfono: ${error}`);
        }
      }
    };

    window.addEventListener('androidSpeechEvent', handleAndroidSpeech);
    return () => {
      window.removeEventListener('androidSpeechEvent', handleAndroidSpeech);
    };
  }, []);

  const stopVoiceDictation = () => {
    triggerHaptic();
    isUserListeningRef.current = false;
    setIsVoiceListening(false);
    setInterimVoiceText('');

    if (typeof window !== 'undefined' && window.AndroidSpeech && window.AndroidSpeech.isAvailable()) {
      try {
        window.AndroidSpeech.stopListening();
      } catch {}
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
  };

  const startVoiceDictation = (target: 'content' | 'title' = 'content') => {
    triggerHaptic();
    setVoiceError(null);
    setVoiceTarget(target);
    voiceTargetRef.current = target;
    isUserListeningRef.current = true;
    lastFinalIndexRef.current = -1;

    // If already active on the same target, toggle off
    if (isVoiceListening && voiceTarget === target) {
      stopVoiceDictation();
      return;
    }

    // If active on different target, stop first
    if (isVoiceListening) {
      stopVoiceDictation();
    }

    // 1. Android APK Native SpeechRecognizer Bridge
    if (typeof window !== 'undefined' && window.AndroidSpeech && window.AndroidSpeech.isAvailable()) {
      try {
        setIsVoiceListening(true);
        window.AndroidSpeech.startListening('it-IT');
        return;
      } catch (err) {
        console.warn('AndroidSpeech bridge call failed, falling back to Web Speech', err);
      }
    }

    // 2. Web Speech API (Chrome, Edge, Safari, PWA)
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceError(
        "Dettatura vocale diretta non supportata da questo browser. Puoi usare il tasto Microfono sulla tastiera virtuale dello smartphone (Gboard)."
      );
      isUserListeningRef.current = false;
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }

      const recognition = new SpeechRecognition();
      recognition.lang = 'it-IT';
      // Use continuous: false for clean utterance segmentation (avoids Chrome cumulative duplication)
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsVoiceListening(true);
        setVoiceError(null);
        lastFinalIndexRef.current = -1;
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        const currentField = voiceTargetRef.current;

        for (let i = 0; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            // Guarantee that each finalized index in the recognition results stream is processed AT MOST ONCE
            if (i > lastFinalIndexRef.current) {
              lastFinalIndexRef.current = i;
              const transcript = item[0]?.transcript || '';
              if (transcript.trim()) {
                appendSpokenText(transcript, currentField);
              }
            }
          } else {
            interim += item[0]?.transcript || '';
          }
        }
        setInterimVoiceText(interim.trim());

        // For title, stop immediately once the utterance has finalized
        if (currentField === 'title' && lastFinalIndexRef.current >= 0) {
          setTimeout(() => {
            stopVoiceDictation();
          }, 200);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setVoiceError("Accesso al microfono non consentito. Verifica i permessi del browser.");
          isUserListeningRef.current = false;
          setIsVoiceListening(false);
        } else if (event.error === 'network') {
          setVoiceError("Riconoscimento vocale offline o rete assente. Usa il microfono sulla tastiera Gboard.");
          isUserListeningRef.current = false;
          setIsVoiceListening(false);
        } else if (event.error !== 'no-speech') {
          setVoiceError(`Errore microfono (${event.error}).`);
          isUserListeningRef.current = false;
          setIsVoiceListening(false);
        }
      };

      recognition.onend = () => {
        setInterimVoiceText('');
        // If dictating note content and user has not clicked stop, continue listening for the next phrase seamlessly
        if (isUserListeningRef.current && voiceTargetRef.current === 'content') {
          lastFinalIndexRef.current = -1;
          setTimeout(() => {
            if (isUserListeningRef.current && voiceTargetRef.current === 'content') {
              try {
                recognition.start();
              } catch {
                isUserListeningRef.current = false;
                setIsVoiceListening(false);
              }
            }
          }, 150);
        } else {
          isUserListeningRef.current = false;
          setIsVoiceListening(false);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e: any) {
      console.error('Failed to start speech recognition:', e);
      isUserListeningRef.current = false;
      setIsVoiceListening(false);
      setVoiceError("Impossibile avviare il microfono: " + (e?.message || 'errore sconosciuto'));
    }
  };

  const handleOpenNewNote = () => {
    triggerHaptic();
    stopVoiceDictation();
    setEditingNoteId(null);
    setNoteTitle('');
    setNoteContent('');
    setNoteCategory('Generale');
    setNotePinned(false);
    setNotePhotos([]);
    setIsComposing(true);
  };

  const handleEditNote = (note: NoteItem) => {
    triggerHaptic();
    stopVoiceDictation();
    setEditingNoteId(note.id);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    setNoteCategory(note.category);
    setNotePinned(note.pinned);
    setNotePhotos(note.photos || []);
    setIsComposing(true);
  };

  const handleSaveNote = () => {
    triggerHaptic();
    stopVoiceDictation();
    if (!noteTitle.trim() && !noteContent.trim() && notePhotos.length === 0) {
      setIsComposing(false);
      return;
    }

    const titleToSave = noteTitle.trim() || (notePhotos.length > 0 ? 'Foto appunto sul campo' : 'Appunto senza titolo');

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
                photos: notePhotos,
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
        photos: notePhotos,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setNotes((prev) => [newNote, ...prev]);
    }

    setIsComposing(false);
    setEditingNoteId(null);
    setNotePhotos([]);
  };

  const handleDeleteNote = (id: string) => {
    triggerHaptic();
    if (window.confirm('Vuoi eliminare questa nota?')) {
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (editingNoteId === id) {
        setIsComposing(false);
        setEditingNoteId(null);
        setNotePhotos([]);
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
    const photoCount = note.photos && note.photos.length > 0 ? ` [${note.photos.length} foto allegate]` : '';
    const text = `${note.title}${photoCount}\n\n${note.content}\n\n[${note.category} - ${new Date(note.updatedAt).toLocaleString('it-IT')}]`;
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
    const photoCount = note.photos && note.photos.length > 0 ? ` [${note.photos.length} foto allegate]` : '';
    const shareData = {
      title: note.title,
      text: `${note.title}${photoCount}\n\n${note.content}`,
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
    const photoCount = note.photos && note.photos.length > 0 ? `Foto allegate: ${note.photos.length}\n` : '';
    const text = `${note.title}\nCategoria: ${note.category}\nData: ${new Date(note.updatedAt).toLocaleString('it-IT')}\n${photoCount}\n${note.content}`;
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
          `=== NOTA ${i + 1}: ${n.title} [${n.category}] ===\nData: ${new Date(n.updatedAt).toLocaleString('it-IT')}\n${
            n.photos && n.photos.length > 0 ? `[${n.photos.length} foto allegate]\n` : ''
          }\n${n.content}\n\n`
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

  const handleReceiveFromCalculator = (expression: string, result: string) => {
    triggerHaptic();
    if (isComposing) {
      const stamp = `[Calcolo: ${expression} = ${result}] `;
      setNoteContent((prev) => prev + (prev.endsWith('\n') || prev === '' ? '' : '\n') + stamp);
    } else {
      const newNote: NoteItem = {
        id: 'note-' + Date.now(),
        title: `Calcolo: ${result}`,
        content: `Formula: ${expression}\nRisultato: ${result}\nData: ${new Date().toLocaleString('it-IT')}`,
        category: 'Misure',
        pinned: false,
        photos: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setNotes((prev) => [newNote, ...prev]);
    }
  };

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 mb-20 md:mb-6 shadow-xl space-y-5">
      {/* Quick action tools */}
      <div className="flex items-center justify-center pb-4 border-b border-slate-800">
        {/* Quick Tools Bar: Calcolatrice + Livella a Bolla + Flash LED */}
        <div className="flex items-center justify-center flex-wrap gap-2">
          {/* 1. Tasto Calcolatrice */}
          <button
            onClick={() => {
              triggerHaptic();
              setIsCalculatorOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white border border-slate-700 hover:border-orange-500/50 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm group shrink-0"
          >
            <Calculator className="w-4 h-4 text-orange-400 group-hover:scale-110 transition-transform" />
            <span>Calcolatrice</span>
          </button>

          {/* 2. Tasto Livella a Bolla Digitale */}
          <button
            onClick={() => {
              triggerHaptic();
              setIsBubbleLevelOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white border border-slate-700 hover:border-cyan-500/50 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm group shrink-0"
            title="Livella digitale per pendenze, canalette e stramazzi"
          >
            <Crosshair className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
            <span>Livella a Bolla</span>
          </button>

          {/* 3. Interruttore Torcia Flash LED */}
          <button
            onClick={handleToggleFlashlight}
            className={`inline-flex items-center justify-center gap-2 px-3.5 py-2 border rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm shrink-0 ${
              isFlashOn
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-amber-500/30'
                : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700 hover:border-amber-500/50'
            }`}
            title="Accendi/Spegni il Flash LED dello smartphone per ispezioni al buio"
          >
            <Flashlight className={`w-4 h-4 ${isFlashOn ? 'text-slate-950 animate-pulse' : 'text-amber-400'}`} />
            <span>Flash LED</span>
            <span
              className={`w-2 h-2 rounded-full transition-colors ${
                isFlashOn ? 'bg-slate-950 ring-2 ring-white/60 animate-ping' : 'bg-slate-500'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Notice / Feedback Toast for Flashlight */}
      {flashNotice && (
        <div className="p-3 bg-slate-950 border border-amber-500/40 text-amber-300 text-xs rounded-xl flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <Flashlight className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{flashNotice}</span>
          </div>
          <button
            onClick={() => setFlashNotice(null)}
            className="text-slate-400 hover:text-white cursor-pointer ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Full-Screen White Torch Fallback Mode */}
      {isScreenTorchOn && (
        <div
          onClick={() => setIsScreenTorchOn(false)}
          className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-between p-6 cursor-pointer select-none text-slate-900"
          title="Tocca un punto qualsiasi dello schermo per spegnere la torcia"
        >
          <div className="flex items-center gap-2 pt-4 font-bold text-sm text-slate-800">
            <Sun className="w-5 h-5 text-amber-500" />
            <span>Torcia Schermo Attiva (Massima Luminosità)</span>
          </div>
          <div className="text-center">
            <Flashlight className="w-16 h-16 mx-auto mb-2 text-slate-700 opacity-60" />
            <p className="text-lg font-bold">Luce Bianca di Schermo</p>
            <p className="text-xs text-slate-600 mt-1">
              Usa la luce dello schermo per illuminare il pozzetto o il punto di misura
            </p>
          </div>
          <div className="pb-6">
            <span className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold shadow-lg">
              Tocca per Spegnere
            </span>
          </div>
        </div>
      )}

      {/* Blocco Note Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StickyNote className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-bold text-white">I Miei Appunti</h3>
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
                  onClick={() => {
                    stopVoiceDictation();
                    setIsComposing(false);
                  }}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-900 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Title & Category */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-semibold text-slate-400">
                    Titolo
                  </label>
                  <button
                    type="button"
                    onClick={() => startVoiceDictation('title')}
                    className={`text-[11px] flex items-center gap-1.5 px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                      isVoiceListening && voiceTarget === 'title'
                        ? 'bg-red-500 text-white border-red-400 animate-pulse font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-orange-400 hover:border-slate-700'
                    }`}
                    title="Detta il titolo con la voce"
                  >
                    {isVoiceListening && voiceTarget === 'title' ? (
                      <>
                        <MicOff className="w-3 h-3" />
                        <span>In ascolto...</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-3 h-3 text-orange-400" />
                        <span>Detta Titolo</span>
                      </>
                    )}
                  </button>
                </div>
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

            {/* Content textarea with Microphone Dictation */}
            <div>
              <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                <label className="block text-[11px] font-semibold text-slate-400">
                  Testo Nota
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startVoiceDictation('content')}
                    className={`text-xs flex items-center gap-1.5 px-3 py-1 rounded-xl border transition-all cursor-pointer font-bold shadow-sm ${
                      isVoiceListening && voiceTarget === 'content'
                        ? 'bg-red-500 text-white border-red-400 shadow-red-500/30 ring-2 ring-red-400/40 animate-pulse'
                        : 'bg-orange-500/15 hover:bg-orange-500/25 border-orange-500/40 text-orange-400 hover:text-orange-300'
                    }`}
                    title="Attiva/Disattiva la dettatura vocale"
                  >
                    {isVoiceListening && voiceTarget === 'content' ? (
                      <>
                        <MicOff className="w-3.5 h-3.5" />
                        <span>Ferma Microfono</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-3.5 h-3.5 text-orange-400" />
                        <span>Dettatura Vocale</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleInsertTimestamp}
                    className="text-[11px] text-slate-400 hover:text-slate-300 flex items-center gap-1 cursor-pointer px-2 py-1 bg-slate-900 border border-slate-800 rounded-lg hover:border-slate-700 transition-colors"
                  >
                    <Clock className="w-3 h-3 text-orange-400" />
                    <span>Ora</span>
                  </button>
                </div>
              </div>

              {/* Live Voice Recording Status Banner */}
              {isVoiceListening && (
                <div className="mb-2 p-3 bg-gradient-to-r from-red-950/60 via-slate-900 to-slate-900 border border-red-500/50 rounded-xl flex items-center justify-between gap-3 shadow-lg shadow-red-950/30 animate-in fade-in">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative flex items-center justify-center shrink-0">
                      <span className="w-3.5 h-3.5 rounded-full bg-red-500 animate-ping absolute" />
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 relative" />
                    </div>
                    {/* Soundwave equalizer bars */}
                    <div className="flex items-end gap-1 h-4 shrink-0">
                      <span className="w-1 bg-red-400 rounded-full animate-bounce [animation-delay:-0.3s] h-3" />
                      <span className="w-1 bg-orange-400 rounded-full animate-bounce [animation-delay:-0.15s] h-4" />
                      <span className="w-1 bg-amber-400 rounded-full animate-bounce [animation-delay:0s] h-2.5" />
                      <span className="w-1 bg-red-400 rounded-full animate-bounce [animation-delay:-0.2s] h-4" />
                      <span className="w-1 bg-orange-400 rounded-full animate-bounce [animation-delay:-0.1s] h-3" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-red-200">
                          {voiceTarget === 'title' ? 'Dettatura Titolo' : 'Dettatura Testo'} in corso (Italiano)
                        </span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-red-500/30 text-red-300 font-mono font-bold tracking-wider">
                          REC
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 italic truncate mt-0.5">
                        {interimVoiceText ? `"${interimVoiceText}"` : 'Parla al microfono, le parole vengono trascritte in tempo reale...'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={stopVoiceDictation}
                    className="px-3 py-1.5 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded-lg text-xs font-bold shadow transition-colors shrink-0 cursor-pointer"
                  >
                    Fine
                  </button>
                </div>
              )}

              {/* Voice Error notice */}
              {voiceError && (
                <div className="mb-2 p-3 bg-slate-950 border border-amber-500/40 rounded-xl text-xs text-amber-300 flex items-center justify-between gap-3 animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <MicOff className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>{voiceError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVoiceError(null)}
                    className="text-slate-400 hover:text-white cursor-pointer ml-2"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <textarea
                ref={noteContentTextareaRef}
                rows={4}
                placeholder="Scrivi o detta qui osservazioni, numeri, misure, dettagli tecnici o anomalie riscontrate..."
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 leading-relaxed font-sans"
              />
            </div>

            {/* Foto-Allegato Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-orange-400" />
                  <span>Foto Allegata all'Appunto ({notePhotos.length})</span>
                </span>

                <div className="flex items-center gap-2">
                  {/* Direct Camera Capture */}
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoSelected}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={isCompressingPhoto}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-xs font-semibold text-orange-400 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Scatta Foto</span>
                  </button>

                  {/* Gallery File Selection */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoSelected}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isCompressingPhoto}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>Galleria</span>
                  </button>
                </div>
              </div>

              {isCompressingPhoto && (
                <div className="py-2 text-xs text-orange-400 animate-pulse flex items-center gap-2">
                  <Clock className="w-3 h-3 animate-spin" />
                  <span>Elaborazione e ottimizzazione foto in corso...</span>
                </div>
              )}

              {/* Photo Thumbnails in Composer */}
              {notePhotos.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 pt-1">
                  {notePhotos.map((photo, index) => (
                    <div
                      key={index}
                      className="relative group rounded-xl overflow-hidden border border-slate-700 bg-slate-900 aspect-square"
                    >
                      <img
                        src={photo}
                        alt={`Allegato ${index + 1}`}
                        className="w-full h-full object-cover cursor-pointer hover:opacity-90"
                        onClick={() => setLightboxImage(photo)}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(index)}
                        className="absolute top-1 right-1 p-1 bg-red-600/90 text-white rounded-full hover:bg-red-700 transition-colors shadow-md cursor-pointer"
                        title="Rimuovi foto"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Composer Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  stopVoiceDictation();
                  setIsComposing(false);
                  setNotePhotos([]);
                }}
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
                : 'Crea una nuova nota per appuntare parametri, misure sul campo o note di manutenzione con foto.'}
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
              const hasPhotos = note.photos && note.photos.length > 0;

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
                        {hasPhotos && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                            <Camera className="w-3 h-3 text-orange-400" />
                            <span>{note.photos!.length}</span>
                          </span>
                        )}
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
                    {note.content && (
                      <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap line-clamp-3 font-sans mb-3">
                        {note.content}
                      </p>
                    )}

                    {/* Attached Photos Preview in Card */}
                    {hasPhotos && (
                      <div
                        className="grid grid-cols-4 gap-1.5 my-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {note.photos!.slice(0, 4).map((photo, pIdx) => (
                          <div
                            key={pIdx}
                            onClick={() => setLightboxImage(photo)}
                            className="aspect-square rounded-lg overflow-hidden border border-slate-800 hover:border-orange-500/50 cursor-pointer relative group/img bg-slate-900"
                          >
                            <img
                              src={photo}
                              alt="Foto appunto"
                              className="w-full h-full object-cover transition-transform group-hover/img:scale-105"
                            />
                            {pIdx === 3 && note.photos!.length > 4 && (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-xs font-bold text-white">
                                +{note.photos!.length - 3}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
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
                        title="Condividi nota"
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

      {/* Internal In-App Calculator Modal */}
      <CalculatorModal
        isOpen={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
        onSendToNote={handleReceiveFromCalculator}
      />

      {/* Internal Bubble Level Modal */}
      <BubbleLevelModal
        isOpen={isBubbleLevelOpen}
        onClose={() => setIsBubbleLevelOpen(false)}
      />

      {/* Full-Screen Lightbox Image Viewer */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center">
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute -top-12 right-0 p-2 text-white bg-slate-800/80 hover:bg-slate-700 rounded-full transition-colors cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={lightboxImage}
              alt="Foto ingrandita"
              className="max-h-[85vh] max-w-full object-contain rounded-xl shadow-2xl border border-slate-800"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </section>
  );
}
