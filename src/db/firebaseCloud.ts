import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  User,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocs,
   getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { MeasurementRecord, TimingMode } from '../types/measurement';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

// Track which cloud document IDs already exist for the active user
const knownExistingCloudDocIds = new Set<string>();

const ID_PATTERN = /^[a-zA-Z0-9_\-]+$/;

function sanitizeId(raw: string, maxLen = 128): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, maxLen);
  if (!cleaned || !ID_PATTERN.test(cleaned)) {
    return `id_${Date.now()}`;
  }
  return cleaned;
}

export function buildCloudDocId(uid: string, recordId: string): string {
  const safeUid = sanitizeId(uid, 48);
  const safeRec = sanitizeId(recordId, 75);
  return sanitizeId(`${safeUid}_${safeRec}`, 128);
}

function clampString(val: string | null | undefined, minLen: number, maxLen: number, fallback: string): string {
  const trimmed = (val ?? '').trim();
  const base = trimmed.length >= minLen ? trimmed : fallback;
  return base.slice(0, maxLen);
}

function clampNumber(val: number | null | undefined, min: number, max: number): number {
  if (val === null || val === undefined || !Number.isFinite(val)) return 0;
  return Math.min(max, Math.max(min, val));
}

function buildValidatedPayloadFields(record: MeasurementRecord, uid: string) {
  const docId = buildCloudDocId(uid, record.id);
  const safeRecordId = sanitizeId(record.id, 128);
  const safeOwnerId = sanitizeId(uid, 128);
  const mode: TimingMode = record.mode === 'cumulative' ? 'cumulative' : 'independent';

  return {
    id: docId,
    recordId: safeRecordId,
    ownerId: safeOwnerId,
    label: clampString(record.label, 1, 120, 'Misurazione'),
    category: clampString(record.category, 1, 60, 'Diga Sud'),
    notes: clampString(record.notes, 0, 500, ''),
    containerAmount: clampNumber(record.containerAmount, 0, 1000000),
    flowRatePerSec: clampNumber(record.flowRatePerSec, 0, 1000000),
    flowRatePerMin: clampNumber(record.flowRatePerMin, 0, 60000000),
    flowRatePerHour: clampNumber(record.flowRatePerHour, 0, 3600000000),
    flowRatePer24Hours: clampNumber(record.flowRatePer24Hours, 0, 86400000000),
    time1: clampNumber(record.time1, 0, 86400000),
    time2: clampNumber(record.time2, 0, 86400000),
    time3: clampNumber(record.time3, 0, 86400000),
    averageAfterStop1: clampNumber(record.averageAfterStop1, 0, 86400000),
    averageAfterStop2: clampNumber(record.averageAfterStop2, 0, 86400000),
    averageAfterStop3: clampNumber(record.averageAfterStop3, 0, 86400000),
    finalAverage: clampNumber(record.finalAverage, 0, 86400000),
    minTime: clampNumber(record.minTime, 0, 86400000),
    maxTime: clampNumber(record.maxTime, 0, 86400000),
    spread: clampNumber(record.spread, 0, 86400000),
    count: Math.min(3, Math.max(1, Math.round(record.count || 1))),
    mode,
    recordedAt: Math.max(0, Math.round(record.createdAt || Date.now())),
  };
}

function mapCloudDocToMeasurementRecord(data: Record<string, unknown>): MeasurementRecord {
  const numOrNull = (val: unknown): number | null => {
    if (typeof val === 'number' && Number.isFinite(val) && val > 0) return val;
    return null;
  };

  const numOrZero = (val: unknown): number => {
    if (typeof val === 'number' && Number.isFinite(val) && val >= 0) return val;
    return 0;
  };

  return {
    id: typeof data.recordId === 'string' && data.recordId ? data.recordId : String(data.id || ''),
    label: typeof data.label === 'string' ? data.label : 'Misurazione',
    category: typeof data.category === 'string' ? data.category : 'Diga Sud',
    notes: typeof data.notes === 'string' ? data.notes : '',
    containerAmount: numOrNull(data.containerAmount),
    flowRatePerSec: numOrNull(data.flowRatePerSec),
    flowRatePerMin: numOrNull(data.flowRatePerMin),
    flowRatePerHour: numOrNull(data.flowRatePerHour),
    flowRatePer24Hours: numOrNull(data.flowRatePer24Hours),
    time1: numOrNull(data.time1),
    time2: numOrNull(data.time2),
    time3: numOrNull(data.time3),
    averageAfterStop1: numOrNull(data.averageAfterStop1),
    averageAfterStop2: numOrNull(data.averageAfterStop2),
    averageAfterStop3: numOrNull(data.averageAfterStop3),
    finalAverage: numOrZero(data.finalAverage),
    minTime: numOrZero(data.minTime),
    maxTime: numOrZero(data.maxTime),
    spread: numOrZero(data.spread),
    count: typeof data.count === 'number' ? data.count : 1,
    mode: data.mode === 'cumulative' ? 'cumulative' : 'independent',
    createdAt: typeof data.recordedAt === 'number' ? data.recordedAt : Date.now(),
  };
}

