import {
  createLocalBorrowing,
  listLocalActiveBorrowings,
  listLocalBorrowingHistory,
  returnLocalBorrowing,
} from '../lib/local-library';
import { getUserAccess } from '../lib/user-cache';

export async function issueBook(
  bookId: string,
  subscriberId: string,
  dueDate: string | null,
  notes: string | null
): Promise<string> {
  const access = await getUserAccess();
  return createLocalBorrowing(
    bookId,
    subscriberId,
    dueDate,
    notes,
    access?.id ?? null
  );
}

export type ActiveBorrowing = {
  borrowing_id: string;
  book_id: string;
  serial_number: string;
  title: string;
  author: string;
  publisher: string | null;
  cover_path: string | null;
  cover_url?: string | null;
  subscriber_id: string;
  subscriber_name: string | null;
  subscriber_username: string | null;
  issued_at: string;
  due_date: string | null;
  notes: string | null;
};

function mapBorrowing(row: Awaited<ReturnType<typeof listLocalActiveBorrowings>>[number]) {
  return {
    borrowing_id: row.id,
    book_id: row.book_id,
    serial_number: row.serial_number ?? '',
    title: row.title ?? '',
    author: row.author ?? '',
    publisher: row.publisher,
    cover_path: row.cover_path,
    cover_url: null,
    subscriber_id: row.subscriber_id,
    subscriber_name: row.subscriber_name,
    subscriber_username: row.subscriber_username,
    issued_at: row.issued_at,
    due_date: row.due_date,
    notes: row.notes,
  };
}

export async function searchActiveBorrowings(
  searchText = ''
): Promise<ActiveBorrowing[]> {
  const rows = await listLocalActiveBorrowings(searchText);
  return rows.map(mapBorrowing);
}

export async function receiveBook(borrowingId: string): Promise<void> {
  const access = await getUserAccess();
  await returnLocalBorrowing(borrowingId, access?.id ?? null);
}

export type BorrowingHistoryItem = {
  borrowing_id: string;
  book_id: string;
  serial_number: string;
  title: string;
  author: string;
  publisher: string | null;
  cover_path: string | null;
  cover_url?: string | null;
  subscriber_id: string;
  subscriber_name: string | null;
  subscriber_username: string | null;
  issued_at: string;
  due_date: string | null;
  returned_at: string | null;
  issued_by: string | null;
  issued_by_name: string | null;
  received_by: string | null;
  received_by_name: string | null;
  notes: string | null;
  status: 'issued' | 'returned' | 'overdue';
};

export async function searchBorrowingHistory(
  searchText = '',
  status = 'all'
): Promise<BorrowingHistoryItem[]> {
  const rows = await listLocalBorrowingHistory(searchText, status);
  return rows.map((row) => ({
    borrowing_id: row.id,
    book_id: row.book_id,
    serial_number: row.serial_number ?? '',
    title: row.title ?? '',
    author: row.author ?? '',
    publisher: row.publisher,
    cover_path: row.cover_path,
    cover_url: null,
    subscriber_id: row.subscriber_id,
    subscriber_name: row.subscriber_name,
    subscriber_username: row.subscriber_username,
    issued_at: row.issued_at,
    due_date: row.due_date,
    returned_at: row.returned_at,
    issued_by: row.issued_by,
    issued_by_name: row.issued_by_name,
    received_by: row.received_by,
    received_by_name: row.received_by_name,
    notes: row.notes,
    status: row.returned_at
      ? 'returned'
      : row.due_date && Date.parse(`${row.due_date}T23:59:59`) < Date.now()
        ? 'overdue'
        : 'issued',
  }));
}
