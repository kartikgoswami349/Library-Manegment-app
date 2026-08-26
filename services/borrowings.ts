import { supabase } from '../lib/supabase';


export async function issueBook(
  bookId: string,
  subscriberId: string,
  dueDate: string | null,
  notes: string | null
): Promise<string> {

  const {
    data,
    error,
  } = await supabase.rpc(
    'admin_issue_book',
    {
      p_book_id: bookId,
      p_subscriber_id: subscriberId,
      p_due_date: dueDate,
      p_notes: notes,
    }
  );


  if (error) {
    throw error;
  }


  return data as string;
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
  subscriber_email: string | null;

  issued_at: string;
  due_date: string | null;
  notes: string | null;
};


export async function searchActiveBorrowings(
  searchText: string = ''
): Promise<ActiveBorrowing[]> {

  const { data, error } =
    await supabase.rpc(
      'admin_search_active_borrowings',
      {
        p_search_text:
          searchText.trim(),
      }
    );


  if (error) {
    throw error;
  }


  const rows = data ?? [];


  return Promise.all(
    rows.map(
      async (
        borrowing: ActiveBorrowing
      ) => {

        let coverUrl:
          string | null = null;


        if (borrowing.cover_path) {

          const {
            data: signedData,
            error: signedError,
          } = await supabase.storage
            .from('book-covers')
            .createSignedUrl(
              borrowing.cover_path,
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
          ...borrowing,
          cover_url: coverUrl,
        };

      }
    )
  );

}


export async function receiveBook(
  borrowingId: string
) {

  const { error } =
    await supabase.rpc(
      'admin_receive_book',
      {
        p_borrowing_id:
          borrowingId,
      }
    );


  if (error) {
    throw error;
  }

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
  subscriber_email: string | null;

  issued_at: string;
  due_date: string | null;
  returned_at: string | null;

  issued_by: string | null;
  issued_by_name: string | null;

  received_by: string | null;
  received_by_name: string | null;

  notes: string | null;

  status:
    | 'issued'
    | 'returned'
    | 'overdue';
};


export async function searchBorrowingHistory(
  searchText: string = '',
  status: string = 'all'
): Promise<BorrowingHistoryItem[]> {

  const { data, error } =
    await supabase.rpc(
      'admin_search_borrowing_history',
      {
        p_search_text:
          searchText.trim(),

        p_status:
          status,
      }
    );


  if (error) {
    throw error;
  }


  const rows =
    (data ?? []) as BorrowingHistoryItem[];


  return Promise.all(
    rows.map(
      async (item) => {

        let coverUrl:
          string | null = null;


        if (item.cover_path) {

          const {
            data: signedData,
            error: signedError,
          } = await supabase.storage
            .from('book-covers')
            .createSignedUrl(
              item.cover_path,
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
          ...item,
          cover_url: coverUrl,
        };

      }
    )
  );

}