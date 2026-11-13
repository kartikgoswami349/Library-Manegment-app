import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import seedBooks from '../assets/library-seed.json';

export type LocalBook = {
  id: string;
  serial_number: string;
  title: string;
  author: string;
  publisher: string | null;
  location: string | null;
  cost: number | null;
  category: string | null;
  cover_path: string | null;
  index_path: string | null;
  is_active: boolean;
  is_available: boolean;
  cover_url: string | null;
  created_at: string;
};

export type LocalProfile = {
  id: string;
  username: string;
  full_name: string | null;
  mobile_number: string | null;
  subscription_start: string | null;
  subscription_expiry: string | null;
  is_enabled: boolean;
  created_at: string | null;
  role: 'admin' | 'subscriber';
  is_library_subscriber: boolean;
};

export type LocalBorrowing = {
  id: string;
  book_id: string;
  subscriber_id: string;
  issued_at: string;
  due_date: string | null;
  returned_at: string | null;
  issued_by: string | null;
  received_by: string | null;
  notes: string | null;
};

type SyncEntity = 'books' | 'profiles' | 'borrowings';

export type LanPeer = {
  device_id: string;
  device_name: string;
  paired_at: string;
  last_seen: string;
  address?: string | null;
};

export type SyncEvent = {
  id: string;
  entity: SyncEntity;
  entity_id: string;
  payload: string;
  changed_at: string;
  device_id: string;
  revision?: number;
};

type SeedBook = {
  source_row: number;
  serial_number: string | null;
  location: string | null;
  category: string | null;
  title: string;
  author: string;
  publisher: string | null;
  cost: number | null;
};

