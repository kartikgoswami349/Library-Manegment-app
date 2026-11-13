import type { SQLiteDatabase } from 'expo-sqlite';

import {
  appendLocalEvent,
  createLocalId,
  getLocalDatabase,
  getLocalDeviceId,
  withLocalTransaction,
  type LocalBook,
  type LocalBorrowing,
  type LocalProfile,
} from './local-database';

type BookRow = Omit<
  LocalBook,
  'is_active' | 'is_available' | 'cover_url' | 'serial_number'
> & {
  serial_number: string | null;
  is_active: number;
  is_available: number;
  sync_changed_at: string;
  sync_device_id: string;
};

type ProfileRow = Omit<LocalProfile, 'is_enabled' | 'is_library_subscriber'> & {
  is_enabled: number;
  is_library_subscriber: number;
  password_salt: string | null;
  password_hash: string | null;
  sync_changed_at: string;
  sync_device_id: string;
};

type BorrowingRow = LocalBorrowing & {
  sync_changed_at: string;
  sync_device_id: string;
};

function mapBook(row: BookRow): LocalBook {
  return {
    ...row,
    serial_number: row.serial_number ?? '',
    is_active: Boolean(row.is_active),
    is_available: Boolean(row.is_available),
    cover_url: null,
  };
}

function mapProfile(row: ProfileRow): LocalProfile {
  return {
    id: row.id,
    username: row.username,
    full_name: row.full_name,
    mobile_number: row.mobile_number,
    subscription_start: row.subscription_start,
    subscription_expiry: row.subscription_expiry,
    is_enabled: Boolean(row.is_enabled),
    created_at: row.created_at,
    role: row.role,
    is_library_subscriber: Boolean(row.is_library_subscriber),
  };
}

function bookPayload(
  book: LocalBook,
  changedAt: string
): Record<string, unknown> {
  return {
    id: book.id,
    serial_number: book.serial_number,
    title: book.title,
    author: book.author,
    publisher: book.publisher,
    location: book.location,
    cost: book.cost,
    category: book.category,
    cover_path: book.cover_path,
    index_path: book.index_path,
    is_active: book.is_active,
    created_at: book.created_at,
    updated_at: changedAt,
  };
}

function profilePayload(
  profile: LocalProfile,
  credentials?: { password_salt: string; password_hash: string }
): Record<string, unknown> {
  return {
    id: profile.id,
    username: profile.username,
    full_name: profile.full_name,
    mobile_number: profile.mobile_number,
    subscription_start: profile.subscription_start,
    subscription_expiry: profile.subscription_expiry,
    is_enabled: profile.is_enabled,
    created_at: profile.created_at,
    role: profile.role,
    is_library_subscriber: profile.is_library_subscriber,
    ...(credentials ?? {}),
  };
}

function borrowingPayload(
  borrowing: LocalBorrowing
): Record<string, unknown> {
  return { ...borrowing };
}

async function saveBook(
  database: SQLiteDatabase,
  book: LocalBook,
  changedAt: string,
  deviceId: string
): Promise<void> {
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
    book.id,
    book.serial_number,
    book.title,
    book.author,
    book.publisher,
    book.location,
    book.cost,
    book.category,
    book.cover_path,
    book.index_path,
    Number(book.is_active),
    book.created_at,
    changedAt,
    changedAt,
    deviceId
  );
  await appendLocalEvent(
    database,
    'books',
    book.id,
    bookPayload(book, changedAt),
    changedAt,
    deviceId
  );
}

