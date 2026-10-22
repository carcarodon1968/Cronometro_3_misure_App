/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Crosshair, X, RotateCcw, CheckCircle2, Compass, AlertCircle } from 'lucide-react';

interface BubbleLevelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BubbleLevelModal({ isOpen, onClose }: BubbleLevelModalProps) {
  const [pitch, setPitch] = useState<number>(0); // beta: front-to-back tilt (-180 to 180)
  const [roll, setRoll] = useState<number>(0);   // gamma: left-to-right tilt (-90 to 90)
  const [calibratedPitch, setCalibratedPitch] = useState<number>(0);
  const [calibratedRoll, setCalibratedRoll] = useState<number>(0);
  const [hasSensors, setHasSensors] = useState<boolean>(true);
  const [sensorActive, setSensorActive] = useState<boolean>(false);
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  
  const lastHapticRef = useRef<number>(0);

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;

    // Check if DeviceOrientationEvent exists
    if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
      // iOS 13+ permission request
      const requestPerm = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
        .requestPermission;

      if (typeof requestPerm === 'function') {
        requestPerm()
          .then((response: string) => {
            if (response === 'granted' && mounted) {
              setPermissionState('granted');
              bindSensor();
            } else if (mounted) {
              setPermissionState('denied');
            }
          })
          .catch(() => {
            if (mounted) bindSensor();
          });
      } else {
        bindSensor();
      }
    } else {
      setHasSensors(false);
    }

    function bindSensor() {
      const handleOrientation = (e: DeviceOrientationEvent) => {
        if (!mounted) return;
        setSensorActive(true);
        if (e.beta !== null && e.gamma !== null) {
          setPitch(e.beta);
          setRoll(e.gamma);
        }
      };

      window.addEventListener('deviceorientation', handleOrientation);

      // Fallback timer: if after 1.5s no event fired, sensor may not be supported (e.g. desktop)
      const timer = setTimeout(() => {
        if (mounted && !sensorActive) {
          // Keep sensor active flag or allow manual testing
        }
      }, 1500);

      return () => {
        window.removeEventListener('deviceorientation', handleOrientation);
        clearTimeout(timer);
      };
    }

    return () => {
      mounted = false;
    };
  }, [isOpen, sensorActive]);

  // Normalized angles relative to calibration
  const effectivePitch = pitch - calibratedPitch;
  const effectiveRoll = roll - calibratedRoll;

  // Level tolerance: ±0.8 degrees
  const isLevel = Math.abs(effectivePitch) <= 0.8 && Math.abs(effectiveRoll) <= 0.8;
  const isClose = Math.abs(effectivePitch) <= 2.5 && Math.abs(effectiveRoll) <= 2.5;

  // Slope percentages: tan(angle in rad) * 100
  const slopePitchPercent = Math.tan((effectivePitch * Math.PI) / 180) * 100;
  const slopeRollPercent = Math.tan((effectiveRoll * Math.PI) / 180) * 100;

  // Bubble position: clamp to [-70, 70] pixels inside the 160px diameter circular vial
  const maxOffset = 65;
  // roll controls X offset, pitch controls Y offset
  const bubbleX = Math.max(-maxOffset, Math.min(maxOffset, (effectiveRoll / 30) * maxOffset));
  const bubbleY = Math.max(-maxOffset, Math.min(maxOffset, (effectivePitch / 30) * maxOffset));

  // Trigger brief haptic buzz when achieving perfect level
  useEffect(() => {
    if (isLevel && typeof window !== 'undefined' && 'vibrate' in navigator) {
      const now = Date.now();
      if (now - lastHapticRef.current > 1200) {
        lastHapticRef.current = now;
        try {
          navigator.vibrate([25, 40, 25]);
        } catch {
          // ignore
        }
      }
    }
  }, [isLevel]);

  const handleCalibrate = () => {
    setCalibratedPitch(pitch);
    setCalibratedRoll(roll);
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(20);
      } catch {
        // ignore
      }
    }
  };

  const handleResetCalibration = () => {
    setCalibratedPitch(0);
    setCalibratedRoll(0);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-sm bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-400">
              <Crosshair className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">Livella a Bolla Digitale</h3>
              <p className="text-[10px] text-slate-400">Pendenze, stramazzi e planarità</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Chiudi livella"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Level Body */}
        <div className="p-5 flex flex-col items-center space-y-5">
          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <div
              className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors ${
                isLevel
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm shadow-emerald-500/20'
                  : isClose
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {isLevel ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>PERFETTAMENTE A LIVELLO (0°)</span>
                </>
              ) : (
                <span>Inclinazione attiva</span>
              )}
            </div>
          </div>

          {/* Circular 2D Spirit Level Vial */}
          <div className="relative w-48 h-48 rounded-full bg-slate-900 border-4 border-slate-700 shadow-inner flex items-center justify-center overflow-hidden">
            {/* Concentric reference rings */}
            <div className="absolute w-36 h-36 rounded-full border border-slate-800/80 pointer-events-none" />
            <div className="absolute w-24 h-24 rounded-full border border-slate-700/60 pointer-events-none" />
            <div
              className={`absolute w-12 h-12 rounded-full border-2 transition-colors pointer-events-none ${
                isLevel
                  ? 'border-emerald-400 bg-emerald-500/10'
                  : 'border-orange-500/40 bg-orange-500/5'
              }`}
            />

            {/* Crosshairs */}
            <div className="absolute w-full h-[1px] bg-slate-700/60 pointer-events-none" />
            <div className="absolute h-full w-[1px] bg-slate-700/60 pointer-events-none" />

            {/* The Fluid Bubble */}
            <div
              className={`w-10 h-10 rounded-full shadow-lg transition-transform duration-75 flex items-center justify-center ${
                isLevel
                  ? 'bg-emerald-400 shadow-emerald-500/50'
                  : isClose
                  ? 'bg-amber-400 shadow-amber-500/40'
                  : 'bg-orange-500 shadow-orange-500/40'
              }`}
              style={{
                transform: `translate(${bubbleX}px, ${bubbleY}px)`,
              }}
            >
              {/* Inner bubble reflection highlight */}
              <div className="w-3 h-3 rounded-full bg-white/60 -translate-x-1 -translate-y-1" />
            </div>
          </div>

          {/* Numeric Precision Readouts */}
          <div className="w-full grid grid-cols-2 gap-2 text-center">
            {/* Roll (Inclinazione X - Orizzontale) */}
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">
                Inclinazione X (Roll)
              </div>
              <div className="text-xl font-mono font-bold text-white mt-0.5">
                {effectiveRoll.toFixed(1)}°
              </div>
              <div className="text-[11px] font-mono text-slate-400">
                Pendenza: {slopeRollPercent.toFixed(1)}%
              </div>
            </div>

            {/* Pitch (Inclinazione Y - Longitudinale) */}
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">
                Inclinazione Y (Pitch)
              </div>
              <div className="text-xl font-mono font-bold text-white mt-0.5">
                {effectivePitch.toFixed(1)}°
              </div>
              <div className="text-[11px] font-mono text-slate-400">
                Pendenza: {slopePitchPercent.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Sensor Info Notice */}
          {!sensorActive && (
            <div className="w-full p-2.5 bg-slate-900 border border-slate-800 text-slate-400 rounded-xl text-[11px] flex items-center gap-2">
              <Compass className="w-4 h-4 text-orange-400 shrink-0" />
              <span>
                Muovi o inclina lo smartphone per calibrare i sensori di orientamento e pendenza.
              </span>
            </div>
          )}

          {/* Calibration Actions */}
          <div className="w-full flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
            <button
              onClick={handleCalibrate}
              className="flex-1 py-2 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              title="Imposta la superficie corrente come zero di riferimento"
            >
              <RotateCcw className="w-3.5 h-3.5 text-orange-400" />
              <span>Calibra a Zero</span>
            </button>

            {(calibratedPitch !== 0 || calibratedRoll !== 0) && (
              <button
                onClick={handleResetCalibration}
                className="py-2 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                title="Ripristina zero assoluto di fabbrica"
              >
                Ripristina
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-slate-900 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