const DATABASE_NAME = 'library.db';
export const DATABASE_SCHEMA_VERSION = 8;
const SEED_VERSION = 'library-csv-v1';
const DATABASE_SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS sync_metadata (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY NOT NULL,
    serial_number TEXT,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    publisher TEXT,
    location TEXT,
    cost REAL,
    category TEXT,
    cover_path TEXT,
    index_path TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sync_changed_at TEXT NOT NULL,
    sync_device_id TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS books_serial_number_idx
    ON books (serial_number);
  CREATE INDEX IF NOT EXISTS books_title_idx ON books (title);
  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY NOT NULL,
    username TEXT,
    password_salt TEXT,
    password_hash TEXT,
    full_name TEXT,
    mobile_number TEXT,
    subscription_start TEXT,
    subscription_expiry TEXT,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT,
    role TEXT NOT NULL DEFAULT 'subscriber'
      CHECK (role IN ('admin', 'subscriber')),
    is_library_subscriber INTEGER NOT NULL DEFAULT 0,
    sync_changed_at TEXT NOT NULL,
    sync_device_id TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS borrowings (
    id TEXT PRIMARY KEY NOT NULL,
    book_id TEXT NOT NULL,
    subscriber_id TEXT NOT NULL,
    issued_at TEXT NOT NULL,
    due_date TEXT,
    returned_at TEXT,
    issued_by TEXT,
    received_by TEXT,
    notes TEXT,
    sync_conflicted INTEGER NOT NULL DEFAULT 0,
    sync_changed_at TEXT NOT NULL,
    sync_device_id TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS borrowings_active_book_idx
    ON borrowings (book_id, returned_at);
  CREATE INDEX IF NOT EXISTS borrowings_subscriber_idx
    ON borrowings (subscriber_id, issued_at);
  CREATE TABLE IF NOT EXISTS sync_events (
    id TEXT PRIMARY KEY NOT NULL,
    entity TEXT NOT NULL CHECK (entity IN ('books', 'profiles', 'borrowings')),
    entity_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    changed_at TEXT NOT NULL,
    device_id TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    synced_at TEXT
  );
  CREATE INDEX IF NOT EXISTS sync_events_entity_idx
    ON sync_events (entity, entity_id, changed_at);
  CREATE TABLE IF NOT EXISTS sync_peer_events (
    peer_device_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    sent_at TEXT NOT NULL,
    PRIMARY KEY (peer_device_id, event_id)
  );
  CREATE TABLE IF NOT EXISTS sync_peers (
    device_id TEXT PRIMARY KEY NOT NULL,
    device_name TEXT NOT NULL,
    paired_at TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    acknowledged_sequence INTEGER NOT NULL DEFAULT 0,
    pending_sequence INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS sync_conflicts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    kept_payload TEXT NOT NULL,
    superseded_payload TEXT NOT NULL,
    resolved_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sync_revisions (
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    changed_at TEXT NOT NULL,
    device_id TEXT NOT NULL,
    PRIMARY KEY (entity, entity_id)
  );
`;

let databasePromise: Promise<SQLiteDatabase> | null = null;
let catalogSeedPromise: Promise<void> | null = null;
let deviceIdPromise: Promise<string> | null = null;
let localTransactionQueue: Promise<void> = Promise.resolve();
let localChangesPendingSync = false;
let localSyncTriggerScheduled = false;

function scheduleLocalSyncAttempt(): void {
  if (localSyncTriggerScheduled) return;
  localSyncTriggerScheduled = true;
  setTimeout(() => {
    localSyncTriggerScheduled = false;
    void import('./lan-auto-sync')
      .then(({ syncPairedLanDevices }) => syncPairedLanDevices())
      .catch((error: unknown) => {
        console.warn('Immediate LAN sync could not start after a local change.', error);
      });
  }, 0);
}

export function runLocalDatabaseExclusive<T>(task: () => Promise<T>): Promise<T> {
  const operation = localTransactionQueue.then(task);
  localTransactionQueue = operation.then(
    () => undefined,
    () => undefined
  );
  return operation;
}

export function withLocalTransaction(
  database: SQLiteDatabase,
  task: (transaction: SQLiteDatabase) => Promise<void>
): Promise<void> {
  return runLocalDatabaseExclusive(async () => {
    try {
      if (Platform.OS === 'web') {
        await database.withTransactionAsync(() => task(database));
      } else {
        await database.withExclusiveTransactionAsync(task);
      }
    } catch (error) {
      localChangesPendingSync = false;
      throw error;
    }
    if (localChangesPendingSync) {
      localChangesPendingSync = false;
      scheduleLocalSyncAttempt();
    }
  });
}

function makeId(): string {
  const bytes = new Uint8Array(16);
  const cryptoApi = globalThis.crypto;

  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function deterministicBookId(book: SeedBook): string {
  const value = `${book.source_row}:${book.serial_number ?? ''}:${book.title}:${book.author}`;
  const hashes = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    for (let hashIndex = 0; hashIndex < hashes.length; hashIndex += 1) {
      hashes[hashIndex] = Math.imul(
        hashes[hashIndex] ^ (code + hashIndex * 17),
        0x01000193 + hashIndex * 2
      ) >>> 0;
    }
  }

  const hex = hashes.map((hash) => hash.toString(16).padStart(8, '0')).join('').split('');
  hex[12] = '5';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const id = hex.join('');

  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

async function getDeviceId(database: SQLiteDatabase): Promise<string> {
  if (!deviceIdPromise) {
    deviceIdPromise = (async () => {
      const current = await database.getFirstAsync<{ value: string }>(
        'SELECT value FROM sync_metadata WHERE key = ?',
        'device_id'
      );

      if (current) {
        return current.value;
      }

      const id = makeId();
      await withLocalTransaction(database, async (transaction) => {
        await transaction.runAsync(
          'INSERT OR IGNORE INTO sync_metadata (key, value) VALUES (?, ?)',
          'device_id',
          id
        );
      });

      const saved = await database.getFirstAsync<{ value: string }>(
        'SELECT value FROM sync_metadata WHERE key = ?',
        'device_id'
      );

      if (!saved) {
        throw new Error('Unable to initialize the local device identifier.');
      }

      return saved.value;
    })();
  }

  return deviceIdPromise;
}

async function seedCatalog(database: SQLiteDatabase): Promise<void> {
  const seeded = await database.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_metadata WHERE key = ?',
    'catalog_seed_version'
  );

  if (seeded?.value === SEED_VERSION) {
    return;
  }

  const count = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM books'
  );

  if ((count?.count ?? 0) > 0) {
    await withLocalTransaction(database, async (transaction) => {
      await transaction.runAsync(
        'INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)',
        'catalog_seed_version',
        SEED_VERSION
      );
    });
    return;
  }

  const deviceId = await getDeviceId(database);
  const importedAt = '1970-01-01T00:00:00.000Z';
  const books = seedBooks as SeedBook[];

  await withLocalTransaction(database, async (transaction) => {
    const rowPlaceholders = '(?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, ?, ?)';
    for (let offset = 0; offset < books.length; offset += 50) {
      const batch = books.slice(offset, offset + 50);
      const values: (string | number | null)[] = [];
      for (const book of batch) {
        values.push(
          deterministicBookId(book),
          book.serial_number,
          book.title,
          book.author,
          book.publisher,
          book.location,
          book.cost,
          book.category,
          importedAt,
          importedAt,
          importedAt,
          deviceId
        );
      }
      await transaction.runAsync(
        `INSERT OR IGNORE INTO books (
          id, serial_number, title, author, publisher, location, cost, category,
          index_path, is_active, created_at, updated_at, sync_changed_at, sync_device_id
        ) VALUES ${batch.map(() => rowPlaceholders).join(', ')}`,
        ...values
      );
    }

    await transaction.runAsync(
      'INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)',
      'catalog_seed_version',
      SEED_VERSION
    );
  });
}

export async function getLocalDatabase(
  options: { seedCatalog?: boolean } = {}
): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const database = await openDatabaseAsync(DATABASE_NAME, {
        useNewConnection: true,
      });
      const currentVersion = await database.getFirstAsync<{ user_version: number }>(
        'PRAGMA user_version'
      );
      if ((currentVersion?.user_version ?? 0) > DATABASE_SCHEMA_VERSION) {
        throw new Error(
          `Local database version ${currentVersion?.user_version} is newer than this app supports.`
        );
      }
      await database.execAsync(DATABASE_SCHEMA);
      if ((currentVersion?.user_version ?? 0) < DATABASE_SCHEMA_VERSION) {
        const bookColumns = await database.getAllAsync<{ name: string }>(
          'PRAGMA table_info(books)'
        );
        if (!bookColumns.some((column) => column.name === 'index_path')) {
          await database.execAsync('ALTER TABLE books ADD COLUMN index_path TEXT');
        }
        const profileColumns = await database.getAllAsync<{ name: string }>(
          'PRAGMA table_info(profiles)'
        );
        if (!profileColumns.some((column) => column.name === 'username')) {
          await database.execAsync('ALTER TABLE profiles ADD COLUMN username TEXT');
        }
        if (!profileColumns.some((column) => column.name === 'password_salt')) {
          await database.execAsync('ALTER TABLE profiles ADD COLUMN password_salt TEXT');
        }
        if (!profileColumns.some((column) => column.name === 'password_hash')) {
          await database.execAsync('ALTER TABLE profiles ADD COLUMN password_hash TEXT');
        }
        await database.execAsync(
          `UPDATE profiles SET username = 'user-' || id
           WHERE username IS NULL OR TRIM(username) = ''`
        );
        if (profileColumns.some((column) => column.name === 'email')) {
          await database.execAsync(`
            DROP TABLE IF EXISTS profiles_v3;
            CREATE TABLE profiles_v3 (
              id TEXT PRIMARY KEY NOT NULL,
              username TEXT,
              password_salt TEXT,
              password_hash TEXT,
              full_name TEXT,
              mobile_number TEXT,
              subscription_start TEXT,
              subscription_expiry TEXT,
              is_enabled INTEGER NOT NULL DEFAULT 1,
              created_at TEXT,
              role TEXT NOT NULL DEFAULT 'subscriber'
                CHECK (role IN ('admin', 'subscriber')),
              is_library_subscriber INTEGER NOT NULL DEFAULT 0,
              sync_changed_at TEXT NOT NULL,
              sync_device_id TEXT NOT NULL
            );
            INSERT INTO profiles_v3 (
              id, username, password_salt, password_hash, full_name,
              mobile_number, subscription_start, subscription_expiry,
              is_enabled, created_at, role, is_library_subscriber, sync_changed_at, sync_device_id
            )
            SELECT
              id, username, password_salt, password_hash, full_name,
              mobile_number, subscription_start, subscription_expiry,
              is_enabled, created_at, role, 0, sync_changed_at, sync_device_id
            FROM profiles;
            DROP TABLE profiles;
            ALTER TABLE profiles_v3 RENAME TO profiles;
          `);
        }
        if (
          !profileColumns.some((column) => column.name === 'is_library_subscriber') &&
          !profileColumns.some((column) => column.name === 'email')
        ) {
          await database.execAsync(
            'ALTER TABLE profiles ADD COLUMN is_library_subscriber INTEGER NOT NULL DEFAULT 0'
          );
        }
        await database.execAsync(
          `CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_idx
           ON profiles (username COLLATE NOCASE) WHERE username IS NOT NULL`
        );
        const syncEventColumns = await database.getAllAsync<{ name: string }>(
          'PRAGMA table_info(sync_events)'
        );
        if (!syncEventColumns.some((column) => column.name === 'synced_at')) {
          await database.execAsync('ALTER TABLE sync_events ADD COLUMN synced_at TEXT');
        }
        if (!syncEventColumns.some((column) => column.name === 'revision')) {
          await database.execAsync(
            'ALTER TABLE sync_events ADD COLUMN revision INTEGER NOT NULL DEFAULT 1'
          );
        }
        await database.execAsync(`
          INSERT OR IGNORE INTO sync_revisions (entity, entity_id, revision, changed_at, device_id)
          SELECT entity, entity_id, MAX(revision), MAX(changed_at), MAX(device_id)
          FROM sync_events GROUP BY entity, entity_id;
          INSERT OR IGNORE INTO sync_revisions (entity, entity_id, revision, changed_at, device_id)
          SELECT 'books', id, 1, sync_changed_at, sync_device_id FROM books;
          INSERT OR IGNORE INTO sync_revisions (entity, entity_id, revision, changed_at, device_id)
          SELECT 'profiles', id, 1, sync_changed_at, sync_device_id FROM profiles;
          INSERT OR IGNORE INTO sync_revisions (entity, entity_id, revision, changed_at, device_id)
          SELECT 'borrowings', id, 1, sync_changed_at, sync_device_id FROM borrowings;
        `);
        const syncPeerColumns = await database.getAllAsync<{ name: string }>(
          'PRAGMA table_info(sync_peers)'
        );
        if (!syncPeerColumns.some((column) => column.name === 'acknowledged_sequence')) {
          await database.execAsync(
            'ALTER TABLE sync_peers ADD COLUMN acknowledged_sequence INTEGER NOT NULL DEFAULT 0'
          );
        }
        if (!syncPeerColumns.some((column) => column.name === 'pending_sequence')) {
          await database.execAsync(
            'ALTER TABLE sync_peers ADD COLUMN pending_sequence INTEGER NOT NULL DEFAULT 0'
          );
        }
        await database.execAsync(`PRAGMA user_version = ${DATABASE_SCHEMA_VERSION}`);
      }
      await getDeviceId(database);
      return database;
    })().catch((error: unknown) => {
      databasePromise = null;
      catalogSeedPromise = null;
      deviceIdPromise = null;
      throw error;
    });
  }

  const database = await databasePromise;
  if (options?.seedCatalog !== false) {
    await ensureCatalogSeeded(database);
  }
  return database;
}

async function ensureCatalogSeeded(database: SQLiteDatabase): Promise<void> {
  if (!catalogSeedPromise) {
    catalogSeedPromise = seedCatalog(database).catch((error: unknown) => {
      catalogSeedPromise = null;
      throw error;
    });
  }
  await catalogSeedPromise;
}

export async function seedLocalCatalog(): Promise<void> {
  const database = await getLocalDatabase({ seedCatalog: false });
  await ensureCatalogSeeded(database);
}

export function createLocalId(): string {
  return makeId();
}

export async function getLocalDeviceId(): Promise<string> {
  const database = await getLocalDatabase({ seedCatalog: false });
  return getDeviceId(database);
}

export async function appendLocalEvent(
  database: SQLiteDatabase,
  entity: SyncEntity,
  entityId: string,
  payload: object,
  changedAt: string,
  deviceId: string
): Promise<void> {
  const current = await database.getFirstAsync<{ revision: number }>(
    'SELECT revision FROM sync_revisions WHERE entity = ? AND entity_id = ?',
    entity,
    entityId
  );
  const revision = (current?.revision ?? 0) + 1;
  await database.runAsync(
    `INSERT INTO sync_revisions (entity, entity_id, revision, changed_at, device_id)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(entity, entity_id) DO UPDATE SET
       revision = excluded.revision,
       changed_at = excluded.changed_at,
       device_id = excluded.device_id`,
    entity,
    entityId,
    revision,
    changedAt,
    deviceId
  );
  await database.runAsync(
    `INSERT INTO sync_events (id, entity, entity_id, payload, changed_at, device_id, revision)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    makeId(),
    entity,
    entityId,
    JSON.stringify(payload),
    changedAt,
    deviceId,
    revision
  );
  localChangesPendingSync = true;
}

export async function getLocalSyncEvents(): Promise<SyncEvent[]> {
  const database = await getLocalDatabase({ seedCatalog: false });
  return database.getAllAsync<SyncEvent>(
    `SELECT id, entity, entity_id, payload, changed_at, device_id, revision
     FROM sync_events WHERE synced_at IS NULL
     ORDER BY changed_at, device_id, id LIMIT 500`
  );
}

export async function getLocalSyncEventsForPeer(peerDeviceId: string): Promise<SyncEvent[]> {
  const database = await getLocalDatabase({ seedCatalog: false });
  return database.getAllAsync<SyncEvent>(
    `SELECT event.id, event.entity, event.entity_id, event.payload, event.changed_at, event.device_id, event.revision
     FROM sync_events AS event
     WHERE NOT EXISTS (
       SELECT 1 FROM sync_peer_events AS sent
       WHERE sent.peer_device_id = ? AND sent.event_id = event.id
     )
     ORDER BY event.changed_at, event.device_id, event.id LIMIT 500`,
    peerDeviceId
  );
}

export async function getAllLocalSyncEvents(): Promise<SyncEvent[]> {
  const database = await getLocalDatabase({ seedCatalog: false });
  return database.getAllAsync<SyncEvent>(
    `SELECT id, entity, entity_id, payload, changed_at, device_id, revision
     FROM sync_events ORDER BY changed_at, device_id, id`
  );
}

export async function getLocalSyncReadiness(): Promise<{
  books: number;
  people: number;
  transactions: number;
  audits: number;
  records_ready: number;
}> {
  const database = await getLocalDatabase({ seedCatalog: false });
  const result = await database.getFirstAsync<{
    books: number;
    people: number;
    transactions: number;
    audits: number;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM books) AS books,
      (SELECT COUNT(*) FROM profiles) AS people,
      (SELECT COUNT(*) FROM borrowings) AS transactions,
      (SELECT COUNT(*) FROM sync_events) + (SELECT COUNT(*) FROM sync_conflicts) AS audits
  `);
  if (!result) {
    throw new Error('Unable to read local sync readiness.');
  }
  return {
    ...result,
    records_ready: result.books + result.people + result.transactions + result.audits,
  };
}

export async function getLocalDataCounts(): Promise<{
  books: number;
  profiles: number;
  borrowings: number;
  sync_events: number;
  sync_conflicts: number;
}> {
  const database = await getLocalDatabase({ seedCatalog: false });
  const result = await database.getFirstAsync<{
    books: number;
    profiles: number;
    borrowings: number;
    sync_events: number;
    sync_conflicts: number;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM books) AS books,
      (SELECT COUNT(*) FROM profiles) AS profiles,
      (SELECT COUNT(*) FROM borrowings) AS borrowings,
      (SELECT COUNT(*) FROM sync_events) AS sync_events,
      (SELECT COUNT(*) FROM sync_conflicts) AS sync_conflicts
  `);
  if (!result) {
    throw new Error('Unable to count local library records.');
  }
  return result;
}