async function saveProfile(
  database: SQLiteDatabase,
  profile: LocalProfile,
  changedAt: string,
  deviceId: string
): Promise<void> {
  await database.runAsync(
    `INSERT INTO profiles (
      id, username, full_name, mobile_number, subscription_start, subscription_expiry,
      is_enabled, created_at, role, is_library_subscriber, sync_changed_at, sync_device_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      username = excluded.username,
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
    profile.id,
    profile.username,
    profile.full_name,
    profile.mobile_number,
    profile.subscription_start,
    profile.subscription_expiry,
    Number(profile.is_enabled),
    profile.created_at,
    profile.role,
    Number(profile.is_library_subscriber),
    changedAt,
    deviceId
  );
  await appendLocalEvent(
    database,
    'profiles',
    profile.id,
    profilePayload(profile),
    changedAt,
    deviceId
  );
}

async function saveBorrowing(
  database: SQLiteDatabase,
  borrowing: LocalBorrowing,
  changedAt: string,
  deviceId: string
): Promise<void> {
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
      sync_device_id = excluded.sync_device_id`,
    borrowing.id,
    borrowing.book_id,
    borrowing.subscriber_id,
    borrowing.issued_at,
    borrowing.due_date,
    borrowing.returned_at,
    borrowing.issued_by,
    borrowing.received_by,
    borrowing.notes,
    changedAt,
    deviceId
  );
  await appendLocalEvent(
    database,
    'borrowings',
    borrowing.id,
    borrowingPayload(borrowing),
    changedAt,
    deviceId
  );
}

export async function searchLocalBooks(
  searchText = '',
  searchBy: 'title' | 'author' | 'publisher' | 'serial' | 'category' = 'title',
  adminView = false,
  availableOnly = false,
  offset = 0,
  limit = 10000
): Promise<LocalBook[]> {
  const database = await getLocalDatabase();
  const searchColumns = {
    title: 'b.title',
    author: 'b.author',
    publisher: 'b.publisher',
    serial: 'b.serial_number',
    category: 'b.category',
  } as const;
  const term = `%${searchText.trim().toLocaleLowerCase()}%`;
  const rows = await database.getAllAsync<BookRow>(
    `SELECT b.*,
      CASE WHEN EXISTS (
        SELECT 1 FROM borrowings r
        WHERE r.book_id = b.id AND r.returned_at IS NULL
          AND r.sync_conflicted = 0
      ) THEN 0 ELSE 1 END AS is_available
     FROM books b
     WHERE (? = 1 OR b.is_active = 1)
       AND (? = 0 OR NOT EXISTS (
         SELECT 1 FROM borrowings r
         WHERE r.book_id = b.id AND r.returned_at IS NULL
           AND r.sync_conflicted = 0
           AND r.sync_conflicted = 0
       ))
       AND (? = '%%' OR (
         (? = 1 AND (
           LOWER(COALESCE(b.title, '')) LIKE ? OR
           LOWER(COALESCE(b.author, '')) LIKE ? OR
           LOWER(COALESCE(b.publisher, '')) LIKE ? OR
           LOWER(COALESCE(b.serial_number, '')) LIKE ? OR
           LOWER(COALESCE(b.category, '')) LIKE ?
         )) OR
         (? = 0 AND LOWER(COALESCE(${searchColumns[searchBy]}, '')) LIKE ?)
       ))
     ORDER BY b.title COLLATE NOCASE
     LIMIT ? OFFSET ?`,
    Number(adminView),
    Number(availableOnly),
    term,
    Number(adminView),
    term,
    term,
    term,
    term,
    term,
    Number(adminView),
    term,
    Math.max(0, limit),
    Math.max(0, offset)
  );
  return rows.map(mapBook);
}

