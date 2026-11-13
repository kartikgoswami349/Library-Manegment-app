import { Buffer } from 'buffer';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';
import {
  strToU8,
  strFromU8,
  unzipSync,
  Zip,
  ZipDeflate,
  ZipPassThrough,
  zip,
  type AsyncZippable,
} from 'fflate';

import { saveBackupFile } from './backup-export';
import {
  DATABASE_SCHEMA_VERSION,
  applyRemoteSyncEvents,
  getLocalDatabase,
  getLocalDeviceId,
  runLocalDatabaseExclusive,
  type SyncEvent,
} from './local-database';
import { isTransferVersionAuthoritative } from './lan-transfer-version';

const PACKAGE_FORMAT = 'ashram-library-package';
const PACKAGE_VERSION = 1;
const ZIP_CHUNK_SIZE = 256 * 1024;
let cachedTransferCover: {
  path: string;
  bytes: Uint8Array;
  sha256: string;
  mimeType: string;
} | null = null;

type CoverEntry = {
  book_id: string;
  path: string;
  sha256: string;
  mime_type: string;
};

type LibraryManifest = {
  format: typeof PACKAGE_FORMAT;
  formatVersion: number;
  createdAt: string;
  deviceId: string;
  databaseVersion: number;
  bookCount: number;
  memberCount: number;
  transactionCount: number;
  coverCount: number;
  backupType: 'full';
  covers: CoverEntry[];
};

type PackageFiles = Record<string, Uint8Array>;

export type TransferHistoryEntry = {
  id: string;
  action: 'backup' | 'restore' | 'merge' | 'send' | 'receive';
  created_at: string;
  books: number;
  members: number;
  transactions: number;
  covers: number;
  result: 'completed';
};

export type LanTransferManifest = {
  device_id: string;
  records: {
    entity: SyncEvent['entity'];
    entity_id: string;
    changed_at: string;
    device_id: string;
    sha256: string;
  }[];
  covers: {
    book_id: string;
    sha256: string;
    mime_type: string;
    byte_length: number;
  }[];
};

export const MAX_LAN_TRANSFER_BYTES = 128 * 1024 * 1024;

export type LanTransferPlan = {
  events: SyncEvent[];
  covers: {
    book_id: string;
    sha256: string | null;
    mime_type: string | null;
    bytes: Uint8Array | null;
  }[];
  counts: {
    books: number;
    members: number;
    transactions: number;
    covers: number;
  };
  estimatedBytes: number;
};

export function getLanTransferFingerprint(
  plan: Pick<LanTransferPlan, 'events' | 'covers'>
): string {
  const content = {
    events: plan.events.map((event) => event.id),
    covers: plan.covers.map((cover) => [
      cover.book_id,
      cover.sha256,
      cover.bytes?.length ?? 0,
    ]),
  };
  return bytesToHex(sha256(strToU8(JSON.stringify(content))));
}

function getDesktopApi() {
  if (typeof window === 'undefined' || !window.libraryDesktop?.isElectron) {
    return null;
  }
  return window.libraryDesktop;
}

function fileNameTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function mimeTypeForPath(path: string): string {
  const extension = path.split('?')[0].split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  return 'image/jpeg';
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return 'jpg';
}

function dataUriToBytes(uri: string): Uint8Array | null {
  const match = uri.match(/^data:([^;,]+);base64,(.*)$/s);
  return match ? new Uint8Array(Buffer.from(match[2], 'base64')) : null;
}

