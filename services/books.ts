import { supabase } from '../lib/supabase';

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
  is_available: boolean;
  cover_url: string | null;
};
export async function uploadBookCover(
  imageUri: string,
  serialNumber: string
): Promise<string> {
  const response = await fetch(imageUri);

  const arrayBuffer =
    await response.arrayBuffer();

  const extension =
    imageUri
      .split('.')
      .pop()
      ?.toLowerCase()
      ?.split('?')[0] || 'jpg';

  const safeExtension =
    ['jpg', 'jpeg', 'png', 'webp'].includes(
      extension
    )
      ? extension
      : 'jpg';

  const safeSerial =
    serialNumber
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '_');

  const filePath =
    `${safeSerial}-${Date.now()}.${safeExtension}`;

  const { error } =
    await supabase.storage
      .from('book-covers')
      .upload(
        filePath,
        arrayBuffer,
        {
          contentType:
            safeExtension === 'png'
              ? 'image/png'
              : safeExtension === 'webp'
              ? 'image/webp'
              : 'image/jpeg',

          upsert: false,
        }
      );

  if (error) {
    throw error;
  }

  return filePath;
}

export async function searchLibraryBooks(
  searchText: string = '',
  searchBy: SearchMode = 'title'
): Promise<LibraryBook[]> {

  const { data, error } = await supabase.rpc(
    'search_library_books',
    {
      p_search_text: searchText.trim(),
      p_search_by: searchBy,
    }
  );

  if (error) {
    throw error;
  }

  const books = data ?? [];

  const booksWithCovers = await Promise.all(
    books.map(async (book: any) => {

      let coverUrl: string | null = null;

      if (book.cover_path) {
        const { data: signedData, error: signedError } =
          await supabase.storage
            .from('book-covers')
            .createSignedUrl(book.cover_path, 3600);

        if (!signedError && signedData) {
          coverUrl = signedData.signedUrl;
        }
      }

      return {
        ...book,
        cover_url: coverUrl,
      };
    })
  );

  return booksWithCovers;
}
export async function getCatalogBooks(
  offset: number = 0,
  limit: number = 30
): Promise<{
  books: LibraryBook[];
  total: number;
}> {
  const { data, error } = await supabase.rpc(
    'get_library_catalog',
    {
      p_offset: offset,
      p_limit: limit,
    }
  );

  if (error) {
    throw error;
  }

  const rows = data ?? [];

  const total =
    rows.length > 0
      ? Number(rows[0].total_count ?? 0)
      : 0;

  const books = await Promise.all(
    rows.map(async (row: any) => {
      const {
        total_count,
        ...book
      } = row;

      let coverUrl: string | null = null;

      if (book.cover_path) {
        const {
          data: signedData,
          error: signedError,
        } = await supabase.storage
          .from('book-covers')
          .createSignedUrl(
            book.cover_path,
            3600
          );

        if (!signedError && signedData) {
          coverUrl =
            signedData.signedUrl;
        }
      }

      return {
        ...book,
        cover_url: coverUrl,
      };
    })
  );

  return {
    books,
    total,
  };
}

export async function getLibraryBookById(
  bookId: string
): Promise<LibraryBook | null> {

  const { data, error } = await supabase.rpc(
    'get_library_book',
    {
      p_book_id: bookId,
    }
  );

  if (error) {
    throw error;
  }

  if (!data || data.length === 0) {
    return null;
  }

  const book = data[0];

  let coverUrl: string | null = null;

  if (book.cover_path) {

    const {
      data: signedData,
      error: signedError,
    } = await supabase.storage
      .from('book-covers')
      .createSignedUrl(
        book.cover_path,
        3600
      );

    if (!signedError && signedData) {
      coverUrl = signedData.signedUrl;
    }

  }

  return {
    ...book,
    cover_url: coverUrl,
  };
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


export async function createBook(
  book: NewBookInput
) {
  const { data, error } = await supabase
    .from('books')
    .insert({
      serial_number: book.serial_number.trim(),
      title: book.title.trim(),
      author: book.author.trim(),

      publisher:
        book.publisher?.trim() || null,

      location:
        book.location?.trim() || null,

      cost: book.cost,

      category:
        book.category?.trim() || null,

      cover_path: book.cover_path,

      is_active: true,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}


export async function serialNumberExists(
  serialNumber: string
): Promise<boolean> {

  const { data, error } = await supabase
    .from('books')
    .select('id')
    .eq(
      'serial_number',
      serialNumber.trim()
    )
    .limit(1);

  if (error) {
    throw error;
  }

  return (data?.length ?? 0) > 0;
}
export type AdminBook = LibraryBook & {
  is_active: boolean;
};


export async function searchAdminBooks(
  searchText: string = ''
): Promise<AdminBook[]> {

  const { data, error } = await supabase.rpc(
    'admin_search_books',
    {
      p_search_text: searchText.trim(),
    }
  );

  if (error) {
    throw error;
  }


  const rows = data ?? [];


  return Promise.all(
    rows.map(async (book: any) => {

      let coverUrl: string | null = null;


      if (book.cover_path) {

        const {
          data: signedData,
          error: signedError,
        } = await supabase.storage
          .from('book-covers')
          .createSignedUrl(
            book.cover_path,
            3600
          );


        if (
          !signedError &&
          signedData
        ) {
          coverUrl =
            signedData.signedUrl;
        }

      }


      return {
        ...book,
        cover_url: coverUrl,
      };

    })
  );
}

export async function getAdminBookById(
  bookId: string
): Promise<AdminBook | null> {

  const { data, error } = await supabase.rpc(
    'admin_get_book',
    {
      p_book_id: bookId,
    }
  );

  if (error) {
    throw error;
  }

  if (!data || data.length === 0) {
    return null;
  }

  const book = data[0];

  let coverUrl: string | null = null;

  if (book.cover_path) {

    const {
      data: signedData,
      error: signedError,
    } = await supabase.storage
      .from('book-covers')
      .createSignedUrl(
        book.cover_path,
        3600
      );

    if (!signedError && signedData) {
      coverUrl =
        signedData.signedUrl;
    }

  }

  return {
    ...book,
    cover_url: coverUrl,
  };
}


export async function deleteBookCover(
  filePath: string
) {

  const { error } =
    await supabase.storage
      .from('book-covers')
      .remove([filePath]);

  if (error) {
    throw error;
  }

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

  const { data, error } =
    await supabase
      .from('books')
      .update({
        ...updates,
        updated_at:
          new Date().toISOString(),
      })
      .eq('id', bookId)
      .select()
      .single();


  if (error) {
    throw error;
  }


  return data;
}


export async function setBookActiveStatus(
  bookId: string,
  active: boolean
) {

  const { error } =
    await supabase
      .from('books')
      .update({
        is_active: active,
        updated_at:
          new Date().toISOString(),
      })
      .eq('id', bookId);


  if (error) {
    throw error;
  }

}


export async function serialBelongsToAnotherBook(
  serialNumber: string,
  bookId: string
): Promise<boolean> {

  const { data, error } =
    await supabase
      .from('books')
      .select('id')
      .eq(
        'serial_number',
        serialNumber.trim()
      )
      .neq('id', bookId)
      .limit(1);


  if (error) {
    throw error;
  }


  return (data?.length ?? 0) > 0;
}