export async function countLocalBooks(
  searchText = '',
  adminView = false
): Promise<number> {
  const database = await getLocalDatabase();
  const term = `%${searchText.trim().toLocaleLowerCase()}%`;
  const row = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM books b
     WHERE (? = 1 OR b.is_active = 1)
       AND (? = '%%' OR LOWER(b.title) LIKE ? OR
         LOWER(COALESCE(b.author, '')) LIKE ? OR
         LOWER(COALESCE(b.serial_number, '')) LIKE ? OR
         LOWER(COALESCE(b.category, '')) LIKE ?)`,
    Number(adminView),
    term,
    term,
    term,
    term
  );
  return row?.count ?? 0;
}

export async function getLocalBookById(bookId: string): Promise<LocalBook | null> {
  const database = await getLocalDatabase();
  const row = await database.getFirstAsync<BookRow>(
    `SELECT b.*,
      CASE WHEN EXISTS (
        SELECT 1 FROM borrowings r
        WHERE r.book_id = b.id AND r.returned_at IS NULL
          AND r.sync_conflicted = 0
      ) THEN 0 ELSE 1 END AS is_available
     FROM books b WHERE b.id = ?`,
    bookId
  );
  return row ? mapBook(row) : null;
}

export async function createLocalBook(
  values: Omit<LocalBook, 'id' | 'is_available' | 'cover_url' | 'created_at'>
): Promise<LocalBook> {
  const database = await getLocalDatabase();
  const deviceId = await getLocalDeviceId();
  const now = new Date().toISOString();
  const book: LocalBook = {
    ...values,
    id: createLocalId(),
    is_available: true,
    cover_url: null,
    created_at: now,
  };
  await withLocalTransaction(database, (transaction) =>
    saveBook(transaction, book, now, deviceId)
  );
  return book;
}

export async function updateLocalBook(
  bookId: string,
  updates: Partial<Omit<LocalBook, 'id' | 'is_available' | 'cover_url'>>
): Promise<LocalBook> {
  const database = await getLocalDatabase();
  const existing = await getLocalBookById(bookId);
  if (!existing) {
    throw new Error('The book could not be found in the local library.');
  }
  const deviceId = await getLocalDeviceId();
  const now = new Date().toISOString();
  const updated: LocalBook = {
    ...existing,
    ...updates,
    id: bookId,
    is_available: existing.is_available,
    cover_url: null,
  };
  await withLocalTransaction(database, (transaction) =>
    saveBook(transaction, updated, now, deviceId)
  );
  return updated;
}

export async function localSerialExists(
  serialNumber: string,
  exceptBookId?: string
): Promise<boolean> {
  const database = await getLocalDatabase();
  const row = await database.getFirstAsync<{ id: string }>(
    `SELECT id FROM books
     WHERE TRIM(COALESCE(serial_number, '')) = ? AND (? IS NULL OR id != ?)
     LIMIT 1`,
    serialNumber.trim(),
    exceptBookId ?? null,
    exceptBookId ?? null
  );
  return Boolean(row);
}

export async function listLocalProfiles(
  searchText = '',
  role?: LocalProfile['role']
): Promise<LocalProfile[]> {
  const database = await getLocalDatabase();
  const term = `%${searchText.trim().toLocaleLowerCase()}%`;
  const rows = await database.getAllAsync<ProfileRow>(
    `SELECT * FROM profiles
     WHERE (? IS NULL OR role = ?)
       AND (? = 0 OR is_library_subscriber = 1)
       AND (? = '%%' OR LOWER(COALESCE(full_name, '')) LIKE ? OR
         LOWER(COALESCE(username, '')) LIKE ?)
     ORDER BY COALESCE(full_name, username, id) COLLATE NOCASE`,
    role ?? null,
    role ?? null,
    Number(role === 'subscriber'),
    term,
    term,
    term
  );
  return rows.map(mapProfile);
}

export async function createLocalSubscriber(
  fullName: string,
  mobileNumber: string
): Promise<LocalProfile> {
  const name = fullName.trim();
  if (!name) {
    throw new Error('Subscriber name is required.');
  }
  const database = await getLocalDatabase();
  const deviceId = await getLocalDeviceId();
  const id = createLocalId();
  const now = new Date().toISOString();
  const profile: LocalProfile = {
    id,
    username: `subscriber-${id.slice(0, 8)}`,
    full_name: name,
    mobile_number: mobileNumber.trim() || null,
    subscription_start: null,
    subscription_expiry: null,
    is_enabled: true,
    created_at: now,
    role: 'subscriber',
    is_library_subscriber: true,
  };
  await withLocalTransaction(database, (transaction) =>
    saveProfile(transaction, profile, now, deviceId)
  );
  return profile;
}

export async function getLocalProfile(userId: string): Promise<LocalProfile | null> {
  const database = await getLocalDatabase();
  const row = await database.getFirstAsync<ProfileRow>(
    'SELECT * FROM profiles WHERE id = ?',
    userId
  );
  return row ? mapProfile(row) : null;
}

export async function updateLocalProfile(
  userId: string,
  updates: Partial<LocalProfile>
): Promise<void> {
  const existing = await getLocalProfile(userId);
  if (!existing) {
    throw new Error(
      'This profile is not available offline yet. Connect once to load it before editing.'
    );
  }
  const database = await getLocalDatabase();
  const deviceId = await getLocalDeviceId();
  const updated = { ...existing, ...updates, id: userId };
  await withLocalTransaction(database, (transaction) =>
    saveProfile(transaction, updated, new Date().toISOString(), deviceId)
  );
}

export async function deleteLocalSubscriber(userId: string): Promise<void> {
  const existing = await getLocalProfile(userId);
  if (!existing || existing.role !== 'subscriber' || !existing.is_library_subscriber) {
    throw new Error('This subscriber is not available for deletion.');
  }

  const database = await getLocalDatabase();
  const borrowing = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM borrowings WHERE subscriber_id = ?',
    userId
  );

  // Keep the profile as a hidden tombstone when loan history references it.
  await updateLocalProfile(userId, {
    is_enabled: false,
    is_library_subscriber: false,
  });

  if ((borrowing?.count ?? 0) > 0) {
    return;
  }
}

export async function createLocalBorrowing(
  bookId: string,
  subscriberId: string,
  dueDate: string | null,
  notes: string | null,
  issuedBy: string | null
): Promise<string> {
  const database = await getLocalDatabase();
  const deviceId = await getLocalDeviceId();
  const now = new Date().toISOString();
  const borrowing: LocalBorrowing = {
    id: createLocalId(),
    book_id: bookId,
    subscriber_id: subscriberId,
    issued_at: now,
    due_date: dueDate,
    returned_at: null,
    issued_by: issuedBy,
    received_by: null,
    notes,
  };
  await withLocalTransaction(database, async (transaction) => {
    const book = await transaction.getFirstAsync<{
      is_active: number;
      issued: number;
    }>(
      `SELECT b.is_active,
        EXISTS (
          SELECT 1 FROM borrowings r
          WHERE r.book_id = b.id AND r.returned_at IS NULL
        ) AS issued
       FROM books b WHERE b.id = ?`,
      bookId
    );
    if (!book || !book.is_active) {
      throw new Error('This book is not available in the local library.');
    }
    if (book.issued) {
      throw new Error('This book is already issued on this device.');
    }

    const profile = await transaction.getFirstAsync<{
      is_enabled: number;
      role: LocalProfile['role'];
      is_library_subscriber: number;
    }>(
      'SELECT is_enabled, role, is_library_subscriber FROM profiles WHERE id = ?',
      subscriberId
    );
    if (!profile) {
      throw new Error(
        'This subscriber is not available offline yet. Connect once to load the profile before issuing a book.'
      );
    }
    if (!profile.is_enabled || profile.role !== 'subscriber' || !profile.is_library_subscriber) {
      throw new Error('This subscriber is not enabled for borrowing.');
    }
    await saveBorrowing(transaction, borrowing, now, deviceId);
  });
  return borrowing.id;
}

export async function returnLocalBorrowing(
  borrowingId: string,
  receivedBy: string | null
): Promise<void> {
  const database = await getLocalDatabase();
  const deviceId = await getLocalDeviceId();
  await withLocalTransaction(database, async (transaction) => {
    const borrowing = await transaction.getFirstAsync<LocalBorrowing>(
      'SELECT * FROM borrowings WHERE id = ?',
      borrowingId
    );
    if (!borrowing) {
      throw new Error('The borrowing record could not be found locally.');
    }
    if (borrowing.returned_at) {
      return;
    }
    const updated = {
      ...borrowing,
      returned_at: new Date().toISOString(),
      received_by: receivedBy,
    };
    await saveBorrowing(transaction, updated, updated.returned_at, deviceId);
  });
}

export type JoinedBorrowing = BorrowingRow & {
  serial_number: string | null;
  title: string;
  author: string;
  publisher: string | null;
  cover_path: string | null;
  subscriber_name: string | null;
  subscriber_username: string | null;
  issued_by_name: string | null;
  received_by_name: string | null;
};

async function getJoinedBorrowings(
  where: string,
  values: Array<string | number | null>,
  orderBy: string
): Promise<JoinedBorrowing[]> {
  const database = await getLocalDatabase();
  return database.getAllAsync<JoinedBorrowing>(
    `SELECT r.*, b.serial_number, b.title, b.author, b.publisher, b.cover_path,
      p.full_name AS subscriber_name, p.username AS subscriber_username,
      issuer.full_name AS issued_by_name, receiver.full_name AS received_by_name
     FROM borrowings r
     LEFT JOIN books b ON b.id = r.book_id
     LEFT JOIN profiles p ON p.id = r.subscriber_id
     LEFT JOIN profiles issuer ON issuer.id = r.issued_by
     LEFT JOIN profiles receiver ON receiver.id = r.received_by
     ${where}
     ORDER BY ${orderBy}`,
    ...values
  );
}

export async function listLocalActiveBorrowings(
  searchText = ''
): Promise<JoinedBorrowing[]> {
  const term = `%${searchText.trim().toLocaleLowerCase()}%`;
  return getJoinedBorrowings(
    `WHERE r.returned_at IS NULL AND r.sync_conflicted = 0 AND (
      ? = '%%' OR LOWER(COALESCE(b.title, '')) LIKE ? OR
      LOWER(COALESCE(b.serial_number, '')) LIKE ? OR
      LOWER(COALESCE(p.full_name, '')) LIKE ? OR
      LOWER(COALESCE(p.username, '')) LIKE ?
    )`,
    [term, term, term, term, term],
    'r.issued_at DESC'
  );
}

export async function listLocalBorrowingHistory(
  searchText = '',
  status = 'all'
): Promise<JoinedBorrowing[]> {
  const term = `%${searchText.trim().toLocaleLowerCase()}%`;
  const overdue = `r.returned_at IS NULL AND r.due_date IS NOT NULL AND date(r.due_date) < date('now')`;
  const statusClause =
    status === 'issued'
      ? `AND r.returned_at IS NULL AND NOT (${overdue})`
      : status === 'overdue'
        ? `AND ${overdue}`
        : status === 'returned'
          ? 'AND r.returned_at IS NOT NULL'
          : '';
  return getJoinedBorrowings(
    `WHERE (? = '%%' OR LOWER(COALESCE(b.title, '')) LIKE ? OR
      LOWER(COALESCE(b.serial_number, '')) LIKE ? OR
      LOWER(COALESCE(p.full_name, '')) LIKE ? OR
      LOWER(COALESCE(p.username, '')) LIKE ?)
      ${statusClause}`,
    [term, term, term, term, term],
    'COALESCE(r.returned_at, r.issued_at) DESC'
  );
}

export async function listLocalMyBorrowings(
  subscriberId: string,
  status = 'all'
): Promise<JoinedBorrowing[]> {
  const overdue = `r.returned_at IS NULL AND r.due_date IS NOT NULL AND date(r.due_date) < date('now')`;
  const statusClause =
    status === 'issued'
      ? `AND r.returned_at IS NULL AND NOT (${overdue})`
      : status === 'overdue'
        ? `AND ${overdue}`
        : status === 'returned'
          ? 'AND r.returned_at IS NOT NULL'
          : '';
  return getJoinedBorrowings(
    `WHERE r.subscriber_id = ? ${statusClause}`,
    [subscriberId],
    'COALESCE(r.returned_at, r.issued_at) DESC'
  );
}

export async function getLocalDashboardStats(): Promise<{
  total_books: number;
  available_books: number;
  issued_books: number;
  catalog_titles: number;
  total_subscribers: number;
  enabled_subscribers: number;
  overdue_books: number;
  total_admins: number;
}> {
  const database = await getLocalDatabase();
  const row = await database.getFirstAsync<{
    total_books: number;
    available_books: number;
    issued_books: number;
    catalog_titles: number;
    total_subscribers: number;
    enabled_subscribers: number;
    overdue_books: number;
    total_admins: number;
  }>(
    `SELECT
      (SELECT COUNT(*) FROM books WHERE is_active = 1) AS total_books,
      (SELECT COUNT(*) FROM books b WHERE b.is_active = 1 AND NOT EXISTS (
        SELECT 1 FROM borrowings r
        WHERE r.book_id = b.id AND r.returned_at IS NULL
          AND r.sync_conflicted = 0
      )) AS available_books,
      (SELECT COUNT(*) FROM borrowings
        WHERE returned_at IS NULL AND sync_conflicted = 0) AS issued_books,
      (SELECT COUNT(DISTINCT title) FROM books WHERE is_active = 1) AS catalog_titles,
      (SELECT COUNT(*) FROM profiles WHERE role = 'subscriber') AS total_subscribers,
      (SELECT COUNT(*) FROM profiles WHERE role = 'subscriber' AND is_enabled = 1) AS enabled_subscribers,
      (SELECT COUNT(*) FROM borrowings
        WHERE returned_at IS NULL AND sync_conflicted = 0 AND due_date IS NOT NULL
        AND date(due_date) < date('now')) AS overdue_books,
      (SELECT COUNT(*) FROM profiles WHERE role = 'admin') AS total_admins`
  );
  return row ?? {
    total_books: 0,
    available_books: 0,
    issued_books: 0,
    catalog_titles: 0,
    total_subscribers: 0,
    enabled_subscribers: 0,
    overdue_books: 0,
    total_admins: 0,
  };
}

export async function listLocalRecentActivity(): Promise<Array<{
  action_type: 'issued' | 'returned';
  action_at: string;
  book_id: string;
  serial_number: string;
  title: string;
  subscriber_name: string | null;
  admin_name: string | null;
}>> {
  const rows = await getJoinedBorrowings('', [], 'r.issued_at DESC');
  const recentActivity: Array<{
    action_type: 'issued' | 'returned';
    action_at: string;
    book_id: string;
    serial_number: string;
    title: string;
    subscriber_name: string | null;
    admin_name: string | null;
  }> = [];

  for (const borrowing of rows) {
    recentActivity.push({
      action_type: 'issued',
      action_at: borrowing.issued_at,
      book_id: borrowing.book_id,
      serial_number: borrowing.serial_number ?? '',
      title: borrowing.title ?? '',
      subscriber_name: borrowing.subscriber_name,
      admin_name: borrowing.issued_by_name,
    });

    if (borrowing.returned_at) {
      recentActivity.push({
        action_type: 'returned',
        action_at: borrowing.returned_at,
        book_id: borrowing.book_id,
        serial_number: borrowing.serial_number ?? '',
        title: borrowing.title ?? '',
        subscriber_name: borrowing.subscriber_name,
        admin_name: borrowing.received_by_name,
      });
    }
  }

  return recentActivity
    .sort((left, right) => right.action_at.localeCompare(left.action_at))
    .slice(0, 10);
}

export async function getLocalEventCount(): Promise<number> {
  const database = await getLocalDatabase();
  const deviceId = await getLocalDeviceId();
  const row = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM sync_events AS event
     WHERE (
       NOT EXISTS (SELECT 1 FROM sync_peers WHERE device_id <> ?)
       AND event.synced_at IS NULL
     ) OR EXISTS (
       SELECT 1 FROM sync_peers AS peer
       WHERE peer.device_id <> ?
         AND NOT EXISTS (
           SELECT 1 FROM sync_peer_events AS sent
           WHERE sent.peer_device_id = peer.device_id AND sent.event_id = event.id
         )
     )`,
    deviceId,
    deviceId
  );
  return row?.count ?? 0;
}
