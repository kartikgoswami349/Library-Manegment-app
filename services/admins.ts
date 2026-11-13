import { getLocalProfile, listLocalProfiles, updateLocalProfile } from '../lib/local-library';
import { getUserAccess } from '../lib/user-cache';

export type AdminAccount = {
  id: string;
  username: string;
  full_name: string | null;
  is_enabled: boolean;
  created_at: string | null;
  is_current_user: boolean;
};

export async function searchAdmins(
  searchText = ''
): Promise<AdminAccount[]> {
  const [profiles, currentUser] = await Promise.all([
    listLocalProfiles(searchText, 'admin'),
    getUserAccess(),
  ]);
  return profiles.map((profile) => ({
    id: profile.id,
    username: profile.username,
    full_name: profile.full_name,
    is_enabled: profile.is_enabled,
    created_at: profile.created_at,
    is_current_user: profile.id === currentUser?.id,
  }));
}

export async function promoteUserToAdmin(userId: string): Promise<void> {
  const profile = await getLocalProfile(userId);
  if (!profile) {
    throw new Error('The account could not be found in the local database.');
  }
  await updateLocalProfile(userId, { role: 'admin' });
}

export async function demoteAdmin(userId: string): Promise<void> {
  const currentUser = await getUserAccess();
  if (currentUser?.id === userId) {
    throw new Error('You cannot remove your own administrator access.');
  }
  const profile = await getLocalProfile(userId);
  if (!profile) {
    throw new Error('The account could not be found in the local database.');
  }
  await updateLocalProfile(userId, { role: 'subscriber' });
}
