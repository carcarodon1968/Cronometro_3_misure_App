/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Calculator,
  X,
  Clock,
  Trash2,
  Copy,
  Check,
  ArrowRight,
  FileText,
  Volume2,
} from 'lucide-react';

export interface CalculationHistoryItem {
  id: string;
  expression: string;
  result: string;
  timestamp: number;
}

interface CalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendToNote?: (expression: string, result: string) => void;
}

const STORAGE_KEY_CALC_HISTORY = 'cronometro3_calc_history_v2';

export function CalculatorModal({ isOpen, onClose, onSendToNote }: CalculatorModalProps) {
  const [display, setDisplay] = useState<string>('0');
  const [equation, setEquation] = useState<string>('');
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState<boolean>(false);
  const [memory, setMemory] = useState<number>(0);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [history, setHistory] = useState<CalculationHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CALC_HISTORY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Save history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CALC_HISTORY, JSON.stringify(history.slice(0, 40)));
    } catch {
      // ignore
    }
  }, [history]);

  // Keyboard navigation when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (/^[0-9]$/.test(e.key)) {
        handleDigit(e.key);
      } else if (e.key === '.' || e.key === ',') {
        handleDecimal();
      } else if (e.key === '+') {
        handleOperator('+');
      } else if (e.key === '-') {
        handleOperator('-');
      } else if (e.key === '*') {
        handleOperator('×');
      } else if (e.key === '/') {
        e.preventDefault();
        handleOperator('÷');
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        handleEqual();
      } else if (e.key === 'Backspace') {
        handleBackspace();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, display, equation, prevValue, operator, waitingForOperand]);

  if (!isOpen) return null;

  const triggerHaptic = () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(15);
      } catch {
        // ignore
      }
    }
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  // ---------------- OPERATIONS ----------------
  const handleDigit = (digit: string) => {
    triggerHaptic();
    if (waitingForOperand) {
      setDisplay(digit);
      setWaitingForOperand(false);
    } else {
      setDisplay(display === '0' ? digit : display + digit);
    }
  };

  const handleDecimal = () => {
    triggerHaptic();
    if (waitingForOperand) {
      setDisplay('0.');
      setWaitingForOperand(false);
      return;
    }
    if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  };

  const handleClear = () => {
    triggerHaptic();
    setDisplay('0');
    setEquation('');
    setPrevValue(null);
    setOperator(null);
    setWaitingForOperand(false);
  };

  const handleClearEntry = () => {
    triggerHaptic();
    setDisplay('0');
  };

  const handleBackspace = () => {
    triggerHaptic();
    if (waitingForOperand) return;
    if (display.length > 1) {
      setDisplay(display.slice(0, -1));
    } else {
      setDisplay('0');
    }
  };

  const handleToggleSign = () => {
    triggerHaptic();
    const val = parseFloat(display);
    if (!isNaN(val)) {
      setDisplay(String(-val));
    }
  };

  const executeOperation = (prev: number, next: number, op: string): number => {
    switch (op) {
      case '+':
        return prev + next;
      case '-':
        return prev - next;
      case '×':
        return prev * next;
      case '÷':
        return next !== 0 ? prev / next : NaN;
      case '%':
        return (prev * next) / 100;
      default:
        return next;
    }
  };

  const handleOperator = (nextOp: string) => {
    triggerHaptic();
    const inputValue = parseFloat(display);

    if (prevValue === null) {
      setPrevValue(inputValue);
      setEquation(`${inputValue} ${nextOp}`);
    } else if (operator) {
      if (waitingForOperand) {
        setOperator(nextOp);
        setEquation(`${prevValue} ${nextOp}`);
        return;
      }
      const result = executeOperation(prevValue, inputValue, operator);
      const formatted = Number.isFinite(result) ? parseFloat(result.toFixed(8)) : 0;
      setDisplay(String(formatted));
      setPrevValue(formatted);
      setEquation(`${formatted} ${nextOp}`);
    }

    setWaitingForOperand(true);
    setOperator(nextOp);
  };

  const handleEqual = () => {
    triggerHaptic();
    const inputValue = parseFloat(display);

    if (operator && prevValue !== null) {
      const result = executeOperation(prevValue, inputValue, operator);
      const formatted = Number.isFinite(result) ? parseFloat(result.toFixed(8)) : 0;
      const eqString = `${prevValue} ${operator} ${inputValue} =`;

      setEquation(eqString);
      setDisplay(String(formatted));

      const newHistoryItem: CalculationHistoryItem = {
        id: 'calc-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        expression: `${prevValue} ${operator} ${inputValue}`,
        result: String(formatted),
        timestamp: Date.now(),
      };
      setHistory((prev) => [newHistoryItem, ...prev]);

      setPrevValue(null);
      setOperator(null);
      setWaitingForOperand(true);
    }
  };

  const handleQuickFunc = (type: 'sqrt' | 'sqr' | 'inv' | 'pct' | 'pi') => {
    triggerHaptic();
    const current = parseFloat(display);
    if (isNaN(current) && type !== 'pi') return;

    let res = 0;
    let label = '';

    switch (type) {
      case 'sqrt':
        res = current >= 0 ? Math.sqrt(current) : NaN;
        label = `√(${current})`;
        break;
      case 'sqr':
        res = current * current;
        label = `sqr(${current})`;
        break;
      case 'inv':
        res = current !== 0 ? 1 / current : NaN;
        label = `1/(${current})`;
        break;
      case 'pct':
        res = current / 100;
        label = `${current}%`;
        break;
      case 'pi':
        res = Math.PI;
        label = 'π';
        break;
    }

    const formatted = parseFloat(res.toFixed(8));
    setDisplay(String(formatted));
    setEquation(label + ' =');
    setWaitingForOperand(true);

    const newHistoryItem: CalculationHistoryItem = {
      id: 'calc-' + Date.now(),
      expression: label,
      result: String(formatted),
      timestamp: Date.now(),
    };
    setHistory((prev) => [newHistoryItem, ...prev]);
  };

  const handleMemory = (action: 'MC' | 'MR' | 'M+' | 'M-') => {
    triggerHaptic();
    const current = parseFloat(display) || 0;
    switch (action) {
      case 'MC':
        setMemory(0);
        showToast('Memoria azzerata');
        break;
      case 'MR':
        setDisplay(String(memory));
        setWaitingForOperand(true);
        showToast(`Richiamato: ${memory}`);
        break;
      case 'M+':
        setMemory((prev) => prev + current);
        showToast(`Memoria: +${current}`);
        break;
      case 'M-':
        setMemory((prev) => prev - current);
        showToast(`Memoria: -${current}`);
        break;
    }
  };

  const handleConvertFlowToM3h = () => {
    triggerHaptic();
    const current = parseFloat(display) || 0;
    const res = parseFloat((current * 3.6).toFixed(4));
    setEquation(`${current} L/s × 3.6 =`);
    setDisplay(String(res));
    setWaitingForOperand(true);

    const newHistoryItem: CalculationHistoryItem = {
      id: 'calc-' + Date.now(),
      expression: `${current} L/s ➔ m³/h`,
      result: `${res} m³/h`,
      timestamp: Date.now(),
    };
    setHistory((prev) => [newHistoryItem, ...prev]);
    showToast(`${current} L/s = ${res} m³/h`);
  };

  const handleConvertFlowToLs = () => {
    triggerHaptic();
    const current = parseFloat(display) || 0;
    const res = parseFloat((current / 3.6).toFixed(4));
    setEquation(`${current} m³/h ÷ 3.6 =`);
    setDisplay(String(res));
    setWaitingForOperand(true);

    const newHistoryItem: CalculationHistoryItem = {
      id: 'calc-' + Date.now(),
      expression: `${current} m³/h ➔ L/s`,
      result: `${res} L/s`,
      timestamp: Date.now(),
    };
    setHistory((prev) => [newHistoryItem, ...prev]);
    showToast(`${current} m³/h = ${res} L/s`);
  };

  const handleCopyCurrent = async () => {
    triggerHaptic();
    try {
      await navigator.clipboard.writeText(display);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast('Risultato copiato!');
    } catch {
      // fallback
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-400">
              <Calculator className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">Calcolatrice</h3>
              <p className="text-[10px] text-slate-400">Strumento di calcolo interno</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer text-xs font-semibold flex items-center gap-1 ${
                showHistory
                  ? 'bg-orange-500/20 border-orange-500/40 text-orange-400'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
              }`}
              title="Cronologia calcoli"
            >
              <Clock className="w-3.5 h-3.5" />
              <span className="text-[11px] hidden sm:inline">Nastro</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="Chiudi calcolatrice"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-3">
          {/* Display */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 text-right select-none relative">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 min-h-[16px] mb-1">
              <div className="flex items-center gap-1.5">
                {memory !== 0 && (
                  <span className="px-1.5 py-0.2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded text-[10px] font-bold">
                    M = {memory}
                  </span>
                )}
                {toastMsg && (
                  <span className="text-orange-400 font-semibold animate-pulse text-[10px]">
                    {toastMsg}
                  </span>
                )}
              </div>
              <span className="truncate max-w-[220px]">{equation}</span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                onClick={handleCopyCurrent}
                className="p-1.5 text-slate-500 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Copia valore a schermo"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>

              <div className="text-3xl sm:text-4xl font-mono font-bold text-white tracking-tight break-all overflow-hidden text-right leading-none py-1">
                {display}
              </div>
            </div>
          </div>

          {/* History Drawer if toggled */}
          {showHistory ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2 max-h-[300px] overflow-y-auto">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs font-bold text-white">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-orange-400" />
                  <span>Cronologia Calcoli</span>
                </span>
                {history.length > 0 && (
                  <button
                    onClick={() => {
                      triggerHaptic();
                      setHistory([]);
                    }}
                    className="text-[10px] text-slate-500 hover:text-red-400 flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Azzera</span>
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  Nessun calcolo nella cronologia.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="p-2 bg-slate-950/80 border border-slate-800/80 rounded-lg flex items-center justify-between text-xs"
                    >
                      <div className="truncate mr-2 font-mono">
                        <div className="text-[10px] text-slate-400 truncate">{item.expression}</div>
                        <div className="text-white font-bold">= {item.result}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => {
                            triggerHaptic();
                            setDisplay(item.result);
                            setWaitingForOperand(true);
                            showToast(`Valore ${item.result} inserito`);
                          }}
                          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-semibold cursor-pointer"
                        >
                          Usa
                        </button>
                        {onSendToNote && (
                          <button
                            onClick={() => {
                              triggerHaptic();
                              onSendToNote(item.expression, item.result);
                              onClose();
                            }}
                            className="px-2 py-0.5 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded text-[10px] font-semibold cursor-pointer flex items-center gap-0.5"
                            title="Invia nota"
                          >
                            <FileText className="w-3 h-3" />
                            <span>Nota</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Memory Buttons */}
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={() => handleMemory('MC')}
                  className="py-1.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  MC
                </button>
                <button
                  onClick={() => handleMemory('MR')}
                  className="py-1.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  MR
                </button>
                <button
                  onClick={() => handleMemory('M+')}
                  className="py-1.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  M+
                </button>
                <button
                  onClick={() => handleMemory('M-')}
                  className="py-1.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  M-
                </button>
              </div>

              {/* Scientific Functions */}
              <div className="grid grid-cols-5 gap-1.5">
                <button
                  onClick={() => handleQuickFunc('sqrt')}
                  className="py-1.5 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                  title="Radice quadrata"
                >
                  √
                </button>
                <button
                  onClick={() => handleQuickFunc('sqr')}
                  className="py-1.5 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                  title="Quadrato x²"
                >
                  x²
                </button>
                <button
                  onClick={() => handleQuickFunc('inv')}
                  className="py-1.5 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                  title="Inverso 1/x"
                >
                  1/x
                </button>
                <button
                  onClick={() => handleQuickFunc('pct')}
                  className="py-1.5 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                  title="Percentuale %"
                >
                  %
                </button>
                <button
                  onClick={() => handleQuickFunc('pi')}
                  className="py-1.5 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                  title="Pi greco π"
                >
                  π
                </button>
              </div>

              {/* Main Keypad */}
              <div className="grid grid-cols-4 gap-2">
                {/* Row 1 */}
                <button
                  onClick={handleClear}
                  className="min-h-[48px] bg-red-500/20 hover:bg-red-500/30 active:bg-red-500/40 border border-red-500/40 rounded-xl text-sm font-bold text-red-300 transition-colors cursor-pointer"
                >
                  C
                </button>
                <button
                  onClick={handleClearEntry}
                  className="min-h-[48px] bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 rounded-xl text-sm font-bold text-slate-300 transition-colors cursor-pointer"
                >
                  CE
                </button>
                <button
                  onClick={handleBackspace}
                  className="min-h-[48px] bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 rounded-xl text-sm font-bold text-slate-300 transition-colors cursor-pointer"
                  title="Cancella ultimo"
                >
                  ⌫
                </button>
                <button
                  onClick={() => handleOperator('÷')}
                  className={`min-h-[48px] border rounded-xl text-lg font-bold transition-colors cursor-pointer ${
                    operator === '÷' && waitingForOperand
                      ? 'bg-orange-500 text-white border-orange-400'
                      : 'bg-orange-500/15 hover:bg-orange-500/25 border-orange-500/30 text-orange-400'
                  }`}
                >
                  ÷
                </button>

                {/* Row 2 */}
                <button
                  onClick={() => handleDigit('7')}
                  className="min-h-[48px] bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 rounded-xl text-lg font-bold text-white transition-colors cursor-pointer"
                >
                  7
                </button>
                <button
                  onClick={() => handleDigit('8')}
                  className="min-h-[48px] bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 rounded-xl text-lg font-bold text-white transition-colors cursor-pointer"
                >
                  8
                </button>
                <button
                  onClick={() => handleDigit('9')}
                  className="min-h-[48px] bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 rounded-xl text-lg font-bold text-white transition-colors cursor-pointer"
                >
                  9
                </button>
                <button
                  onClick={() => handleOperator('×')}
                  className={`min-h-[48px] border rounded-xl text-lg font-bold transition-colors cursor-pointer ${
                    operator === '×' && waitingForOperand
                      ? 'bg-orange-500 text-white border-orange-400'
                      : 'bg-orange-500/15 hover:bg-orange-500/25 border-orange-500/30 text-orange-400'
                  }`}
                >
                  ×
                </button>

                {/* Row 3 */}
                <button
                  onClick={() => handleDigit('4')}
                  className="min-h-[48px] bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 rounded-xl text-lg font-bold text-white transition-colors cursor-pointer"
                >
                  4
                </button>
                <button
                  onClick={() => handleDigit('5')}
                  className="min-h-[48px] bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 rounded-xl text-lg font-bold text-white transition-colors cursor-pointer"
                >
                  5
                </button>
                <button
                  onClick={() => handleDigit('6')}
                  className="min-h-[48px] bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 rounded-xl text-lg font-bold text-white transition-colors cursor-pointer"
                >
                  6
                </button>
                <button
                  onClick={() => handleOperator('-')}
                  className={`min-h-[48px] border rounded-xl text-lg font-bold transition-colors cursor-pointer ${
                    operator === '-' && waitingForOperand
                      ? 'bg-orange-500 text-white border-orange-400'
                      : 'bg-orange-500/15 hover:bg-orange-500/25 border-orange-500/30 text-orange-400'
                  }`}
                >
                  -
                </button>

                {/* Row 4 */}
                <button
                  onClick={() => handleDigit('1')}
                  className="min-h-[48px] bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 rounded-xl text-lg font-bold text-white transition-colors cursor-pointer"
                >
                  1
                </button>
                <button
                  onClick={() => handleDigit('2')}
                  className="min-h-[48px] bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 rounded-xl text-lg font-bold text-white transition-colors cursor-pointer"
                >
                  2
                </button>
                <button
                  onClick={() => handleDigit('3')}
                  className="min-h-[48px] bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 rounded-xl text-lg font-bold text-white transition-colors cursor-pointer"
                >
                  3
                </button>
                <button
                  onClick={() => handleOperator('+')}
                  className={`min-h-[48px] border rounded-xl text-lg font-bold transition-colors cursor-pointer ${
                    operator === '+' && waitingForOperand
                      ? 'bg-orange-500 text-white border-orange-400'
                      : 'bg-orange-500/15 hover:bg-orange-500/25 border-orange-500/30 text-orange-400'
                  }`}
                >
                  +
                </button>

                {/* Row 5 */}
                <button
                  onClick={handleToggleSign}
                  className="min-h-[48px] bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 rounded-xl text-base font-bold text-slate-300 transition-colors cursor-pointer"
                >
                  ±
                </button>
                <button
                  onClick={() => handleDigit('0')}
                  className="min-h-[48px] bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 rounded-xl text-lg font-bold text-white transition-colors cursor-pointer"
                >
                  0
                </button>
                <button
                  onClick={handleDecimal}
                  className="min-h-[48px] bg-slate-900 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 rounded-xl text-lg font-bold text-white transition-colors cursor-pointer"
                >
                  ,
                </button>
                <button
                  onClick={handleEqual}
                  className="min-h-[48px] bg-orange-500 hover:bg-orange-600 active:bg-orange-700 border border-orange-400 rounded-xl text-xl font-bold text-white shadow-lg shadow-orange-500/20 transition-all cursor-pointer"
                >
                  =
                </button>
              </div>

              {/* Quick Flow Conversion Buttons */}
              <div className="pt-2 border-t border-slate-800 grid grid-cols-2 gap-2 text-xs">
                <button
                  onClick={handleConvertFlowToM3h}
                  className="py-1.5 px-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-orange-500/40 rounded-lg font-semibold text-orange-400 text-left flex items-center justify-between cursor-pointer"
                >
                  <span>L/s ➔ m³/h (× 3.6)</span>
                  <ArrowRight className="w-3 h-3 opacity-60" />
                </button>
                <button
                  onClick={handleConvertFlowToLs}
                  className="py-1.5 px-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/40 rounded-lg font-semibold text-cyan-400 text-left flex items-center justify-between cursor-pointer"
                >
                  <span>m³/h ➔ L/s (÷ 3.6)</span>
                  <ArrowRight className="w-3 h-3 opacity-60" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs">
          {onSendToNote ? (
            <button
              onClick={() => {
                triggerHaptic();
                onSendToNote(equation, display);
                onClose();
              }}
              className="text-orange-400 hover:text-orange-300 font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Invia risultato a Nuova Nota</span>
            </button>
          ) : (
            <span className="text-slate-500 text-[11px]">Calcolatrice interna</span>
          )}

          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