export async function registerLanPeer(
  deviceId: string,
  deviceName: string,
  address?: string | null
): Promise<boolean> {
  const database = await getLocalDatabase({ seedCatalog: false });
  let registered = false;
  const now = new Date().toISOString();
  await withLocalTransaction(database, async (transaction) => {
    const existing = await transaction.getFirstAsync<{ device_id: string }>(
      'SELECT device_id FROM sync_peers WHERE device_id = ?',
      deviceId
    );
    if (!existing) {
      await transaction.runAsync(
        'INSERT INTO sync_peers (device_id, device_name, paired_at, last_seen) VALUES (?, ?, ?, ?)',
        deviceId,
        deviceName,
        now,
        now
      );
    } else {
      await transaction.runAsync(
        'UPDATE sync_peers SET device_name = ?, last_seen = ? WHERE device_id = ?',
        deviceName,
        now,
        deviceId
      );
    }
    if (address) {
      await saveLanPeerAddress(transaction, deviceId, address);
    }
    registered = true;
  });
  return registered;
}

export async function ensureLanPeerRegistered(
  deviceId: string,
  deviceName: string,
  address?: string | null,
  lastSeenAt?: string | null
): Promise<void> {
  const database = await getLocalDatabase({ seedCatalog: false });
  const pairedAt = new Date().toISOString();
  await withLocalTransaction(database, async (transaction) => {
    const existing = await transaction.getFirstAsync<{ device_id: string }>(
      'SELECT device_id FROM sync_peers WHERE device_id = ?',
      deviceId
    );
    if (existing) {
      await transaction.runAsync(
        'UPDATE sync_peers SET device_name = ? WHERE device_id = ?',
        deviceName.slice(0, 40),
        deviceId
      );
    } else {
      await transaction.runAsync(
        `INSERT INTO sync_peers (device_id, device_name, paired_at, last_seen)
         VALUES (?, ?, ?, ?)`,
        deviceId,
        deviceName.slice(0, 40),
        pairedAt,
        lastSeenAt && Number.isFinite(Date.parse(lastSeenAt))
          ? lastSeenAt
          : '1970-01-01T00:00:00.000Z'
      );
    }
    if (address) {
      await saveLanPeerAddress(transaction, deviceId, address);
    }
  });
}

