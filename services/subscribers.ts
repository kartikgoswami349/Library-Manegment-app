import {
  createLocalSubscriber,
  deleteLocalSubscriber,
  getLocalProfile,
  listLocalProfiles,
  updateLocalProfile,
} from '../lib/local-library';

export type AdminSubscriber = {
  id: string;
  username: string;
  full_name: string | null;
  subscription_start: string | null;
  subscription_expiry: string | null;
  is_enabled: boolean;
  created_at: string | null;
};

function mapSubscriber(profile: Awaited<ReturnType<typeof getLocalProfile>>) {
  if (!profile) {
    return null;
  }
  return {
    id: profile.id,
    username: profile.username,
    full_name: profile.full_name,
    subscription_start: profile.subscription_start,
    subscription_expiry: profile.subscription_expiry,
    is_enabled: profile.is_enabled,
    created_at: profile.created_at,
  };
}

export async function searchSubscribers(
  searchText = ''
): Promise<AdminSubscriber[]> {
  const profiles = await listLocalProfiles(searchText, 'subscriber');
  return profiles.map((profile) => ({
    id: profile.id,
    username: profile.username,
    full_name: profile.full_name,
    subscription_start: profile.subscription_start,
    subscription_expiry: profile.subscription_expiry,
    is_enabled: profile.is_enabled,
    created_at: profile.created_at,
  }));
}

export async function addSubscriber(
  fullName: string,
  mobileNumber: string
): Promise<AdminSubscriber> {
  const profile = await createLocalSubscriber(fullName, mobileNumber);
  return {
    id: profile.id,
    username: profile.username,
    full_name: profile.full_name,
    subscription_start: profile.subscription_start,
    subscription_expiry: profile.subscription_expiry,
    is_enabled: profile.is_enabled,
    created_at: profile.created_at,
  };
}

export async function setSubscriberEnabled(
  userId: string,
  enabled: boolean
): Promise<void> {
  await updateLocalProfile(userId, { is_enabled: enabled });
}

export async function deleteSubscriber(userId: string): Promise<void> {
  await deleteLocalSubscriber(userId);
}

export async function getSubscriberById(
  userId: string
): Promise<AdminSubscriber | null> {
  return mapSubscriber(await getLocalProfile(userId));
}

export async function updateSubscriber(
  userId: string,
  values: {
    full_name: string;
    subscription_start: string | null;
    subscription_expiry: string | null;
    is_enabled: boolean;
  }
): Promise<void> {
  await updateLocalProfile(userId, {
    full_name: values.full_name.trim() || null,
    subscription_start: values.subscription_start,
    subscription_expiry: values.subscription_expiry,
    is_enabled: values.is_enabled,
  });
}