async function readBytes(uri: string): Promise<Uint8Array> {
  const dataUriBytes = dataUriToBytes(uri);
  if (dataUriBytes) return dataUriBytes;

  const desktop = getDesktopApi();
  if (desktop && (uri.startsWith('file://') || /^[A-Za-z]:[\\/]/.test(uri))) {
    const file = await desktop.readFile(uri.replace(/^file:\/\//, ''));
    return new Uint8Array(Buffer.from(file.data, 'base64'));
  }

  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Unable to read cover image (${response.status}).`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  return new Uint8Array(
    Buffer.from(
      await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      }),
      'base64'
    )
  );
}

async function serializeDatabase(): Promise<Uint8Array> {
  const database = await getLocalDatabase({ seedCatalog: false });
  return runLocalDatabaseExclusive(async () =>
    new Uint8Array(await database.serializeAsync('main'))
  );
}

type OpenedPackageDatabase = {
  database: SQLite.SQLiteDatabase;
  close: () => Promise<void>;
};

function normalizeDatabaseImageForWeb(bytes: Uint8Array): Uint8Array {
  const sqliteHeader = 'SQLite format 3\0';
  if (
    bytes.length < 100 ||
    strFromU8(bytes.subarray(0, sqliteHeader.length)) !== sqliteHeader
  ) {
    throw new Error('The Library package does not contain a valid SQLite database image.');
  }

  if (bytes[18] !== 2 || bytes[19] !== 2) {
    return bytes;
  }

  // A standalone mobile snapshot has no WAL sidecar; make its header suitable for the web in-memory VFS.
  const normalized = new Uint8Array(bytes);
  normalized[18] = 1;
  normalized[19] = 1;
  return normalized;
}

async function openPackageDatabase(
  bytes: Uint8Array,
  namePrefix: string
): Promise<OpenedPackageDatabase> {
  if (Platform.OS === 'web') {
    const databaseImage = normalizeDatabaseImageForWeb(bytes);
    const database = await SQLite.deserializeDatabaseAsync(databaseImage, {
      useNewConnection: true,
    });
    return {
      database,
      close: () => database.closeAsync(),
    };
  }

  const cacheUri = FileSystem.cacheDirectory;
  if (!cacheUri?.startsWith('file://')) {
    throw new Error('The device cache directory is unavailable for package validation.');
  }
  const directory = decodeURIComponent(cacheUri.slice('file://'.length)).replace(/[/\\]+$/, '');
  const fileName = `${namePrefix}-${fileNameTimestamp()}.db`;
  const fileUri = `${cacheUri}${fileName}`;
  try {
    await FileSystem.writeAsStringAsync(fileUri, Buffer.from(bytes).toString('base64'), {
      encoding: FileSystem.EncodingType.Base64,
    });
    const database = await SQLite.openDatabaseAsync(
      fileName,
      { useNewConnection: true },
      directory
    );
    return {
      database,
      close: async () => {
        try {
          await database.closeAsync();
        } finally {
          await SQLite.deleteDatabaseAsync(fileName, directory);
        }
      },
    };
  } catch (error) {
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
    throw error;
  }
}

async function validateOpenedDatabase(
  database: SQLite.SQLiteDatabase
): Promise<void> {
  const check = await database.getFirstAsync<{ quick_check: string }>(
    'PRAGMA quick_check'
  );
  const version = await database.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  if (check?.quick_check !== 'ok') {
    throw new Error(
      `The Library database failed SQLite integrity validation: ${check?.quick_check ?? 'SQLite returned no result'}.`
    );
  }
  if (version?.user_version !== DATABASE_SCHEMA_VERSION) {
    throw new Error(
      `The Library database schema version ${version?.user_version ?? 'unknown'} does not match the supported version ${DATABASE_SCHEMA_VERSION}.`
    );
  }
  for (const table of [
    'books',
    'profiles',
    'borrowings',
    'sync_events',
    'sync_peers',
    'sync_conflicts',
    'sync_metadata',
  ]) {
    const row = await database.getFirstAsync<{ name: string }>(
      'SELECT name FROM sqlite_master WHERE type = ? AND name = ?',
      'table',
      table
    );
    if (!row) {
      throw new Error(`The Library database is missing ${table}.`);
    }
  }
}

async function collectPackageFiles(
  databaseBytes: Uint8Array,
  onProgress?: (message: string) => void
): Promise<{
  files: PackageFiles;
  manifest: LibraryManifest;
}> {
  const opened = await openPackageDatabase(databaseBytes, 'library-package-validation');
  try {
    const { database } = opened;
    await validateOpenedDatabase(database);
    const counts = await database.getFirstAsync<{
      books: number;
      members: number;
      transactions: number;
    }>(
      `SELECT
        (SELECT COUNT(*) FROM books) AS books,
        (SELECT COUNT(*) FROM profiles) AS members,
        (SELECT COUNT(*) FROM borrowings) AS transactions`
    );
    const rows = await database.getAllAsync<{
      id: string;
      cover_path: string | null;
    }>('SELECT id, cover_path FROM books WHERE cover_path IS NOT NULL');
    const covers: CoverEntry[] = [];
    const files: PackageFiles = { 'library.db': databaseBytes };
    const checksums: Record<string, string> = {
      'library.db': bytesToHex(sha256(databaseBytes)),
    };

    onProgress?.(`Reading ${rows.length.toLocaleString()} book covers…`);
    let coversRead = 0;
    for (const row of rows) {
      if (!row.cover_path) continue;
      let bytes: Uint8Array;
      try {
        bytes = await readBytes(row.cover_path);
      } catch (error) {
        throw new Error(
          `The cover for book ${row.id} could not be included: ${
            error instanceof Error ? error.message : 'unreadable file'
          }`
        );
      }
      const mimeType = mimeTypeForPath(row.cover_path);
      const path = `covers/${row.id}.${extensionForMimeType(mimeType)}`;
      const checksum = bytesToHex(sha256(bytes));
      files[path] = bytes;
      checksums[path] = checksum;
      covers.push({
        book_id: row.id,
        path,
        sha256: checksum,
        mime_type: mimeType,
      });
      coversRead += 1;
      if (coversRead % 25 === 0 || coversRead === rows.length) {
        onProgress?.(
          `Reading book covers (${coversRead.toLocaleString()} of ${rows.length.toLocaleString()})…`
        );
      }
    }

    const manifest: LibraryManifest = {
      format: PACKAGE_FORMAT,
      formatVersion: PACKAGE_VERSION,
      createdAt: new Date().toISOString(),
      deviceId: await getLocalDeviceId(),
      databaseVersion: DATABASE_SCHEMA_VERSION,
      bookCount: counts?.books ?? 0,
      memberCount: counts?.members ?? 0,
      transactionCount: counts?.transactions ?? 0,
      coverCount: covers.length,
      backupType: 'full',
      covers,
    };
    files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
    checksums['manifest.json'] = bytesToHex(sha256(files['manifest.json']));
    files['checksums.json'] = strToU8(JSON.stringify(checksums, null, 2));
    return { files, manifest };
  } finally {
    await opened.close();
  }
}

async function recordTransferHistory(
  entry: Omit<TransferHistoryEntry, 'id' | 'created_at' | 'result'>
): Promise<void> {
  const database = await getLocalDatabase({ seedCatalog: false });
  const existing = await database.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_metadata WHERE key = ?',
    'transfer_history'
  );
  let history: TransferHistoryEntry[] = [];
  if (existing?.value) {
    try {
      const parsed = JSON.parse(existing.value) as unknown;
      if (Array.isArray(parsed)) {
        history = parsed.filter(
          (item): item is TransferHistoryEntry =>
            Boolean(item) &&
            typeof item === 'object' &&
            typeof (item as TransferHistoryEntry).id === 'string'
        );
      }
    } catch {
      history = [];
    }
  }
  history.unshift({
    ...entry,
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    created_at: new Date().toISOString(),
    result: 'completed',
  });
  await database.runAsync(
    'INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)',
    'transfer_history',
    JSON.stringify(history.slice(0, 5))
  );
}

export async function recordLanTransferSent(counts: {
  books: number;
  members: number;
  transactions: number;
  covers: number;
}): Promise<void> {
  await recordTransferHistory({ action: 'send', ...counts });
}

export async function getTransferHistory(): Promise<TransferHistoryEntry[]> {
  const database = await getLocalDatabase({ seedCatalog: false });
  const row = await database.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_metadata WHERE key = ?',
    'transfer_history'
  );
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value) as unknown;
    return Array.isArray(parsed) ? (parsed as TransferHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

async function savePackage(bytes: Uint8Array, fileName: string): Promise<boolean> {
  return saveBackupFile({
    bytes,
    fileName,
    mimeType: 'application/zip',
    filterName: 'Library package',
    extensions: ['library', 'zip'],
  });
}

function zipPackageOnDevice(
  files: PackageFiles,
  onProgress?: (message: string) => void
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let settled = false;
    const archive = new Zip((error, chunk, final) => {
      if (error) {
        settled = true;
        archive.terminate();
        reject(error);
        return;
      }
      chunks.push(chunk);
      if (!final) return;

      try {
        const totalBytes = chunks.reduce((total, item) => total + item.length, 0);
        const output = new Uint8Array(totalBytes);
        let offset = 0;
        for (const item of chunks) {
          output.set(item, offset);
          offset += item.length;
        }
        settled = true;
        resolve(output);
      } catch (error) {
        settled = true;
        archive.terminate();
        reject(error);
      }
    });

    void (async () => {
      const entries = Object.entries(files);
      for (let index = 0; index < entries.length; index += 1) {
        const [path, bytes] = entries[index];
        onProgress?.(
          `Compressing package (${(index + 1).toLocaleString()} of ${entries.length.toLocaleString()} files)…`
        );
        const file = path.startsWith('covers/')
          ? new ZipPassThrough(path)
          : new ZipDeflate(path, { level: 1 });
        archive.add(file);

        if (bytes.length === 0) {
          file.push(bytes, true);
          await new Promise<void>((resume) => setTimeout(resume, 0));
          continue;
        }

        for (let offset = 0; offset < bytes.length; offset += ZIP_CHUNK_SIZE) {
          const end = Math.min(offset + ZIP_CHUNK_SIZE, bytes.length);
          file.push(bytes.subarray(offset, end), end === bytes.length);
          await new Promise<void>((resume) => setTimeout(resume, 0));
        }
      }
      archive.end();
    })().catch((error: unknown) => {
      if (settled) return;
      settled = true;
      archive.terminate();
      reject(error);
    });
  });
}

function zipPackage(
  files: PackageFiles,
  onProgress?: (message: string) => void
): Promise<Uint8Array> {
  if (Platform.OS !== 'web') {
    return zipPackageOnDevice(files, onProgress);
  }

  const zipFiles: AsyncZippable = {};
  for (const [path, bytes] of Object.entries(files)) {
    zipFiles[path] = path.startsWith('covers/')
      ? [bytes, { level: 0 }]
      : bytes;
  }
  return new Promise((resolve, reject) => {
    zip(zipFiles, { level: 1 }, (error, bytes) => {
      if (error) {
        reject(error);
      } else {
        resolve(bytes);
      }
    });
  });
}

export async function createPortableLibraryPackageBytes(
  onProgress?: (message: string) => void
): Promise<{
  bytes: Uint8Array;
  manifest: LibraryManifest;
}> {
  onProgress?.('Preparing Library database…');
  const databaseBytes = await serializeDatabase();
  const { files, manifest } = await collectPackageFiles(databaseBytes, onProgress);
  onProgress?.('Compressing backup package…');
  const bytes = await zipPackage(files, onProgress);
  return { bytes, manifest };
}

export async function exportPortableLibraryBackup(
  onProgress?: (message: string) => void
): Promise<boolean> {
  const { bytes: packageBytes, manifest } =
    await createPortableLibraryPackageBytes(onProgress);
  onProgress?.('Opening sharing options…');
  const saved = await savePackage(
    packageBytes,
    `Ashram-Library-Backup-${fileNameTimestamp()}.library`
  );
  if (saved) {
    await recordTransferHistory({
      action: 'backup',
      books: manifest.bookCount,
      members: manifest.memberCount,
      transactions: manifest.transactionCount,
      covers: manifest.coverCount,
    });
  }
  return saved;
}

async function readSelectedPackage(): Promise<Uint8Array | null> {
  const desktop = getDesktopApi();
  if (Platform.OS === 'web' && desktop) {
    const selected = await desktop.chooseFile({
      filters: [{ name: 'Library package', extensions: ['library', 'zip'] }],
    });
    if (!selected) return null;
    const file = await desktop.readFile(selected);
    return new Uint8Array(Buffer.from(file.data, 'base64'));
  }
  const selection = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (selection.canceled) return null;
  const asset = selection.assets[0];
  if (!asset || !/(\.library|\.zip)$/i.test(asset.name)) {
    throw new Error('Choose an Ashram Library backup ending in .library.');
  }
  return asset.base64
    ? new Uint8Array(Buffer.from(asset.base64, 'base64'))
    : new Uint8Array(
        Buffer.from(
          await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          }),
          'base64'
        )
      );
}

function parsePackage(bytes: Uint8Array): {
  files: PackageFiles;
  manifest: LibraryManifest;
} {
  let files: PackageFiles;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('The selected file is not a readable Library package.');
  }
  const manifestBytes = files['manifest.json'];
  const checksumsBytes = files['checksums.json'];
  const databaseBytes = files['library.db'];
  if (!manifestBytes || !checksumsBytes || !databaseBytes) {
    throw new Error('The Library package is missing required files.');
  }
  let manifest: LibraryManifest;
  let checksums: Record<string, string>;
  try {
    manifest = JSON.parse(strFromU8(manifestBytes)) as LibraryManifest;
    checksums = JSON.parse(strFromU8(checksumsBytes)) as Record<string, string>;
  } catch {
    throw new Error('The Library package metadata is invalid.');
  }
  if (
    manifest.format !== PACKAGE_FORMAT ||
    manifest.formatVersion !== PACKAGE_VERSION ||
    manifest.databaseVersion !== DATABASE_SCHEMA_VERSION ||
    manifest.backupType !== 'full' ||
    typeof manifest.deviceId !== 'string' ||
    typeof manifest.createdAt !== 'string' ||
    !Number.isInteger(manifest.bookCount) ||
    !Number.isInteger(manifest.memberCount) ||
    !Number.isInteger(manifest.transactionCount) ||
    !Number.isInteger(manifest.coverCount) ||
    !Array.isArray(manifest.covers) ||
    manifest.coverCount !== manifest.covers.length
  ) {
    throw new Error('This Library package version is not supported by this app.');
  }
  const requiredChecksumPaths = ['library.db', 'manifest.json'];
  const coverIds = new Set<string>();
  const coverPaths = new Set<string>();
  for (const cover of manifest.covers) {
    if (
      !cover ||
      typeof cover.book_id !== 'string' ||
      typeof cover.path !== 'string' ||
      !/^covers\/[A-Za-z0-9._-]+\.(jpg|png|webp|gif)$/i.test(cover.path) ||
      typeof cover.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(cover.sha256) ||
      !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(cover.mime_type)
    ) {
      throw new Error('The Library package contains invalid cover metadata.');
    }
    if (coverIds.has(cover.book_id) || coverPaths.has(cover.path)) {
      throw new Error('The Library package contains duplicate cover entries.');
    }
    coverIds.add(cover.book_id);
    coverPaths.add(cover.path);
    requiredChecksumPaths.push(cover.path);
  }
  const packagePaths = Object.keys(files).filter((path) => path !== 'checksums.json');
  if (
    !checksums ||
    typeof checksums !== 'object' ||
    requiredChecksumPaths.some((path) => typeof checksums[path] !== 'string') ||
    packagePaths.length !== Object.keys(checksums).length ||
    packagePaths.some((path) => typeof checksums[path] !== 'string') ||
    Object.keys(checksums).some((path) => !files[path])
  ) {
    throw new Error('The Library package is missing required checksums.');
  }
  for (const path of Object.keys(files)) {
    if (path.startsWith('/') || path.includes('\\') || path.split('/').includes('..')) {
      throw new Error('The Library package contains an unsafe file path.');
    }
  }
  for (const [path, expected] of Object.entries(checksums)) {
    const actual =
      typeof expected === 'string' && files[path]
        ? bytesToHex(sha256(files[path]))
        : '';
    if (!actual || actual !== expected) {
      throw new Error(`The Library package checksum failed for ${path}.`);
    }
  }
  for (const cover of manifest.covers) {
    if (!files[cover.path]) {
      throw new Error(`The Library package is missing cover ${cover.book_id}.`);
    }
    if (bytesToHex(sha256(files[cover.path])) !== cover.sha256) {
      throw new Error(`The cover checksum failed for book ${cover.book_id}.`);
    }
  }
  return { files, manifest };
}

async function validateDatabaseBytes(
  bytes: Uint8Array
): Promise<OpenedPackageDatabase & {
  counts: { books: number; members: number; transactions: number };
}> {
  const opened = await openPackageDatabase(bytes, 'library-import-validation');
  try {
    await validateOpenedDatabase(opened.database);
    const [books, members, transactions] = await Promise.all([
      opened.database.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM books'),
      opened.database.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM profiles'),
      opened.database.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM borrowings'),
    ]);
    return {
      ...opened,
      counts: {
        books: books?.count ?? 0,
        members: members?.count ?? 0,
        transactions: transactions?.count ?? 0,
      },
    };
  } catch (error) {
    await opened.close();
    throw error;
  }
}

async function coverUri(bytes: Uint8Array, mimeType: string): Promise<string> {
  if (Platform.OS === 'web' || getDesktopApi()) {
    return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
  }
  const directory = FileSystem.documentDirectory;
  if (!directory) throw new Error('The device document directory is unavailable.');
  const coversDirectory = `${directory}library-covers/`;
  await FileSystem.makeDirectoryAsync(coversDirectory, { intermediates: true });
  const fileName = `${bytesToHex(sha256(bytes)).slice(0, 32)}.${extensionForMimeType(mimeType)}`;
  const uri = `${coversDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, Buffer.from(bytes).toString('base64'), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
}

async function restoreDatabaseBytes(
  bytes: Uint8Array,
  preserveSyncState = false
): Promise<void> {
  const imported = await openPackageDatabase(bytes, 'library-restore');
  const database = await getLocalDatabase({ seedCatalog: false });
  const deviceId = await getLocalDeviceId();
  try {
    await runLocalDatabaseExclusive(async () => {
      await SQLite.backupDatabaseAsync({
        sourceDatabase: imported.database,
        sourceDatabaseName: 'main',
        destDatabase: database,
        destDatabaseName: 'main',
      });
      if (!preserveSyncState) {
        await database.runAsync(
          `INSERT OR REPLACE INTO sync_metadata (key, value) VALUES ('device_id', ?)`,
          deviceId
        );
        await database.runAsync('DELETE FROM sync_peers');
        await database.runAsync('DELETE FROM sync_peer_events');
        await database.runAsync('UPDATE sync_events SET synced_at = NULL');
      }
    });
  } finally {
    await imported.close();
  }
}

async function getPackageMergeEvents(
  database: SQLite.SQLiteDatabase
): Promise<SyncEvent[]> {
  const events = await database.getAllAsync<SyncEvent>(
    `SELECT id, entity, entity_id, payload, changed_at, device_id
     FROM sync_events ORDER BY changed_at, device_id, id`
  );
  const entities: SyncEvent['entity'][] = ['books', 'profiles', 'borrowings'];

  for (const entity of entities) {
    const records = await database.getAllAsync<
      Record<string, unknown> & {
        id: string;
        sync_changed_at: string;
        sync_device_id: string;
      }
    >(`SELECT * FROM ${entity}`);
    for (const record of records) {
      const { sync_changed_at: changedAt, sync_device_id: deviceId, ...payload } = record;
      if (!changedAt || !deviceId) {
        throw new Error(`The package contains an invalid ${entity} record.`);
      }
      const snapshotKey = JSON.stringify([
        entity,
        record.id,
        changedAt,
        deviceId,
        payload,
      ]);
      events.push({
        id: `package-snapshot-${bytesToHex(sha256(strToU8(snapshotKey)))}`,
        entity,
        entity_id: record.id,
        payload: JSON.stringify(payload),
        changed_at: changedAt,
        device_id: deviceId,
      });
    }
  }

  return events;
}

type TransferSnapshot = {
  manifest: LanTransferManifest;
  events: SyncEvent[];
  bookVersions: Map<string, { changed_at: string; device_id: string }>;
  localCovers: Map<string, { path: string; sha256: string; mime_type: string; byte_length: number }>;
};

function isIncomingVersionNewer(
  changedAt: string,
  deviceId: string,
  current?: { changed_at: string; device_id: string }
): boolean {
  if (!current) return true;
  const incomingTime = Date.parse(changedAt);
  const currentTime = Date.parse(current.changed_at);
  return incomingTime > currentTime ||
    (incomingTime === currentTime && deviceId > current.device_id);
}

async function getLocalTransferSnapshot(): Promise<TransferSnapshot> {
  const database = await getLocalDatabase({ seedCatalog: false });
  const deviceId = await getLocalDeviceId();
  const entities: SyncEvent['entity'][] = ['books', 'profiles', 'borrowings'];
  const records: LanTransferManifest['records'] = [];
  const events: SyncEvent[] = [];
  const bookVersions = new Map<string, { changed_at: string; device_id: string }>();

  for (const entity of entities) {
    const rows = await database.getAllAsync<
      Record<string, unknown> & {
        id: string;
        sync_changed_at: string;
        sync_device_id: string;
      }
    >(`SELECT * FROM ${entity}`);
    for (const row of rows) {
      if (!row.id || !row.sync_changed_at || !row.sync_device_id) {
        throw new Error(`The local ${entity} table contains an invalid sync record.`);
      }
      const { sync_changed_at: changedAt, sync_device_id: sourceDevice, ...rest } = row;
      const payload = { ...rest };
      delete payload.sync_conflicted;
      if (entity === 'books') {
        payload.cover_path = null;
        bookVersions.set(row.id, { changed_at: changedAt, device_id: sourceDevice });
      }
      const signature = JSON.stringify([entity, row.id, changedAt, sourceDevice, payload]);
      const hash = bytesToHex(sha256(strToU8(signature)));
      const event: SyncEvent = {
        id: `snapshot-${hash}`,
        entity,
        entity_id: row.id,
        payload: JSON.stringify(payload),
        changed_at: changedAt,
        device_id: sourceDevice || deviceId,
      };
      records.push({
        entity,
        entity_id: row.id,
        changed_at: changedAt,
        device_id: sourceDevice || deviceId,
        sha256: hash,
      });
      events.push(event);
    }
  }

  const books = await database.getAllAsync<{ id: string; cover_path: string | null }>(
    'SELECT id, cover_path FROM books'
  );
  const localCovers = new Map<
    string,
    { path: string; sha256: string; mime_type: string; byte_length: number }
  >();
  const covers: LanTransferManifest['covers'] = [];
  for (const book of books) {
    if (!book.cover_path) continue;
    const bytes = await readBytes(book.cover_path);
    const mimeType = mimeTypeForPath(book.cover_path);
    const entry = {
      book_id: book.id,
      sha256: bytesToHex(sha256(bytes)),
      mime_type: mimeType,
      byte_length: bytes.length,
    };
    localCovers.set(book.id, { path: book.cover_path, ...entry });
    covers.push(entry);
  }
  return {
    manifest: { device_id: deviceId, records, covers },
    events,
    bookVersions,
    localCovers,
  };
}

export function validateLanTransferManifest(value: LanTransferManifest): void {
  if (
    !value ||
    typeof value.device_id !== 'string' ||
    !Array.isArray(value.records) ||
    value.records.length > 100_000 ||
    !Array.isArray(value.covers) ||
    value.covers.length > 20_000
  ) {
    throw new Error('The paired device returned an invalid library comparison.');
  }
  for (const record of value.records) {
    if (
      !record ||
      !['books', 'profiles', 'borrowings'].includes(record.entity) ||
      typeof record.entity_id !== 'string' ||
      !record.entity_id ||
      typeof record.changed_at !== 'string' ||
      !Number.isFinite(Date.parse(record.changed_at)) ||
      typeof record.device_id !== 'string' ||
      typeof record.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(record.sha256)
    ) {
      throw new Error('The paired device returned invalid record comparison data.');
    }
  }
  for (const cover of value.covers) {
    if (
      !cover ||
      typeof cover.book_id !== 'string' ||
      typeof cover.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(cover.sha256) ||
      !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(cover.mime_type) ||
      !Number.isSafeInteger(cover.byte_length) ||
      cover.byte_length < 0 ||
      cover.byte_length > 32 * 1024 * 1024
    ) {
      throw new Error('The paired device returned invalid cover comparison data.');
    }
  }
}

export async function getLanTransferManifest(): Promise<LanTransferManifest> {
  return (await getLocalTransferSnapshot()).manifest;
}

export async function getLanTransferPlan(
  remoteManifest: LanTransferManifest
): Promise<LanTransferPlan> {
  validateLanTransferManifest(remoteManifest);
  const local = await getLocalTransferSnapshot();
  const remoteRecords = new Map(
    remoteManifest.records.map((record) => [`${record.entity}:${record.entity_id}`, record])
  );
  const eventsByKey = new Map(
    local.events.map((event) => [`${event.entity}:${event.entity_id}`, event])
  );
  const events: SyncEvent[] = [];
  const counts = { books: 0, members: 0, transactions: 0, covers: 0 };
  let estimatedBytes = 0;
  const entityCountKey: Record<SyncEvent['entity'], keyof typeof counts> = {
    books: 'books',
    profiles: 'members',
    borrowings: 'transactions',
  };

  for (const record of local.manifest.records) {
    const remote = remoteRecords.get(`${record.entity}:${record.entity_id}`);
    if (
      !remote ||
      isIncomingVersionNewer(record.changed_at, record.device_id, remote)
    ) {
      const event = eventsByKey.get(`${record.entity}:${record.entity_id}`);
      if (event) {
        events.push(event);
        counts[entityCountKey[event.entity]] += 1;
        estimatedBytes += strToU8(JSON.stringify(event)).length;
        if (estimatedBytes > MAX_LAN_TRANSFER_BYTES) {
          throw new Error('The transfer exceeds the 128 MiB per-transfer limit.');
        }
      }
    }
  }

  const remoteRecordsById = new Map(
    remoteManifest.records
      .filter((record) => record.entity === 'books')
      .map((record) => [record.entity_id, record])
  );
  const remoteCovers = new Map(remoteManifest.covers.map((cover) => [cover.book_id, cover]));
  const covers: LanTransferPlan['covers'] = [];
  const database = await getLocalDatabase({ seedCatalog: false });
  const localBooks = await database.getAllAsync<{ id: string; cover_path: string | null }>(
    'SELECT id, cover_path FROM books'
  );

  for (const book of localBooks) {
    const localVersion = local.bookVersions.get(book.id);
    const remoteVersion = remoteRecordsById.get(book.id);
    if (
      !localVersion ||
      !isTransferVersionAuthoritative(
        localVersion,
        remoteVersion,
        local.manifest.device_id
      )
    ) {
      continue;
    }
    const localCover = local.localCovers.get(book.id);
    const remoteCover = remoteCovers.get(book.id);
    if (localCover && localCover.sha256 !== remoteCover?.sha256) {
      const bytes = await readBytes(localCover.path);
      if (bytesToHex(sha256(bytes)) !== localCover.sha256) {
        throw new Error(`The cover for book ${book.id} changed during comparison.`);
      }
      covers.push({
        book_id: book.id,
        sha256: localCover.sha256,
        mime_type: localCover.mime_type,
        bytes,
      });
      counts.covers += 1;
      estimatedBytes += bytes.length;
      if (estimatedBytes > MAX_LAN_TRANSFER_BYTES) {
        throw new Error('The transfer exceeds the 128 MiB per-transfer limit.');
      }
    } else if (!localCover && remoteCover) {
      covers.push({ book_id: book.id, sha256: null, mime_type: null, bytes: null });
      counts.covers += 1;
    }
  }

  return { events, covers, counts, estimatedBytes };
}

export async function getLanTransferEvents(
  records: { entity: SyncEvent['entity']; entity_id: string }[]
): Promise<SyncEvent[]> {
  if (!Array.isArray(records) || records.length > 100) {
    throw new Error('A LAN transfer record request is invalid.');
  }
  const local = await getLocalTransferSnapshot();
  const wanted = new Set(records.map((record) => `${record.entity}:${record.entity_id}`));
  return local.events.filter((event) => wanted.has(`${event.entity}:${event.entity_id}`));
}

export async function readLanTransferCoverChunk(
  bookId: string,
  chunkIndex: number,
  chunkSize: number,
  expectedHash?: string
): Promise<{
  book_id: string;
  sha256: string;
  mime_type: string;
  byte_length: number;
  chunk_index: number;
  chunk_count: number;
  bytes: Uint8Array;
}> {
  if (
    !bookId ||
    !Number.isSafeInteger(chunkIndex) ||
    chunkIndex < 0 ||
    !Number.isSafeInteger(chunkSize) ||
    chunkSize <= 0 ||
    chunkSize > 512 * 1024 ||
    (expectedHash !== undefined && !/^[a-f0-9]{64}$/i.test(expectedHash))
  ) {
    throw new Error('The requested cover chunk is invalid.');
  }
  const database = await getLocalDatabase({ seedCatalog: false });
  const book = await database.getFirstAsync<{ cover_path: string | null }>(
    'SELECT cover_path FROM books WHERE id = ?',
    bookId
  );
  if (!book?.cover_path) {
    throw new Error('The requested book cover is not available on this device.');
  }
  let allBytes: Uint8Array;
  let sha256Hash: string;
  let mimeType: string;
  if (
    cachedTransferCover?.path === book.cover_path &&
    (expectedHash === undefined || cachedTransferCover.sha256 === expectedHash)
  ) {
    ({ bytes: allBytes, sha256: sha256Hash, mimeType } = cachedTransferCover);
  } else {
    allBytes = await readBytes(book.cover_path);
    sha256Hash = bytesToHex(sha256(allBytes));
    mimeType = mimeTypeForPath(book.cover_path);
    cachedTransferCover = {
      path: book.cover_path,
      bytes: allBytes,
      sha256: sha256Hash,
      mimeType,
    };
  }
  if (expectedHash && sha256Hash !== expectedHash) {
    cachedTransferCover = null;
    throw new Error('The requested book cover changed during transfer.');
  }
  if (allBytes.length > 32 * 1024 * 1024) {
    cachedTransferCover = null;
    throw new Error('This book cover is too large to transfer over LAN.');
  }
  const start = chunkIndex * chunkSize;
  if (start >= allBytes.length && allBytes.length > 0) {
    throw new Error('The requested cover chunk is outside the file.');
  }
  const chunkCount = Math.max(1, Math.ceil(allBytes.length / chunkSize));
  return {
    book_id: bookId,
    sha256: sha256Hash,
    mime_type: mimeType,
    byte_length: allBytes.length,
    chunk_index: chunkIndex,
    chunk_count: chunkCount,
    bytes: allBytes.subarray(start, Math.min(start + chunkSize, allBytes.length)),
  };
}

export async function persistLanTransferCover(
  bookId: string,
  bytes: Uint8Array,
  mimeType: string,
  expectedHash: string
): Promise<string> {
  if (
    !bookId ||
    !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType) ||
    !/^[a-f0-9]{64}$/i.test(expectedHash) ||
    bytesToHex(sha256(bytes)) !== expectedHash
  ) {
    throw new Error('A transferred cover failed its checksum or type validation.');
  }
  return coverUri(bytes, mimeType);
}

async function saveTransferSafetyBackup(
  packageBytes: Uint8Array
): Promise<string> {
  const desktop = getDesktopApi();
  if (Platform.OS === 'web' && desktop) {
    return desktop.saveSafetyBackup({
      data: Buffer.from(packageBytes).toString('base64'),
      sha256: bytesToHex(sha256(packageBytes)),
    });
  }
  if (Platform.OS === 'web') {
    throw new Error('Automatic transfer safety backups require a native app or Electron desktop.');
  }
  const directory = FileSystem.documentDirectory;
  if (!directory) {
    throw new Error('The device document directory is unavailable for a safety backup.');
  }
  const backupDirectory = `${directory}library-safety-backups/`;
  await FileSystem.makeDirectoryAsync(backupDirectory, { intermediates: true });
  const name = `LAN-Transfer-Safety-${fileNameTimestamp()}.library`;
  const uri = `${backupDirectory}${name}`;
  await FileSystem.writeAsStringAsync(uri, Buffer.from(packageBytes).toString('base64'), {
    encoding: FileSystem.EncodingType.Base64,
  });
  const saved = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (bytesToHex(sha256(new Uint8Array(Buffer.from(saved, 'base64')))) !== bytesToHex(sha256(packageBytes))) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    throw new Error('The transfer safety backup could not be verified.');
  }

  const existing = (await FileSystem.readDirectoryAsync(backupDirectory))
    .filter((file) => /^LAN-Transfer-Safety-.*\.library$/.test(file))
    .sort()
    .reverse();
  for (const oldFile of existing.slice(5)) {
    await FileSystem.deleteAsync(`${backupDirectory}${oldFile}`, { idempotent: true });
  }
  return name;
}

export async function applyLanTransfer(
  events: SyncEvent[],
  covers: { book_id: string; uri: string | null }[],
  transferId: string
): Promise<{ backupName: string; records: number; covers: number }> {
  if (!events.length && !covers.length) {
    return { backupName: '', records: 0, covers: 0 };
  }
  const { bytes: backupBytes } = await createPortableLibraryPackageBytes();
  const parsedBackup = parsePackage(backupBytes);
  const backupDatabase = await validateDatabaseBytes(parsedBackup.files['library.db']);
  await backupDatabase.close();
  const backupName = await saveTransferSafetyBackup(backupBytes);
  const rollbackImage = parsedBackup.files['library.db'];
  const database = await getLocalDatabase({ seedCatalog: false });

  try {
    await applyRemoteSyncEvents(events);
    for (const cover of covers) {
      const book = await database.getFirstAsync<{ id: string }>(
        'SELECT id FROM books WHERE id = ?',
        cover.book_id
      );
      if (!book) {
        throw new Error(`The transfer references an unknown book ${cover.book_id}.`);
      }
      await database.runAsync(
        'UPDATE books SET cover_path = ? WHERE id = ?',
        cover.uri,
        cover.book_id
      );
    }
    const integrity = await database.getFirstAsync<{ quick_check: string }>(
      'PRAGMA quick_check'
    );
    if (integrity?.quick_check !== 'ok') {
      throw new Error('The received library failed SQLite integrity verification.');
    }
    for (const event of events) {
      const stored = await database.getFirstAsync<{ id: string }>(
        'SELECT id FROM sync_events WHERE id = ?',
        event.id
      );
      if (!stored) {
        throw new Error('The receiving device could not verify all transferred records.');
      }
    }
    for (const cover of covers) {
      const stored = await database.getFirstAsync<{ cover_path: string | null }>(
        'SELECT cover_path FROM books WHERE id = ?',
        cover.book_id
      );
      if (!stored || stored.cover_path !== cover.uri) {
        throw new Error(`The received cover for book ${cover.book_id} could not be verified.`);
      }
    }
    await recordTransferHistory({
      action: 'receive',
      books: events.filter((event) => event.entity === 'books').length,
      members: events.filter((event) => event.entity === 'profiles').length,
      transactions: events.filter((event) => event.entity === 'borrowings').length,
      covers: covers.filter((cover) => cover.uri !== null).length,
    });
    return { backupName, records: events.length, covers: covers.length };
  } catch (error) {
    await restoreDatabaseBytes(rollbackImage, true);
    throw error;
  }
}

export async function restorePortableLibraryPackage(
  mode: 'replace' | 'merge' = 'replace'
): Promise<string | null> {
  const packageBytes = await readSelectedPackage();
  if (!packageBytes) return null;
  const { files, manifest } = parsePackage(packageBytes);
  const imported = await validateDatabaseBytes(files['library.db']);
  if (
    imported.counts.books !== manifest.bookCount ||
    imported.counts.members !== manifest.memberCount ||
    imported.counts.transactions !== manifest.transactionCount
  ) {
    await imported.close();
    throw new Error('The Library package counts do not match its database.');
  }
  try {
    for (const cover of manifest.covers) {
      const book = await imported.database.getFirstAsync<{ id: string }>(
        'SELECT id FROM books WHERE id = ?',
        cover.book_id
      );
      if (!book) {
        throw new Error('The Library package references a cover for a missing book.');
      }
    }
    const current = await serializeDatabase();
    try {
      if (mode === 'merge') {
        const events = await getPackageMergeEvents(imported.database);
        await applyRemoteSyncEvents(events);
      } else {
        await restoreDatabaseBytes(files['library.db']);
      }
    } catch (error) {
      await restoreDatabaseBytes(current);
      throw error;
    }

    const database = await getLocalDatabase({ seedCatalog: false });
    try {
      for (const cover of manifest.covers) {
        const book = await database.getFirstAsync<{ id: string }>(
          'SELECT id FROM books WHERE id = ?',
          cover.book_id
        );
        if (!book) {
          throw new Error(`The package cover references unknown book ${cover.book_id}.`);
        }
        const bytes = files[cover.path];
        if (!bytes) continue;
        const uri = await coverUri(bytes, cover.mime_type);
        await database.runAsync(
          'UPDATE books SET cover_path = ? WHERE id = ?',
          uri,
          cover.book_id
        );
      }
    } catch (error) {
      await restoreDatabaseBytes(current);
      throw error;
    }
    await recordTransferHistory({
      action: mode === 'merge' ? 'merge' : 'restore',
      books: manifest.bookCount,
      members: manifest.memberCount,
      transactions: manifest.transactionCount,
      covers: manifest.coverCount,
    });
    return `${manifest.bookCount.toLocaleString()} books, ${manifest.memberCount.toLocaleString()} people, ${manifest.transactionCount.toLocaleString()} transactions, and ${manifest.coverCount.toLocaleString()} covers`;
  } finally {
    await imported.close();
  }
}