export async function signInWithGoogleCloud(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutFromCloud(): Promise<void> {
  knownExistingCloudDocIds.clear();
  await signOut(auth);
}

export function subscribeToAuthChanges(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      knownExistingCloudDocIds.clear();
    }
    callback(user);
  });
}

export function subscribeToUserCloudSessions(
  uid: string,
  onSessionsUpdate: (records: MeasurementRecord[]) => void
): () => void {
  const path = 'sessions';
  const q = query(collection(db, path), where('ownerId', '==', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const records: MeasurementRecord[] = [];
      knownExistingCloudDocIds.clear();
      snapshot.forEach((docSnap) => {
        knownExistingCloudDocIds.add(docSnap.id);
        records.push(mapCloudDocToMeasurementRecord(docSnap.data() as Record<string, unknown>));
      });
      records.sort((a, b) => b.createdAt - a.createdAt);
      onSessionsUpdate(records);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function saveSessionToCloud(record: MeasurementRecord): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;

  const base = buildValidatedPayloadFields(record, user.uid);
  const docPath = `sessions/${base.id}`;
  const docRef = doc(db, 'sessions', base.id);

  try {
    if (knownExistingCloudDocIds.has(base.id)) {
      await updateDoc(docRef, {
        label: base.label,
        category: base.category,
        notes: base.notes,
        containerAmount: base.containerAmount,
        flowRatePerSec: base.flowRatePerSec,
        flowRatePerMin: base.flowRatePerMin,
        flowRatePerHour: base.flowRatePerHour,
        flowRatePer24Hours: base.flowRatePer24Hours,
        time1: base.time1,
        time2: base.time2,
        time3: base.time3,
        averageAfterStop1: base.averageAfterStop1,
        averageAfterStop2: base.averageAfterStop2,
        averageAfterStop3: base.averageAfterStop3,
        finalAverage: base.finalAverage,
        minTime: base.minTime,
        maxTime: base.maxTime,
        spread: base.spread,
        count: base.count,
        mode: base.mode,
        recordedAt: base.recordedAt,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(docRef, {
        ...base,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      knownExistingCloudDocIds.add(base.id);
    }
  } catch (error) {
    handleFirestoreError(
      error,
      knownExistingCloudDocIds.has(base.id) ? OperationType.UPDATE : OperationType.CREATE,
      docPath
    );
  }
}

export async function deleteSessionFromCloud(recordId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;

  const docId = buildCloudDocId(user.uid, recordId);
  const docPath = `sessions/${docId}`;
  try {
    await deleteDoc(doc(db, 'sessions', docId));
    knownExistingCloudDocIds.delete(docId);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

export async function clearAllUserSessionsFromCloud(records: MeasurementRecord[]): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;

  for (const r of records) {
    await deleteSessionFromCloud(r.id);
  }
}

export async function syncLocalAndCloudSessions(
  localRecords: MeasurementRecord[]
): Promise<MeasurementRecord[]> {
  const user = auth.currentUser;
  if (!user) return localRecords;

  const path = 'sessions';
  const q = query(collection(db, path), where('ownerId', '==', user.uid));

  let cloudRecords: MeasurementRecord[] = [];
  try {
    const snap = await getDocs(q);
    knownExistingCloudDocIds.clear();
    snap.forEach((docSnap) => {
      knownExistingCloudDocIds.add(docSnap.id);
      cloudRecords.push(mapCloudDocToMeasurementRecord(docSnap.data() as Record<string, unknown>));
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }

  const cloudByRecordId = new Map<string, MeasurementRecord>();
  for (const cr of cloudRecords) {
    cloudByRecordId.set(cr.id, cr);
  }

  // Upload any local sessions not yet present in the Cloud
  for (const localRec of localRecords) {
    if (!cloudByRecordId.has(localRec.id)) {
      await saveSessionToCloud(localRec);
      cloudByRecordId.set(localRec.id, localRec);
    }
  }

  return Array.from(cloudByRecordId.values()).sort((a, b) => b.createdAt - a.createdAt);
}
