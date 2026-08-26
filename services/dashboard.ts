import { supabase } from '../lib/supabase';


export type DashboardStats = {
  total_books: number;
  available_books: number;
  issued_books: number;
  catalog_titles: number;

  total_subscribers: number;
  enabled_subscribers: number;

  overdue_books: number;
  total_admins: number;
};


export async function getDashboardStats():
Promise<DashboardStats> {

  const { data, error } =
    await supabase.rpc(
      'admin_dashboard_stats'
    );


  if (error) {
    throw error;
  }


  if (!data || data.length === 0) {
    throw new Error(
      'Dashboard statistics unavailable.'
    );
  }


  return data[0];
}
export type RecentActivity = {
  action_type: 'issued' | 'returned';
  action_at: string;

  book_id: string;
  serial_number: string;
  title: string;

  subscriber_name: string | null;
  admin_name: string | null;
};


export async function getRecentActivity():
Promise<RecentActivity[]> {

  const { data, error } =
    await supabase.rpc(
      'admin_recent_activity'
    );

  if (error) {
    throw error;
  }

  return data ?? [];
}