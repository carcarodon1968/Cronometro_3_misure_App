export type TimingMode = 'independent' | 'cumulative';

export interface StopSnapshot {
  stopIndex: 1 | 2 | 3;
  recordedTimeMs: number;
  runningAverageMs: number;
  runningFlowPerSec: number | null;
  timestamp: number;
}

export interface MeasurementRecord {
  id: string;
  label: string;
  category: string;
  notes: string;
  containerAmount?: number | null;
  flowRatePerSec?: number | null;
  flowRatePerMin?: number | null;
  flowRatePerHour?: number | null;
  flowRatePer24Hours?: number | null;
  time1: number | null;
  time2: number | null;
  time3: number | null;
  averageAfterStop1: number | null;
  averageAfterStop2: number | null;
  averageAfterStop3: number | null;
  finalAverage: number;
  minTime: number;
  maxTime: number;
  spread: number;
  count: number;
  mode: TimingMode;
  createdAt: number;
}

export interface FormattedTimeParts {
  minutes: string;
  seconds: string;
  centiseconds: string;
  milliseconds: string;
  full: string;
  fullMs: string;
}

export function formatTimeParts(ms: number | null | undefined): FormattedTimeParts {
  if (ms === null || ms === undefined || Number.isNaN(ms) || ms < 0) {
    return {
      minutes: '--',
      seconds: '--',
      centiseconds: '--',
      milliseconds: '---',
      full: '--:--.--',
      fullMs: '--:--.---',
    };
  }

  const totalMs = Math.floor(ms);
  const totalSeconds = Math.floor(totalMs / 1000);
  const minutesNum = Math.floor(totalSeconds / 60);
  const secondsNum = totalSeconds % 60;
  const centisecondsNum = Math.floor((totalMs % 1000) / 10);
  const millisecondsNum = totalMs % 1000;

  const minutes = String(minutesNum).padStart(2, '0');
  const seconds = String(secondsNum).padStart(2, '0');
  const centiseconds = String(centisecondsNum).padStart(2, '0');
  const milliseconds = String(millisecondsNum).padStart(3, '0');

  return {
    minutes,
    seconds,
    centiseconds,
    milliseconds,
    full: `${minutes}:${seconds}.${centiseconds}`,
    fullMs: `${minutes}:${seconds}.${milliseconds}`,
  };
}

export function parseContainerAmount(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.');
  if (!cleaned) return null;
  const val = parseFloat(cleaned);
  if (Number.isNaN(val) || val <= 0) return null;
  return val;
}

export function computeFlowFromAverage(
  containerAmount: number | null | undefined,
  averageMs: number | null | undefined
): number | null {
  if (
    containerAmount === null ||
    containerAmount === undefined ||
    Number.isNaN(containerAmount) ||
    containerAmount <= 0 ||
    averageMs === null ||
    averageMs === undefined ||
    Number.isNaN(averageMs) ||
    averageMs <= 0
  ) {
    return null;
  }
  const avgSeconds = averageMs / 1000;
  return containerAmount / avgSeconds;
}

export function formatFlowValue(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) {
    return '--';
  }
  return val.toFixed(3);
}

export function computeStatsFromTimes(
  t1: number | null,
  t2: number | null,
  t3: number | null,
  containerAmount?: number | null
): {
  validTimes: number[];
  count: number;
  averageAfterStop1: number | null;
  averageAfterStop2: number | null;
  averageAfterStop3: number | null;
  currentAverage: number | null;
  flowAfterStop1: number | null;
  flowAfterStop2: number | null;
  flowAfterStop3: number | null;
  currentFlowPerSec: number | null;
  currentFlowPerMin: number | null;
  currentFlowPerHour: number | null;
  currentFlowPer24Hours: number | null;
  minTime: number | null;
  maxTime: number | null;
  spread: number | null;
  stdDev: number | null;
} {
  const validTimes = [t1, t2, t3].filter((t): t is number => t !== null && !Number.isNaN(t));
  const count = validTimes.length;

  const averageAfterStop1 = t1 !== null ? t1 : null;
  const averageAfterStop2 =
    t1 !== null && t2 !== null ? Math.round((t1 + t2) / 2) : null;
  const averageAfterStop3 =
    t1 !== null && t2 !== null && t3 !== null
      ? Math.round((t1 + t2 + t3) / 3)
      : null;

  const flowAfterStop1 = computeFlowFromAverage(containerAmount, averageAfterStop1);
  const flowAfterStop2 = computeFlowFromAverage(containerAmount, averageAfterStop2);
  const flowAfterStop3 = computeFlowFromAverage(containerAmount, averageAfterStop3);

  if (count === 0) {
    return {
      validTimes: [],
      count: 0,
      averageAfterStop1: null,
      averageAfterStop2: null,
      averageAfterStop3: null,
      currentAverage: null,
      flowAfterStop1: null,
      flowAfterStop2: null,
      flowAfterStop3: null,
      currentFlowPerSec: null,
      currentFlowPerMin: null,
      currentFlowPerHour: null,
      currentFlowPer24Hours: null,
      minTime: null,
      maxTime: null,
      spread: null,
      stdDev: null,
    };
  }

  const sum = validTimes.reduce((acc, v) => acc + v, 0);
  const currentAverage = Math.round(sum / count);
  const currentFlowPerSec = computeFlowFromAverage(containerAmount, currentAverage);
  const currentFlowPerMin = currentFlowPerSec !== null ? currentFlowPerSec * 60 : null;
  const currentFlowPerHour = currentFlowPerSec !== null ? currentFlowPerSec * 3600 : null;
  const currentFlowPer24Hours = currentFlowPerSec !== null ? currentFlowPerSec * 86400 : null;

  const minTime = Math.min(...validTimes);
  const maxTime = Math.max(...validTimes);
  const spread = maxTime - minTime;

  const variance =
    validTimes.reduce((acc, v) => acc + Math.pow(v - currentAverage, 2), 0) / count;
  const stdDev = Math.round(Math.sqrt(variance));

  return {
    validTimes,
    count,
    averageAfterStop1,
    averageAfterStop2,
    averageAfterStop3,
    currentAverage,
    flowAfterStop1,
    flowAfterStop2,
    flowAfterStop3,
    currentFlowPerSec,
    currentFlowPerMin,
    currentFlowPerHour,
    currentFlowPer24Hours,
    minTime,
    maxTime,
    spread,
    stdDev,
  };
}

export function parseManualTimeToMs(input: string): number | null {
  const trimmed = input.trim().replace(',', '.');
  if (!trimmed) return null;

  // Format MM:SS.cc or MM:SS.mmm
  if (trimmed.includes(':')) {
    const [minPart, secPart] = trimmed.split(':');
    const mins = parseInt(minPart, 10);
    const secs = parseFloat(secPart);
    if (Number.isNaN(mins) || Number.isNaN(secs) || mins < 0 || secs < 0) {
      return null;
    }
    return Math.round((mins * 60 + secs) * 1000);
  }

  // Plain seconds e.g. "12.45"
  const secs = parseFloat(trimmed);
  if (Number.isNaN(secs) || secs < 0) return null;
  return Math.round(secs * 1000);
}
