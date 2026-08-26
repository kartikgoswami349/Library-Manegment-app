import 'expo-sqlite/localStorage/install';
import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kzejcqzbfytomgkzjait.supabase.co';

const supabasePublishableKey =
  'sb_publishable_XUkC5zf4ROYiaEf6Iu3hVg_1MCFxxU9';

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      storage: localStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);