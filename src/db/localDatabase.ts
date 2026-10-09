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

function getCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

const CRC32_TABLE = getCrc32Table();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZipArchive(files: Array<{ name: string; content: string }>): Blob {
  const encoder = new TextEncoder();
  const encodedFiles = files.map((f) => {
    const nameBytes = encoder.encode(f.name);
    const dataBytes = encoder.encode(f.content);
    const crc = crc32(dataBytes);
    return { nameBytes, dataBytes, crc };
  });

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of encodedFiles) {
    const localHeader = new Uint8Array(30 + file.nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true); // Local file header signature
    localView.setUint16(4, 20, true); // Version needed to extract
    localView.setUint16(6, 0x0800, true); // UTF-8 flag
    localView.setUint16(8, 0, true); // Compression method (0 = store)
    localView.setUint16(10, 0, true); // Mod time
    localView.setUint16(12, 0x21, true); // Mod date
    localView.setUint32(14, file.crc, true); // CRC-32
    localView.setUint32(18, file.dataBytes.length, true); // Compressed size
    localView.setUint32(22, file.dataBytes.length, true); // Uncompressed size
    localView.setUint16(26, file.nameBytes.length, true); // File name length
    localView.setUint16(28, 0, true); // Extra field length
    localHeader.set(file.nameBytes, 30);

    localParts.push(localHeader, file.dataBytes);

    const centralHeader = new Uint8Array(46 + file.nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true); // Central directory signature
    centralView.setUint16(4, 20, true); // Version made by
    centralView.setUint16(6, 20, true); // Version needed
    centralView.setUint16(8, 0x0800, true); // UTF-8 flag
    centralView.setUint16(10, 0, true); // Compression method (0 = store)
    centralView.setUint16(12, 0, true); // Mod time
    centralView.setUint16(14, 0x21, true); // Mod date
    centralView.setUint32(16, file.crc, true); // CRC-32
    centralView.setUint32(20, file.dataBytes.length, true); // Compressed size
    centralView.setUint32(24, file.dataBytes.length, true); // Uncompressed size
    centralView.setUint16(28, file.nameBytes.length, true); // File name length
    centralView.setUint16(30, 0, true); // Extra field length
    centralView.setUint16(32, 0, true); // File comment length
    centralView.setUint16(34, 0, true); // Disk number start
    centralView.setUint16(36, 0, true); // Internal file attributes
    centralView.setUint32(38, 0, true); // External file attributes
    centralView.setUint32(42, offset, true); // Relative offset of local header
    centralHeader.set(file.nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + file.dataBytes.length;
  }

  const centralDirSize = centralParts.reduce((acc, part) => acc + part.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true); // End of central directory signature
  eocdView.setUint16(4, 0, true); // Number of this disk
  eocdView.setUint16(6, 0, true); // Disk where central directory starts
  eocdView.setUint16(8, encodedFiles.length, true); // Total entries on this disk
  eocdView.setUint16(10, encodedFiles.length, true); // Total entries
  eocdView.setUint32(12, centralDirSize, true); // Size of central directory
  eocdView.setUint32(16, offset, true); // Offset of central directory
  eocdView.setUint16(20, 0, true); // Comment length

  return new Blob([...localParts, ...centralParts, eocd], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function getExcelColumnName(colIndex: number): string {
  let dividend = colIndex + 1;
  let columnName = '';
  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    columnName = String.fromCharCode(65 + modulo) + columnName;
    dividend = Math.floor((dividend - modulo) / 26);
  }
  return columnName;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function exportSessionsToExcelXLSX(records: MeasurementRecord[]): Blob {
  const headers = [
    { title: 'Data e Ora', width: 20 },
    { title: 'Nome Misura', width: 24 },
    { title: 'Categoria', width: 16 },
    { title: 'Litri Contenitore (l)', width: 18 },
    { title: 'Flusso (l/s)', width: 15 },
    { title: '60 Secondi (l/min)', width: 18 },
    { title: '60 Minuti (l/h)', width: 18 },
    { title: '24 Ore (l/24h)', width: 18 },
    { title: 'Misura 1 (s)', width: 14 },
    { title: 'Misura 2 (s)', width: 14 },
    { title: 'Misura 3 (s)', width: 14 },
    { title: 'Media Finale (s)', width: 16 },
    { title: 'Min (s)', width: 13 },
    { title: 'Max (s)', width: 13 },
    { title: 'Scarto (s)', width: 13 },
    { title: 'Note', width: 28 },
  ];

  const colsXml = headers
    .map(
      (h, idx) =>
        `<col min="${idx + 1}" max="${idx + 1}" width="${h.width}" customWidth="1"/>`
    )
    .join('');

  const headerCellsXml = headers
    .map((h, colIdx) => {
      const cellRef = `${getExcelColumnName(colIdx)}1`;
      return `<c r="${cellRef}" s="1" t="inlineStr"><is><t>${escapeXml(h.title)}</t></is></c>`;
    })
    .join('');

  const dataRowsXml = records
    .map((r, rowIdx) => {
      const excelRow = rowIdx + 2;
      const flowSec = r.flowRatePerSec ?? null;
      const flowMin = r.flowRatePerMin ?? (flowSec !== null ? flowSec * 60 : null);
      const flowHour = r.flowRatePerHour ?? (flowSec !== null ? flowSec * 3600 : null);
      const flow24h = r.flowRatePer24Hours ?? (flowSec !== null ? flowSec * 86400 : null);

      const dateFormatted = new Date(r.createdAt).toLocaleString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      const cells: Array<{ val: string | number | null; style: number; isNum?: boolean }> = [
        { val: dateFormatted, style: 2 },
        { val: r.label || '', style: 2 },
        { val: r.category || '', style: 2 },
        { val: r.containerAmount ?? null, style: 3, isNum: true },
        { val: flowSec !== null ? Number(flowSec.toFixed(3)) : null, style: 4, isNum: true },
        { val: flowMin !== null ? Number(flowMin.toFixed(2)) : null, style: 3, isNum: true },
        { val: flowHour !== null ? Number(flowHour.toFixed(2)) : null, style: 3, isNum: true },
        { val: flow24h !== null ? Number(flow24h.toFixed(2)) : null, style: 3, isNum: true },
        { val: Number((r.time1 / 1000).toFixed(3)), style: 4, isNum: true },
        { val: Number((r.time2 / 1000).toFixed(3)), style: 4, isNum: true },
        { val: Number((r.time3 / 1000).toFixed(3)), style: 4, isNum: true },
        { val: Number((r.finalAverage / 1000).toFixed(3)), style: 4, isNum: true },
        { val: Number((r.minTime / 1000).toFixed(3)), style: 4, isNum: true },
        { val: Number((r.maxTime / 1000).toFixed(3)), style: 4, isNum: true },
        { val: Number((r.spread / 1000).toFixed(3)), style: 4, isNum: true },
        { val: r.notes || '', style: 2 },
      ];

      const rowCellsXml = cells
        .map((c, colIdx) => {
          const cellRef = `${getExcelColumnName(colIdx)}${excelRow}`;
          if (c.val === null || c.val === undefined || c.val === '') {
            return `<c r="${cellRef}" s="${c.style}"/>`;
          }
          if (c.isNum && typeof c.val === 'number' && Number.isFinite(c.val)) {
            return `<c r="${cellRef}" s="${c.style}" t="n"><v>${c.val}</v></c>`;
          }
          return `<c r="${cellRef}" s="${c.style}" t="inlineStr"><is><t>${escapeXml(String(c.val))}</t></is></c>`;
        })
        .join('');

      return `<row r="${excelRow}" ht="20" customHeight="1">${rowCellsXml}</row>`;
    })
    .join('');

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Storico Misure" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2">
    <numFmt numFmtId="164" formatCode="0.00"/>
    <numFmt numFmtId="165" formatCode="0.000"/>
  </numFmts>
  <fonts count="2">
    <font>
      <sz val="11"/>
      <color rgb="FF0F172A"/>
      <name val="Calibri"/>
    </font>
    <font>
      <b/>
      <sz val="11"/>
      <color rgb="FFFFFFFF"/>
      <name val="Calibri"/>
    </font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill>
      <patternFill patternType="solid">
        <fgColor rgb="FF1E293B"/>
        <bgColor indexed="64"/>
      </patternFill>
    </fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="5">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center"/>
    </xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
  </cellXfs>
</styleSheet>`;

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>${colsXml}</cols>
  <sheetData>
    <row r="1" ht="24" customHeight="1">${headerCellsXml}</row>
    ${dataRowsXml}
  </sheetData>
</worksheet>`;

  return createZipArchive([
    { name: '[Content_Types].xml', content: contentTypesXml },
    { name: '_rels/.rels', content: relsXml },
    { name: 'xl/workbook.xml', content: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRelsXml },
    { name: 'xl/styles.xml', content: stylesXml },
    { name: 'xl/worksheets/sheet1.xml', content: sheetXml },
  ]);
}