export async function unregisterLanPeer(deviceId: string): Promise<void> {
  const database = await getLocalDatabase({ seedCatalog: false });
  const hostDeviceId = await getDeviceId(database);
  if (deviceId === hostDeviceId) {
    throw new Error('The sync-group host cannot remove itself.');
  }
  await withLocalTransaction(database, async (transaction) => {
    await transaction.runAsync(
      'DELETE FROM sync_peers WHERE device_id = ?',
      deviceId
    );
    await transaction.runAsync(
      'DELETE FROM sync_peer_events WHERE peer_device_id = ?',
      deviceId
    );
    await removeLanPeerAddress(transaction, deviceId);
  });
}

export async function getPairedLanPeers(): Promise<LanPeer[]> {
  const database = await getLocalDatabase({ seedCatalog: false });
  const peers = await database.getAllAsync<Omit<LanPeer, 'address'>>(
    'SELECT device_id, device_name, paired_at, last_seen FROM sync_peers ORDER BY paired_at, device_id'
  );
  const addresses = await readLanPeerAddresses(database);
  return peers.map((peer) => ({ ...peer, address: addresses[peer.device_id] ?? null }));
}

export async function savePairedLanPeers(peers: LanPeer[]): Promise<void> {
  if (!Array.isArray(peers)) {
    throw new Error('The peer returned an invalid paired-device list.');
  }
  const database = await getLocalDatabase({ seedCatalog: false });
  await withLocalTransaction(database, async (transaction) => {
    for (const peer of peers) {
      if (
        !peer ||
        typeof peer.device_id !== 'string' ||
        typeof peer.device_name !== 'string' ||
        typeof peer.paired_at !== 'string' ||
        typeof peer.last_seen !== 'string' ||
        (peer.address !== undefined &&
          peer.address !== null &&
          typeof peer.address !== 'string')
      ) {
        throw new Error('The peer returned an invalid paired-device list.');
      }
      await transaction.runAsync(
        `INSERT INTO sync_peers (device_id, device_name, paired_at, last_seen)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(device_id) DO UPDATE SET
           device_name = excluded.device_name`,
        peer.device_id,
        peer.device_name.slice(0, 40),
        peer.paired_at,
        peer.paired_at
      );
      if (peer.address) {
        await saveLanPeerAddress(transaction, peer.device_id, peer.address);
      }
    }
  });
}

