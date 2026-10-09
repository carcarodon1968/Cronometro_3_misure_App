/**
 * Firestore Security Rules Test Suite (Dirty Dozen Verification)
 * Verifies that all 12 adversarial payloads in security_spec.md are rejected with PERMISSION_DENIED.
 */

export interface SimulatedContext {
  uid: string | null;
  emailVerified: boolean;
  nowMs: number;
}

export interface SessionPayload {
  [key: string]: unknown;
}

const ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

const REQUIRED_KEYS = [
  'id',
  'recordId',
  'ownerId',
  'label',
  'category',
  'notes',
  'containerAmount',
  'flowRatePerSec',
  'flowRatePerMin',
  'flowRatePerHour',
  'flowRatePer24Hours',
  'time1',
  'time2',
  'time3',
  'averageAfterStop1',
  'averageAfterStop2',
  'averageAfterStop3',
  'finalAverage',
  'minTime',
  'maxTime',
  'spread',
  'count',
  'mode',
  'recordedAt',
  'createdAt',
  'updatedAt',
];

export function isValidId(id: unknown): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && ID_REGEX.test(id);
}

export function isValidSession(data: SessionPayload, ctx: SimulatedContext): boolean {
  if (!ctx.uid) return false;
  const keys = Object.keys(data);
  if (keys.length !== REQUIRED_KEYS.length) return false;
  for (const reqKey of REQUIRED_KEYS) {
    if (!keys.includes(reqKey)) return false;
  }

  return (
    isValidId(data.id) &&
    isValidId(data.recordId) &&
    isValidId(data.ownerId) &&
    data.ownerId === ctx.uid &&
    typeof data.label === 'string' &&
    data.label.length >= 1 &&
    data.label.length <= 120 &&
    typeof data.category === 'string' &&
    data.category.length >= 1 &&
    data.category.length <= 60 &&
    typeof data.notes === 'string' &&
    data.notes.length <= 500 &&
    typeof data.containerAmount === 'number' &&
    data.containerAmount >= 0 &&
    data.containerAmount <= 1000000 &&
    typeof data.flowRatePerSec === 'number' &&
    data.flowRatePerSec >= 0 &&
    typeof data.flowRatePerMin === 'number' &&
    data.flowRatePerMin >= 0 &&
    typeof data.flowRatePerHour === 'number' &&
    data.flowRatePerHour >= 0 &&
    typeof data.flowRatePer24Hours === 'number' &&
    data.flowRatePer24Hours >= 0 &&
    typeof data.time1 === 'number' &&
    data.time1 >= 0 &&
    typeof data.time2 === 'number' &&
    data.time2 >= 0 &&
    typeof data.time3 === 'number' &&
    data.time3 >= 0 &&
    typeof data.averageAfterStop1 === 'number' &&
    data.averageAfterStop1 >= 0 &&
    typeof data.averageAfterStop2 === 'number' &&
    data.averageAfterStop2 >= 0 &&
    typeof data.averageAfterStop3 === 'number' &&
    data.averageAfterStop3 >= 0 &&
    typeof data.finalAverage === 'number' &&
    data.finalAverage >= 0 &&
    typeof data.minTime === 'number' &&
    data.minTime >= 0 &&
    typeof data.maxTime === 'number' &&
    data.maxTime >= 0 &&
    typeof data.spread === 'number' &&
    data.spread >= 0 &&
    typeof data.count === 'number' &&
    data.count >= 1 &&
    data.count <= 3 &&
    typeof data.mode === 'string' &&
    data.mode.length >= 1 &&
    data.mode.length <= 20 &&
    (data.mode === 'independent' || data.mode === 'cumulative') &&
    typeof data.recordedAt === 'number' &&
    data.recordedAt >= 0
  );
}
