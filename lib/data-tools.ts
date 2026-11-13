import { Buffer } from 'buffer';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import * as XLSX from 'xlsx';

import { saveBackupFile } from './backup-export';
import {
  DATABASE_SCHEMA_VERSION,
  applyRemoteSyncEvents,
  getAllLocalSyncEvents,
  getLocalDataCounts,
  getLocalDatabase,
  getLocalDeviceId,
  getLocalSyncReadiness,
  runLocalDatabaseExclusive,
  type SyncEvent,
} from './local-database';

const SYNC_PACKET_FORMAT = 'library-offline-sync-packet';
const MAX_PACKET_BYTES = 20 * 1024 * 1024;

function getDesktopApi() {
  if (typeof window === 'undefined' || !window.libraryDesktop?.isElectron) {
    return null;
  }
  return window.libraryDesktop;
}

function timestampForFileName(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function fileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

function getLocalFileSystem(): { cacheDirectory: string; databaseDirectory: string } {
  const cacheDirectory = FileSystem.cacheDirectory;
  const databaseDirectory = SQLite.defaultDatabaseDirectory;
  if (!cacheDirectory || !databaseDirectory) {
    throw new Error('The local file system is unavailable on this device.');
  }
  return { cacheDirectory, databaseDirectory };
}

async function shareOrDownload(
  uri: string,
  fileName: string,
  mimeType: string
): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof document === 'undefined') {
      throw new Error('File downloads are unavailable in this browser context.');
    }
    const link = document.createElement('a');
    link.href = uri;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    return;
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('The device does not have a compatible app for sharing files.');
  }
  await Sharing.shareAsync(uri, { dialogTitle: fileName, mimeType });
}

