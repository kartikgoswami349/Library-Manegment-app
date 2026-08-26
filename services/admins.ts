import { supabase } from '../lib/supabase';


export type AdminAccount = {
  id: string;
  full_name: string | null;
  email: string | null;
  is_enabled: boolean;
  created_at: string | null;
  is_current_user: boolean;
};


export async function searchAdmins(
  searchText: string = ''
): Promise<AdminAccount[]> {

  const { data, error } = await supabase.rpc(
    'admin_search_admins',
    {
      p_search_text: searchText.trim(),
    }
  );

  if (error) {
    throw error;
  }

  return data ?? [];
}


export async function promoteUserToAdmin(
  userId: string
) {

  const { error } = await supabase.rpc(
    'admin_promote_user',
    {
      p_user_id: userId,
    }
  );

  if (error) {
    throw error;
  }
}


export async function demoteAdmin(
  userId: string
) {

  const { error } = await supabase.rpc( 
    'admin_demote_user',
    {
      p_user_id: userId,
    }
  );

  if (error) {
    throw error;
  }
}