const LAN_PEER_ADDRESSES_KEY = 'lan_peer_addresses';

async function readLanPeerAddresses(
  database: SQLiteDatabase
): Promise<Record<string, string>> {
  const row = await database.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_metadata WHERE key = ?',
    LAN_PEER_ADDRESSES_KEY
  );
  if (!row?.value) return {};
  try {
    const parsed: unknown = JSON.parse(row.value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([deviceId, address]) =>
          deviceId.length > 0 &&
          typeof address === 'string' &&
          address.length <= 256
      )
    );
  } catch {
    return {};
  }
}

async function saveLanPeerAddress(
  database: SQLiteDatabase,
  deviceId: string,
  address: string
): Promise<void> {
  const addresses = await readLanPeerAddresses(database);
  addresses[deviceId] = address.slice(0, 256);
  await database.runAsync(
    'INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)',
    LAN_PEER_ADDRESSES_KEY,
    JSON.stringify(addresses)
  );
}

async function removeLanPeerAddress(
  database: SQLiteDatabase,
  deviceId: string
): Promise<void> {
  const addresses = await readLanPeerAddresses(database);
  delete addresses[deviceId];
  await database.runAsync(
    'INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)',
    LAN_PEER_ADDRESSES_KEY,
    JSON.stringify(addresses)
  );
}

export async function clearPairedLanPeers(): Promise<void> {
  const database = await getLocalDatabase({ seedCatalog: false });
  await withLocalTransaction(database, async (transaction) => {
    await transaction.runAsync('DELETE FROM sync_peers');
    await transaction.runAsync('DELETE FROM sync_peer_events');
    await transaction.runAsync(
      'INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)',
      LAN_PEER_ADDRESSES_KEY,
      '{}'
    );
  });
}

