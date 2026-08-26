import { supabase } from '../lib/supabase';


export type MyProfile = {
  id: string;
  full_name: string | null;
  email: string | null;

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

  status:
    | 'issued'
    | 'overdue'
    | 'returned';
};


export async function getMyProfile():
Promise<MyProfile | null> {

  const { data, error } =
    await supabase.rpc(
      'get_my_profile'
    );


  if (error) {
    throw error;
  }


  if (!data || data.length === 0) {
    return null;
  }


  return data[0];
}


export async function updateMyProfile(
  fullName: string,
  mobileNumber: string
) {

  const { error } =
    await supabase.rpc(
      'update_my_profile',
      {
        p_full_name: fullName,
        p_mobile_number: mobileNumber,
      }
    );

  if (error) {
    throw error;
  }
}


export async function getMyBorrowings(
  status:
    | 'all'
    | 'issued'
    | 'overdue'
    | 'returned' = 'all'
): Promise<MyBorrowing[]> {

  const { data, error } =
    await supabase.rpc(
      'get_my_borrowings',
      {
        p_status: status,
      }
    );


  if (error) {
    throw error;
  }


  const rows =
    (data ?? []) as MyBorrowing[];


  return Promise.all(
    rows.map(
      async (item) => {

        let coverUrl:
          string | null = null;


        if (item.cover_path) {

          const {
            data: signedData,
          } =
            await supabase.storage
              .from('book-covers')
              .createSignedUrl(
                item.cover_path,
                3600
              );


          if (signedData) {

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