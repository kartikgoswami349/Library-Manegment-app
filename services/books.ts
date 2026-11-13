import { Buffer } from 'buffer';
import { Platform } from 'react-native';

import {
  countLocalBooks,
  createLocalBook,
  getLocalBookById,
  localSerialExists,
  searchLocalBooks,
  updateLocalBook,
} from '../lib/local-library';

export type SearchMode =
  | 'title'
  | 'author'
  | 'publisher'
  | 'serial'
  | 'category';

export type LibraryBook = {
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
  is_available: boolean;
  cover_url: string | null;
};

function addLocalCoverUrl(book: LibraryBook): LibraryBook {
  const coverUrl = book.cover_path?.trim() || null;
  return { ...book, cover_url: coverUrl };
}

function mimeTypeForUri(uri: string): string {
  const extension = uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  return 'image/jpeg';
}

function localFilePathFromUri(uri: string): string {
  if (!uri.toLowerCase().startsWith('file://')) {
    return uri;
  }

  const parsed = new URL(uri);
  const decodedPath = decodeURIComponent(parsed.pathname);
  if (parsed.hostname && parsed.hostname !== 'localhost') {
    return `\\\\${parsed.hostname}${decodedPath.replace(/\//g, '\\')}`;
  }
  return decodedPath.replace(/^\/([A-Za-z]:\/)/, '$1');
}

async function toPersistentWebCover(uri: string): Promise<string> {
  if (uri.startsWith('data:')) {
    return uri;
  }

  const desktop = typeof window !== 'undefined' ? window.libraryDesktop : null;
  if (desktop?.isElectron && (uri.startsWith('file://') || /^[A-Za-z]:[\\/]/.test(uri))) {
    const file = await desktop.readFile(localFilePathFromUri(uri));
    return `data:${mimeTypeForUri(uri)};base64,${file.data}`;
  }

  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Unable to read the selected cover image (${response.status}).`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return `data:${response.headers.get('content-type') || mimeTypeForUri(uri)};base64,${Buffer.from(bytes).toString('base64')}`;
}

export async function uploadBookCover(
  imageUri: string,
  _serialNumber: string
): Promise<string> {
  return Platform.OS === 'web' ? toPersistentWebCover(imageUri) : imageUri;
}

export async function searchLibraryBooks(
  searchText = '',
  searchBy: SearchMode = 'title'
): Promise<LibraryBook[]> {
  const books = await searchLocalBooks(searchText, searchBy, false, true);
  return books.map(addLocalCoverUrl);
}

export async function getCatalogBooks(
  offset = 0,
  limit = 30
): Promise<{ books: LibraryBook[]; total: number }> {
  const [books, total] = await Promise.all([
    searchLocalBooks('', 'title', false, false, offset, limit),
    countLocalBooks(),
  ]);
  return { books: books.map(addLocalCoverUrl), total };
}

export async function getLibraryBookById(
  bookId: string
): Promise<LibraryBook | null> {
  const book = await getLocalBookById(bookId);
  return book ? addLocalCoverUrl(book) : null;
}

export type NewBookInput = {
  serial_number: string;
  title: string;
  author: string;
  publisher: string | null;
  location: string | null;
  cost: number | null;
  category: string | null;
  cover_path: string | null;
};

export async function createBook(book: NewBookInput) {
  return createLocalBook({
    serial_number: book.serial_number.trim(),
    title: book.title.trim(),
    author: book.author.trim(),
    publisher: book.publisher?.trim() || null,
    location: book.location?.trim() || null,
    cost: book.cost,
    category: book.category?.trim() || null,
    cover_path: book.cover_path,
    index_path: null,
    is_active: true,
  });
}

export async function serialNumberExists(serialNumber: string): Promise<boolean> {
  return localSerialExists(serialNumber);
}

export type AdminBook = LibraryBook & {
  is_active: boolean;
};

export async function searchAdminBooks(
  searchText = '',
  searchBy: SearchMode = 'title'
): Promise<AdminBook[]> {
  const books = await searchLocalBooks(searchText, searchBy, true);
  const desktop = typeof window !== 'undefined' ? window.libraryDesktop : null;
  return Promise.all(
    books.map(async (book) => {
      const coverPath = book.cover_path?.trim() || null;
      const isLocalFile =
        coverPath?.toLowerCase().startsWith('file://') ||
        (coverPath !== null && /^[A-Za-z]:[\\/]/.test(coverPath));
      let coverUrl = coverPath;

      if (coverPath && isLocalFile && desktop?.isElectron) {
        try {
          const file = await desktop.readFile(localFilePathFromUri(coverPath));
          coverUrl = `data:${mimeTypeForUri(coverPath)};base64,${file.data}`;
        } catch (error) {
          console.warn(`Unable to load the cover for book ${book.id}:`, error);
          coverUrl = null;
        }
      }

      return {
        ...book,
        cover_url: coverUrl,
        is_active: book.is_active,
      };
    })
  );
}

export async function getAdminBookById(
  bookId: string
): Promise<AdminBook | null> {
  const book = await getLocalBookById(bookId);
  return book
    ? { ...addLocalCoverUrl(book), is_active: book.is_active }
    : null;
}

export async function deleteBookCover(_filePath: string): Promise<void> {
  // Covers are local image URIs, not remote storage objects.
}

export async function updateBook(
  bookId: string,
  updates: {
    serial_number: string;
    title: string;
    author: string;
    publisher: string | null;
    location: string | null;
    cost: number | null;
    category: string | null;
    cover_path?: string | null;
  }
) {
  return updateLocalBook(bookId, {
    serial_number: updates.serial_number.trim(),
    title: updates.title.trim(),
    author: updates.author.trim(),
    publisher: updates.publisher?.trim() || null,
    location: updates.location?.trim() || null,
    cost: updates.cost,
    category: updates.category?.trim() || null,
    ...(updates.cover_path === undefined
      ? {}
      : { cover_path: updates.cover_path }),
  });
}

export async function setBookActiveStatus(
  bookId: string,
  active: boolean
): Promise<void> {
  await updateLocalBook(bookId, { is_active: active });
}

export async function serialBelongsToAnotherBook(
  serialNumber: string,
  bookId: string
): Promise<boolean> {
  return localSerialExists(serialNumber, bookId);
}
