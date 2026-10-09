import { MeasurementRecord } from '../types/measurement';

const DB_NAME = 'CronoTriLocalDB';
const DB_VERSION = 1;
const STORE_NAME = 'measurement_sessions';
const STORAGE_BACKUP_KEY = 'cronotri_sessions_backup_v1';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB non supportato in questo ambiente'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('category', 'category', { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Errore apertura IndexedDB'));
    };
  });
}

function readBackupFromLocalStorage(): MeasurementRecord[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_BACKUP_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeBackupToLocalStorage(records: MeasurementRecord[]): void {
  try {
    window.localStorage.setItem(STORAGE_BACKUP_KEY, JSON.stringify(records));
  } catch {
    // Ignore storage quota errors
  }
}

export async function getAllSessions(): Promise<MeasurementRecord[]> {
  try {
    const db = await openDatabase();
    return await new Promise<MeasurementRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const results = (req.result as MeasurementRecord[]) || [];
        results.sort((a, b) => b.createdAt - a.createdAt);
        writeBackupToLocalStorage(results);
        resolve(results);
      };

      req.onerror = () => {
        reject(req.error);
      };
    });
  } catch {
    const fallback = readBackupFromLocalStorage();
    return fallback.sort((a, b) => b.createdAt - a.createdAt);
  }
}

export async function saveSessionToDB(record: MeasurementRecord): Promise<MeasurementRecord[]> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const current = readBackupFromLocalStorage().filter((r) => r.id !== record.id);
    writeBackupToLocalStorage([record, ...current]);
  }
  return getAllSessions();
}

export async function deleteSessionFromDB(id: string): Promise<MeasurementRecord[]> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const current = readBackupFromLocalStorage().filter((r) => r.id !== id);
    writeBackupToLocalStorage(current);
  }
  return getAllSessions();
}

export async function clearAllSessionsFromDB(): Promise<MeasurementRecord[]> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fallback
  }
  writeBackupToLocalStorage([]);
  return [];
}

export async function importSessionsToDB(records: MeasurementRecord[]): Promise<MeasurementRecord[]> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const item of records) {
        if (item && item.id && typeof item.finalAverage === 'number') {
          store.put(item);
        }
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const existing = readBackupFromLocalStorage();
    const map = new Map<string, MeasurementRecord>();
    existing.forEach((r) => map.set(r.id, r));
    records.forEach((r) => {
      if (r && r.id) map.set(r.id, r);
    });
    writeBackupToLocalStorage(Array.from(map.values()));
  }
  return getAllSessions();
}

export function exportSessionsToCSV(records: MeasurementRecord[]): string {
  const headers = [
    'ID',
    'Data_Ora',
    'Nome_Misura',
    'Categoria',
    'Litri_Contenitore',
    'Flusso_l_s',
    'Flusso_60_Secondi_l',
    'Flusso_60_Minuti_l',
    'Flusso_24_Ore_l',
    'Misura_1_ms',
    'Misura_2_ms',
    'Misura_3_ms',
    'Media_Stop_1_ms',
    'Media_Stop_2_ms',
    'Media_Stop_3_ms',
    'Media_Finale_ms',
    'Media_Finale_Secondi',
    'Min_ms',
    'Max_ms',
    'Scarto_ms',
    'Modalita',
    'Note',
  ];

  const escapeCsv = (val: string | number | null | undefined) => {
    if (val === null || val === undefined) return '';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = records.map((r) => {
    const flowSec = r.flowRatePerSec ?? null;
    const flowMin = r.flowRatePerMin ?? (flowSec !== null ? flowSec * 60 : null);
    const flowHour = r.flowRatePerHour ?? (flowSec !== null ? flowSec * 3600 : null);
    const flow24h = r.flowRatePer24Hours ?? (flowSec !== null ? flowSec * 86400 : null);

    return [
      escapeCsv(r.id),
      escapeCsv(new Date(r.createdAt).toISOString()),
      escapeCsv(r.label),
      escapeCsv(r.category),
      escapeCsv(r.containerAmount ?? ''),
      escapeCsv(flowSec !== null ? flowSec.toFixed(3) : ''),
      escapeCsv(flowMin !== null ? flowMin.toFixed(2) : ''),
      escapeCsv(flowHour !== null ? flowHour.toFixed(2) : ''),
      escapeCsv(flow24h !== null ? flow24h.toFixed(2) : ''),
      escapeCsv(r.time1),
      escapeCsv(r.time2),
      escapeCsv(r.time3),
      escapeCsv(r.averageAfterStop1),
      escapeCsv(r.averageAfterStop2),
      escapeCsv(r.averageAfterStop3),
      escapeCsv(r.finalAverage),
      escapeCsv((r.finalAverage / 1000).toFixed(3)),
      escapeCsv(r.minTime),
      escapeCsv(r.maxTime),
      escapeCsv(r.spread),
      escapeCsv(r.mode),
      escapeCsv(r.notes),
    ];
  });

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}
