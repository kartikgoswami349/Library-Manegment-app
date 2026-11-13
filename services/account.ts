import { getLocalProfile, listLocalMyBorrowings, updateLocalProfile } from '../lib/local-library';
import { getUserAccess } from '../lib/user-cache';

export type MyProfile = {
  id: string;
  username: string;
  full_name: string | null;
  mobile_number: string | null;
  subscription_start: string | null;
  subscription_expiry: string | null;
  is_enabled: boolean;
  created_at: string | null;
};

export type MyBorrowing = {
  borrowing_id: string;
  book_id: string;
  serial_number: string;
  title: string;
  author: string;
  publisher: string | null;
  cover_path: string | null;
  cover_url?: string | null;
  issued_at: string;
  due_date: string | null;
  returned_at: string | null;
  notes: string | null;
  status: 'issued' | 'overdue' | 'returned';
};

export async function getMyProfile(): Promise<MyProfile | null> {
  const access = await getUserAccess();
  if (!access) {
    return null;
  }
  const profile = await getLocalProfile(access.id);
  if (!profile) {
    return null;
  }
  return {
    id: profile.id,
    username: profile.username,
    full_name: profile.full_name,
    mobile_number: profile.mobile_number,
    subscription_start: profile.subscription_start,
    subscription_expiry: profile.subscription_expiry,
    is_enabled: profile.is_enabled,
    created_at: profile.created_at,
  };
}

export async function updateMyProfile(
  fullName: string,
  mobileNumber: string
): Promise<void> {
  const access = await getUserAccess();
  if (!access) {
    throw new Error('You must be signed in to update your profile.');
  }
  await updateLocalProfile(access.id, {
    full_name: fullName.trim() || null,
    mobile_number: mobileNumber.trim() || null,
  });
}

export async function getMyBorrowings(
  status: 'all' | 'issued' | 'overdue' | 'returned' = 'all'
): Promise<MyBorrowing[]> {
  const access = await getUserAccess();
  if (!access) {
    throw new Error('You must be signed in to view your borrowings.');
  }
  const rows = await listLocalMyBorrowings(access.id, status);
  return rows.map((row) => ({
    borrowing_id: row.id,
    book_id: row.book_id,
    serial_number: row.serial_number ?? '',
    title: row.title ?? '',
    author: row.author ?? '',
    publisher: row.publisher,
    cover_path: row.cover_path,
    cover_url:
      row.cover_path?.startsWith('file://') ||
      row.cover_path?.startsWith('content://')
        ? row.cover_path
        : null,
    issued_at: row.issued_at,
    due_date: row.due_date,
    returned_at: row.returned_at,
    notes: row.notes,
    status: row.returned_at
      ? 'returned'
      : row.due_date && Date.parse(`${row.due_date}T23:59:59`) < Date.now()
        ? 'overdue'
        : 'issued',
  }));
}