export async function markLocalSyncEventsSynced(eventIds: string[]): Promise<void> {
  if (eventIds.length === 0) {
    return;
  }
  const database = await getLocalDatabase({ seedCatalog: false });
  const syncedAt = new Date().toISOString();
  await withLocalTransaction(database, async (transaction) => {
    for (const eventId of eventIds) {
      await transaction.runAsync(
        'UPDATE sync_events SET synced_at = ? WHERE id = ? AND synced_at IS NULL',
        syncedAt,
        eventId
      );
    }
  });
}

export async function markLocalSyncEventsSyncedForPeer(
  peerDeviceId: string,
  eventIds: string[]
): Promise<void> {
  if (!eventIds.length) return;
  const database = await getLocalDatabase({ seedCatalog: false });
  const sentAt = new Date().toISOString();
  await withLocalTransaction(database, async (transaction) => {
    for (const eventId of eventIds) {
      await transaction.runAsync(
        'INSERT OR IGNORE INTO sync_peer_events (peer_device_id, event_id, sent_at) VALUES (?, ?, ?)',
        peerDeviceId,
        eventId,
        sentAt
      );
    }
    await transaction.runAsync(
      `UPDATE sync_events SET synced_at = COALESCE(synced_at, ?)
       WHERE id IN (${eventIds.map(() => '?').join(', ')})`,
      sentAt,
      ...eventIds
    );
  });
}

export async function resetLocalSyncOutbox(): Promise<void> {
  const database = await getLocalDatabase({ seedCatalog: false });
  await withLocalTransaction(database, async (transaction) => {
    await transaction.runAsync('UPDATE sync_events SET synced_at = NULL');
    await transaction.runAsync('DELETE FROM sync_peer_events');
  });
}

export async function getHostSyncBatch(
  peerId: string,
  acknowledgedSequence: number,
  peerAddress?: string | null
): Promise<{ events: SyncEvent[]; cursor: number; hasMore: boolean }> {
  if (!Number.isSafeInteger(acknowledgedSequence) || acknowledgedSequence < 0) {
    throw new Error('The peer sent an invalid sync cursor.');
  }
  const database = await getLocalDatabase({ seedCatalog: false });
  let batch: { events: SyncEvent[]; cursor: number; hasMore: boolean } = {
    events: [],
    cursor: acknowledgedSequence,
    hasMore: false,
  };
  await withLocalTransaction(database, async (transaction) => {
    const peer = await transaction.getFirstAsync<{
      acknowledged_sequence: number;
      pending_sequence: number;
    }>(
      `SELECT acknowledged_sequence, pending_sequence
       FROM sync_peers WHERE device_id = ?`,
      peerId
    );
    if (!peer) {
      throw new Error('The requesting device is not paired with this sync group.');
    }
    const acknowledged =
      acknowledgedSequence <= peer.pending_sequence
        ? Math.max(peer.acknowledged_sequence, acknowledgedSequence)
        : peer.acknowledged_sequence;
    const rows = await transaction.getAllAsync<SyncEvent & { sequence: number }>(
      `SELECT rowid AS sequence, id, entity, entity_id, payload, changed_at, device_id
       FROM sync_events WHERE rowid > ? ORDER BY rowid LIMIT 500`,
      acknowledged
    );
    const cursor = rows.length > 0 ? rows[rows.length - 1].sequence : acknowledged;
    const next = await transaction.getFirstAsync<{ sequence: number }>(
      'SELECT rowid AS sequence FROM sync_events WHERE rowid > ? ORDER BY rowid LIMIT 1',
      cursor
    );
    await transaction.runAsync(
      `UPDATE sync_peers
       SET acknowledged_sequence = ?, pending_sequence = ?, last_seen = ?
       WHERE device_id = ?`,
      acknowledged,
      cursor,
      new Date().toISOString(),
      peerId
    );
    if (peerAddress) {
      await saveLanPeerAddress(transaction, peerId, peerAddress);
    }
    batch = {
      events: rows.map(({ sequence: _sequence, ...event }) => event),
      cursor,
      hasMore: Boolean(next),
    };
  });
  return batch;
}

const entityTables: Record<SyncEntity, string> = {
  books: 'books',
  profiles: 'profiles',
  borrowings: 'borrowings',
};

