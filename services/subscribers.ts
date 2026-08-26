import { supabase } from '../lib/supabase';


export type AdminSubscriber = {
  id: string;
  full_name: string | null;
  email: string | null;

  subscription_start: string | null;
  subscription_expiry: string | null;

  is_enabled: boolean;

  created_at: string | null;
};


export async function searchSubscribers(
  searchText: string = ''
): Promise<AdminSubscriber[]> {

  const { data, error } = await supabase.rpc(
    'admin_search_subscribers',
    {
      p_search_text: searchText.trim(),
    }
  );


  if (error) {
    throw error;
  }


  return data ?? [];
}


export async function setSubscriberEnabled(
  userId: string,
  enabled: boolean
) {

  const { error } = await supabase.rpc(
    'admin_set_subscriber_enabled',
    {
      p_user_id: userId,
      p_enabled: enabled,
    }
  );


  if (error) {
    throw error;
  }
  

}
export async function getSubscriberById(
  userId: string
): Promise<AdminSubscriber | null> {

  const { data, error } = await supabase.rpc(
    'admin_get_subscriber',
    {
      p_user_id: userId,
    }
  );

  if (error) {
    throw error;
  }

  if (!data || data.length === 0) {
    return null;
  }

  return data[0];
}


export async function updateSubscriber(
  userId: string,
  values: {
    full_name: string;
    subscription_start: string | null;
    subscription_expiry: string | null;
    is_enabled: boolean;
  }
) {

  const { error } = await supabase.rpc(
    'admin_update_subscriber',
    {
      p_user_id: userId,
      p_full_name: values.full_name.trim(),
      p_subscription_start:
        values.subscription_start,
      p_subscription_expiry:
        values.subscription_expiry,
      p_is_enabled:
        values.is_enabled,
    }
  );

  if (error) {
    throw error;
  }
}