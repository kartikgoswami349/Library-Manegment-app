import {
  getLocalDashboardStats,
  listLocalRecentActivity,
} from '../lib/local-library';

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

export async function getDashboardStats(): Promise<DashboardStats> {
  return getLocalDashboardStats();
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

export async function getRecentActivity(): Promise<RecentActivity[]> {
  return listLocalRecentActivity();
}