export async function applyRemoteSyncEvents(events: SyncEvent[]): Promise<void> {
  const database = await getLocalDatabase({ seedCatalog: false });
  const localDeviceId = await getDeviceId(database);

  await withLocalTransaction(database, async (transaction) => {
    const entityPriority: Record<SyncEntity, number> = {
      profiles: 0,
      books: 1,
      borrowings: 2,
    };
    const orderedEvents = [...events].sort((left, right) =>
      ((left?.entity ? entityPriority[left.entity] ?? 0 : 0) -
        (right?.entity ? entityPriority[right.entity] ?? 0 : 0)) ||
      Date.parse(String(left?.changed_at ?? '')) -
        Date.parse(String(right?.changed_at ?? '')) ||
      String(left?.device_id ?? '').localeCompare(String(right?.device_id ?? '')) ||
      String(left?.id ?? '').localeCompare(String(right?.id ?? ''))
    );
    for (const event of orderedEvents) {
      if (
        !event ||
        !['books', 'profiles', 'borrowings'].includes(event.entity) ||
        !event.id ||
        !event.entity_id ||
        !event.device_id ||
        !event.changed_at ||
        !Number.isFinite(Date.parse(event.changed_at)) ||
        (event.revision !== undefined &&
          (!Number.isSafeInteger(event.revision) || event.revision < 1))
      ) {
        throw new Error('The peer sent an invalid sync event.');
      }

      const exists = await transaction.getFirstAsync<{ id: string }>(
        'SELECT id FROM sync_events WHERE id = ?',
        event.id
      );
      if (exists) {
        continue;
      }

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(event.payload) as Record<string, unknown>;
      } catch {
        throw new Error(`The peer sent invalid data for sync event ${event.id}.`);
      }

      const table = entityTables[event.entity];
      const current = await transaction.getFirstAsync<{
        sync_changed_at: string;
        sync_device_id: string;
        sync_revision?: number;
        id: string;
      }>(
        `SELECT record.*, revisions.revision AS sync_revision
         FROM ${table} AS record
         LEFT JOIN sync_revisions AS revisions
           ON revisions.entity = ? AND revisions.entity_id = record.id
         WHERE record.id = ?`,
        event.entity,
        event.entity_id
      );

      const incomingRevision =
        Number.isSafeInteger(event.revision) && (event.revision ?? 0) > 0
          ? event.revision!
          : null;
      const winnerIsIncoming =
        !current ||
        (incomingRevision !== null && current.sync_revision !== undefined
          ? incomingRevision > current.sync_revision ||
            (incomingRevision === current.sync_revision &&
              (Date.parse(event.changed_at) > Date.parse(current.sync_changed_at) ||
                (Date.parse(event.changed_at) === Date.parse(current.sync_changed_at) &&
                  event.device_id > current.sync_device_id)))
          : Date.parse(event.changed_at) > Date.parse(current.sync_changed_at) ||
            (Date.parse(event.changed_at) === Date.parse(current.sync_changed_at) &&
              event.device_id > current.sync_device_id));

      if (
        current &&
        (Date.parse(event.changed_at) !== Date.parse(current.sync_changed_at) ||
          event.device_id !== current.sync_device_id)
      ) {
        await transaction.runAsync(
          `INSERT INTO sync_conflicts (
            event_id, entity, entity_id, kept_payload, superseded_payload, resolved_at
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          event.id,
          event.entity,
          event.entity_id,
          winnerIsIncoming ? event.payload : JSON.stringify(current),
          winnerIsIncoming ? JSON.stringify(current) : event.payload,
          new Date().toISOString()
        );
      }

      if (winnerIsIncoming) {
        await applyPayload(transaction, event, payload, localDeviceId);
        if (incomingRevision !== null) {
          await transaction.runAsync(
            `INSERT INTO sync_revisions (entity, entity_id, revision, changed_at, device_id)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(entity, entity_id) DO UPDATE SET
               revision = excluded.revision,
               changed_at = excluded.changed_at,
               device_id = excluded.device_id`,
            event.entity,
            event.entity_id,
            incomingRevision,
            event.changed_at,
            event.device_id
          );
        }
      }

      await transaction.runAsync(
        `INSERT INTO sync_events (id, entity, entity_id, payload, changed_at, device_id, revision, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        event.id,
        event.entity,
        event.entity_id,
        event.payload,
        event.changed_at,
        event.device_id,
        incomingRevision ?? 1,
        new Date().toISOString()
      );
    }
    await reconcileActiveBorrowingConflicts(transaction);
  });
}

async function reconcileActiveBorrowingConflicts(
  database: SQLiteDatabase
): Promise<void> {
  const booksWithCompetingLoans = await database.getAllAsync<{ book_id: string }>(
    `SELECT book_id FROM borrowings
     WHERE returned_at IS NULL AND sync_conflicted = 0
     GROUP BY book_id HAVING COUNT(*) > 1`
  );

  for (const { book_id: bookId } of booksWithCompetingLoans) {
    const activeLoans = await database.getAllAsync<Record<string, unknown> & {
      id: string;
      sync_revision: number;
      sync_changed_at: string;
      sync_device_id: string;
    }>(
        `SELECT borrowings.*,
                COALESCE(sync_revisions.revision, 1) AS sync_revision
         FROM borrowings
         LEFT JOIN sync_revisions
           ON sync_revisions.entity = 'borrowings'
          AND sync_revisions.entity_id = borrowings.id
         WHERE book_id = ? AND returned_at IS NULL AND sync_conflicted = 0`,
        bookId
      );
      activeLoans.sort((left, right) =>
        right.sync_revision - left.sync_revision ||
        Date.parse(right.sync_changed_at) - Date.parse(left.sync_changed_at) ||
      (right.sync_device_id > left.sync_device_id
        ? 1
        : right.sync_device_id < left.sync_device_id
          ? -1
          : 0)
    );
    const winner = activeLoans[0];
    if (!winner) {
      continue;
    }

    for (const superseded of activeLoans.slice(1)) {
      await database.runAsync(
        'UPDATE borrowings SET sync_conflicted = 1 WHERE id = ?',
        superseded.id
      );
      const sourceEvent = await database.getFirstAsync<{ id: string }>(
        `SELECT id FROM sync_events
         WHERE entity = 'borrowings' AND entity_id = ?
         ORDER BY changed_at DESC, device_id DESC, id DESC LIMIT 1`,
        superseded.id
      );
      await database.runAsync(
        `INSERT INTO sync_conflicts (
          event_id, entity, entity_id, kept_payload, superseded_payload, resolved_at
        ) VALUES (?, 'borrowings', ?, ?, ?, ?)`,
        sourceEvent?.id ?? superseded.id,
        superseded.id,
        JSON.stringify(winner),
        JSON.stringify(superseded),
        new Date().toISOString()
      );
    }
  }
}

async function applyPayload(
  database: SQLiteDatabase,
  event: SyncEvent,
  payload: Record<string, unknown>,
  localDeviceId: string
): Promise<void> {
  if (payload.id !== event.entity_id) {
    throw new Error(`Sync event ${event.id} does not match its record ID.`);
  }

  if (event.entity === 'books') {
    if (typeof payload.title !== 'string' || typeof payload.author !== 'string') {
      throw new Error(`Sync event ${event.id} has an invalid book record.`);
    }
    const coverPath = nullableString(payload.cover_path);
    await database.runAsync(
      `INSERT INTO books (
        id, serial_number, title, author, publisher, location, cost, category,
        cover_path, index_path, is_active, created_at, updated_at, sync_changed_at, sync_device_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        serial_number = excluded.serial_number,
        title = excluded.title,
        author = excluded.author,
        publisher = excluded.publisher,
        location = excluded.location,
        cost = excluded.cost,
        category = excluded.category,
        cover_path = excluded.cover_path,
        index_path = excluded.index_path,
        is_active = excluded.is_active,
        updated_at = excluded.updated_at,
        sync_changed_at = excluded.sync_changed_at,
        sync_device_id = excluded.sync_device_id`,
      event.entity_id,
      nullableString(payload.serial_number),
      payload.title,
      payload.author,
      nullableString(payload.publisher),
      nullableString(payload.location),
      nullableNumber(payload.cost),
      nullableString(payload.category),
      coverPath?.startsWith('file://') || coverPath?.startsWith('content://')
        ? null
        : coverPath,
      nullableString(payload.index_path),
      payload.is_active === true || payload.is_active === 1 ? 1 : 0,
      nullableString(payload.created_at) ?? event.changed_at,
      event.changed_at,
      event.changed_at,
      event.device_id || localDeviceId
    );
    return;
  }

  if (event.entity === 'profiles') {
    const username =
      typeof payload.username === 'string' && payload.username.trim()
        ? payload.username.trim().toLowerCase()
        : `user-${event.entity_id}`;
    await database.runAsync(
      `INSERT INTO profiles (
        id, username, password_salt, password_hash, full_name,
        mobile_number, subscription_start, subscription_expiry,
        is_enabled, created_at, role, is_library_subscriber, sync_changed_at, sync_device_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        password_salt = COALESCE(excluded.password_salt, profiles.password_salt),
        password_hash = COALESCE(excluded.password_hash, profiles.password_hash),
        full_name = excluded.full_name,
        mobile_number = excluded.mobile_number,
        subscription_start = excluded.subscription_start,
        subscription_expiry = excluded.subscription_expiry,
        is_enabled = excluded.is_enabled,
        created_at = excluded.created_at,
        role = excluded.role,
        is_library_subscriber = excluded.is_library_subscriber,
        sync_changed_at = excluded.sync_changed_at,
        sync_device_id = excluded.sync_device_id`,
      event.entity_id,
      username,
      nullableString(payload.password_salt),
      nullableString(payload.password_hash),
      nullableString(payload.full_name),
      nullableString(payload.mobile_number),
      nullableString(payload.subscription_start),
      nullableString(payload.subscription_expiry),
      payload.is_enabled === false || payload.is_enabled === 0 ? 0 : 1,
      nullableString(payload.created_at),
      payload.role === 'admin' ? 'admin' : 'subscriber',
      payload.is_library_subscriber === true || payload.is_library_subscriber === 1 ? 1 : 0,
      event.changed_at,
      event.device_id
    );
    return;
  }

  if (
    typeof payload.book_id !== 'string' ||
    typeof payload.subscriber_id !== 'string' ||
    typeof payload.issued_at !== 'string'
  ) {
    throw new Error(`Sync event ${event.id} has an invalid borrowing record.`);
  }
  await database.runAsync(
    `INSERT INTO borrowings (
      id, book_id, subscriber_id, issued_at, due_date, returned_at,
      issued_by, received_by, notes, sync_changed_at, sync_device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      book_id = excluded.book_id,
      subscriber_id = excluded.subscriber_id,
      issued_at = excluded.issued_at,
      due_date = excluded.due_date,
      returned_at = excluded.returned_at,
      issued_by = excluded.issued_by,
      received_by = excluded.received_by,
      notes = excluded.notes,
      sync_changed_at = excluded.sync_changed_at,
      sync_device_id = excluded.sync_device_id,
      sync_conflicted = 0`,
    event.entity_id,
    payload.book_id,
    payload.subscriber_id,
    payload.issued_at,
    nullableString(payload.due_date),
    nullableString(payload.returned_at),
    nullableString(payload.issued_by),
    nullableString(payload.received_by),
    nullableString(payload.notes),
    event.changed_at,
    event.device_id
  );
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function getLocalMetadata(key: string): Promise<string | null> {
  const database = await getLocalDatabase({ seedCatalog: false });
  const row = await database.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_metadata WHERE key = ?',
    key
  );
  return row?.value ?? null;
}

export async function setLocalMetadata(key: string, value: string): Promise<void> {
  const database = await getLocalDatabase({ seedCatalog: false });
  await withLocalTransaction(database, async (transaction) => {
    await transaction.runAsync(
      'INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)',
      key,
      value
    );
  });
}