export async function exportLibraryWorkbook(): Promise<void> {
  const database = await getLocalDatabase({ seedCatalog: false });
  const [books, people, transactions, syncEvents] = await Promise.all([
    database.getAllAsync(
      `SELECT id, serial_number, title, author, publisher, location, cost,
        category, cover_path, index_path, is_active, created_at, updated_at
       FROM books ORDER BY title COLLATE NOCASE`
    ),
    database.getAllAsync(
      `SELECT id, username, full_name, mobile_number, subscription_start,
        subscription_expiry, is_enabled, created_at, role
       FROM profiles ORDER BY username COLLATE NOCASE`
    ),
    database.getAllAsync(
      `SELECT r.id, r.book_id, b.serial_number, b.title AS book_title,
        r.subscriber_id, p.username AS subscriber_username,
        p.full_name AS subscriber_name, r.issued_at, r.due_date,
        r.returned_at, r.issued_by, r.received_by, r.notes,
        r.sync_conflicted
       FROM borrowings r
       LEFT JOIN books b ON b.id = r.book_id
       LEFT JOIN profiles p ON p.id = r.subscriber_id
       ORDER BY r.issued_at DESC`
    ),
    database.getAllAsync(
      `SELECT id, entity, entity_id, changed_at, device_id, synced_at
       FROM sync_events ORDER BY changed_at DESC`
    ),
  ]);
  const conflictRows = await database.getAllAsync(
    `SELECT id, event_id, entity, entity_id, resolved_at
     FROM sync_conflicts ORDER BY resolved_at DESC`
  );
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of [
    ['Books', books],
    ['People', people],
    ['Transactions', transactions],
    ['Sync Events', syncEvents],
    ['Conflict Audits', conflictRows],
  ] as const) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(rows),
      name
    );
  }

  const fileName = `library-export-${timestampForFileName()}.xlsx`;
  const base64 = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
  const dataUri =
    `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
  if (Platform.OS === 'web') {
    await shareOrDownload(dataUri, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return;
  }

  const { cacheDirectory } = getLocalFileSystem();
  const uri = `${cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  try {
    await shareOrDownload(
      uri,
      fileName,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
}

export async function exportSyncPacket(): Promise<number> {
  const events = await getAllLocalSyncEvents();
  const packet = {
    format: SYNC_PACKET_FORMAT,
    version: 1,
    exported_at: new Date().toISOString(),
    events,
  };
  const contents = JSON.stringify(packet);
  if (Buffer.byteLength(contents, 'utf8') > MAX_PACKET_BYTES) {
    throw new Error(
      'The sync packet exceeds 20 MiB. Use LAN sync or a database backup instead.'
    );
  }
  const fileName = `library-sync-packet-${timestampForFileName()}.json`;
  if (Platform.OS === 'web') {
    await shareOrDownload(
      `data:application/json;base64,${Buffer.from(contents, 'utf8').toString('base64')}`,
      fileName,
      'application/json'
    );
    return events.length;
  }
  const { cacheDirectory } = getLocalFileSystem();
  const uri = `${cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, contents);
  try {
    await shareOrDownload(uri, fileName, 'application/json');
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
  return events.length;
}

function parseSyncPacket(contents: string): SyncEvent[] {
  if (Buffer.byteLength(contents, 'utf8') > MAX_PACKET_BYTES) {
    throw new Error('The selected sync packet exceeds the 20 MiB import limit.');
  }
  let packet: unknown;
  try {
    packet = JSON.parse(contents) as unknown;
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }
  if (
    !packet ||
    typeof packet !== 'object' ||
    !('format' in packet) ||
    packet.format !== SYNC_PACKET_FORMAT ||
    !('version' in packet) ||
    packet.version !== 1 ||
    !('events' in packet) ||
    !Array.isArray(packet.events)
  ) {
    throw new Error('The selected file is not a supported Library sync packet.');
  }
  return packet.events as SyncEvent[];
}

async function readPickedText(uri: string, base64?: string): Promise<string> {
  if (base64 !== undefined) {
    return Buffer.from(base64, 'base64').toString('utf8');
  }
  return FileSystem.readAsStringAsync(uri);
}

export async function importSyncPacket(): Promise<number | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/json'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) {
    return null;
  }
  const asset = result.assets[0];
  if (!asset || !asset.name.toLowerCase().endsWith('.json')) {
    throw new Error('Choose a Library sync packet with a .json file extension.');
  }
  const events = parseSyncPacket(await readPickedText(asset.uri, asset.base64));
  await applyRemoteSyncEvents(events);
  return events.length;
}

export async function testSyncPacketIdempotency(): Promise<{
  events: number;
  records: number;
}> {
  const events = await getAllLocalSyncEvents();
  const before = await getLocalDataCounts();
  const database = await getLocalDatabase({ seedCatalog: false });
  const captureState = async () =>
    JSON.stringify(
      await Promise.all([
        database.getAllAsync(
          `SELECT id, serial_number, title, author, publisher, location, cost, category,
                  cover_path, index_path, is_active, created_at, updated_at,
                  sync_changed_at, sync_device_id
           FROM books ORDER BY id`
        ),
        database.getAllAsync(
          `SELECT id, username, full_name, mobile_number, subscription_start,
                  subscription_expiry, is_enabled, created_at, role,
                  sync_changed_at, sync_device_id
           FROM profiles ORDER BY id`
        ),
        database.getAllAsync(
          `SELECT id, book_id, subscriber_id, issued_at, due_date, returned_at,
                  issued_by, received_by, notes, sync_conflicted,
                  sync_changed_at, sync_device_id
           FROM borrowings ORDER BY id`
        ),
        database.getAllAsync(
          `SELECT id, entity, entity_id, changed_at, device_id, synced_at
           FROM sync_events ORDER BY id`
        ),
        database.getAllAsync(
          `SELECT id, event_id, entity, entity_id, resolved_at
           FROM sync_conflicts ORDER BY id`
        ),
      ])
    );
  const beforeState = await captureState();
  await applyRemoteSyncEvents(events);
  const after = await getLocalDataCounts();
  const afterState = await captureState();
  if (
    before.books !== after.books ||
    before.profiles !== after.profiles ||
    before.borrowings !== after.borrowings ||
    before.sync_events !== after.sync_events ||
    before.sync_conflicts !== after.sync_conflicts ||
    beforeState !== afterState
  ) {
    throw new Error('Sync packet idempotency test changed local database state.');
  }
  return {
    events: events.length,
    records: before.books + before.profiles + before.borrowings,
  };
}

async function validateDatabaseBackup(
  importedDatabase: SQLite.SQLiteDatabase
): Promise<void> {
  const check = await importedDatabase.getFirstAsync<{ quick_check: string }>(
    'PRAGMA quick_check'
  );
  const version = await importedDatabase.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  if (check?.quick_check !== 'ok') {
    throw new Error(
      `The selected database is damaged and cannot be restored: ${check?.quick_check ?? 'SQLite returned no result'}.`
    );
  }
  if (version?.user_version !== DATABASE_SCHEMA_VERSION) {
    throw new Error(
      `This backup uses Library database version ${version?.user_version ?? 'unknown'}, but this app supports version ${DATABASE_SCHEMA_VERSION}.`
    );
  }
  const tables = await importedDatabase.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table'`
  );
  const tableNames = new Set(tables.map((table) => table.name));
  for (const requiredTable of [
    'books',
    'profiles',
    'borrowings',
    'sync_events',
    'sync_peers',
    'sync_conflicts',
    'sync_metadata',
  ]) {
    if (!tableNames.has(requiredTable)) {
      throw new Error('The selected database is missing Library tables.');
    }
  }
}

export async function exportDatabaseBackup(): Promise<boolean | null> {
  const desktop = getDesktopApi();
  if (Platform.OS === 'web' && !desktop) {
    throw new Error('SQLite .db backup files are available in the desktop app or native apps.');
  }
  const sourceDatabase = await getLocalDatabase({ seedCatalog: false });
  const fileName = `library-backup-${timestampForFileName()}.db`;
  const serialized = await runLocalDatabaseExclusive(() =>
    sourceDatabase.serializeAsync('main')
  );
  return saveBackupFile({
    bytes: serialized,
    fileName,
    mimeType: 'application/x-sqlite3',
    filterName: 'SQLite database',
    extensions: ['db', 'sqlite', 'sqlite3'],
  });
}

export async function restoreDatabaseBackup(): Promise<boolean> {
  const desktop = getDesktopApi();
  if (Platform.OS === 'web' && desktop) {
    const selectedPath = await desktop.chooseFile({
      filters: [{ name: 'SQLite database', extensions: ['db', 'sqlite', 'sqlite3'] }],
    });
    if (!selectedPath) {
      return false;
    }
    const file = await desktop.readFile(selectedPath);
    const importedDatabase = await SQLite.deserializeDatabaseAsync(
      new Uint8Array(Buffer.from(file.data, 'base64')),
      { useNewConnection: true }
    );
    try {
      await validateDatabaseBackup(importedDatabase);
      const database = await getLocalDatabase({ seedCatalog: false });
      const localDeviceId = await getLocalDeviceId();
      await runLocalDatabaseExclusive(async () => {
        await SQLite.backupDatabaseAsync({
          sourceDatabase: importedDatabase,
          sourceDatabaseName: 'main',
          destDatabase: database,
          destDatabaseName: 'main',
        });
        await database.runAsync(
          `INSERT OR REPLACE INTO sync_metadata (key, value) VALUES ('device_id', ?)`,
          localDeviceId
        );
        await database.runAsync('DELETE FROM sync_peers');
        await database.runAsync('DELETE FROM sync_peer_events');
        await database.runAsync('UPDATE sync_events SET synced_at = NULL');
      });
      return true;
    } finally {
      await importedDatabase.closeAsync();
    }
  }
  if (Platform.OS === 'web') {
    throw new Error('SQLite .db restore is available in the desktop app or native apps.');
  }
  const selection = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (selection.canceled) {
    return false;
  }
  const asset = selection.assets[0];
  if (!asset || !/\.(db|sqlite|sqlite3)$/i.test(asset.name)) {
    throw new Error('Choose a SQLite backup file ending in .db, .sqlite, or .sqlite3.');
  }

  const { databaseDirectory } = getLocalFileSystem();
  const temporaryName = `library-restore-${timestampForFileName()}.db`;
  const temporaryUri = fileUri(`${databaseDirectory}/${temporaryName}`);
  await FileSystem.copyAsync({ from: asset.uri, to: temporaryUri });
  let importedDatabase: SQLite.SQLiteDatabase | null = null;
  try {
    importedDatabase = await SQLite.openDatabaseAsync(temporaryName, {
      useNewConnection: true,
    });
    await validateDatabaseBackup(importedDatabase);

    const database = await getLocalDatabase({ seedCatalog: false });
    const localDeviceId = await getLocalDeviceId();
    await runLocalDatabaseExclusive(async () => {
      await SQLite.backupDatabaseAsync({
        sourceDatabase: importedDatabase!,
        sourceDatabaseName: 'main',
        destDatabase: database,
        destDatabaseName: 'main',
      });
      await database.runAsync(
        `INSERT OR REPLACE INTO sync_metadata (key, value) VALUES ('device_id', ?)`,
        localDeviceId
      );
      await database.runAsync('DELETE FROM sync_peers');
      await database.runAsync('DELETE FROM sync_peer_events');
      await database.runAsync('UPDATE sync_events SET synced_at = NULL');
    });
    return true;
  } finally {
    if (importedDatabase) {
      await importedDatabase.closeAsync();
    }
    await SQLite.deleteDatabaseAsync(temporaryName);
  }
}

export async function getSyncReadiness() {
  return getLocalSyncReadiness();
}

export async function getSyncPacketEventCount(): Promise<number> {
  return (await getAllLocalSyncEvents()).length;
}
