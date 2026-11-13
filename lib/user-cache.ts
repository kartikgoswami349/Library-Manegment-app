import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export type CachedUserAccess = {
  id: string;
  username: string;
  role: 'admin' | 'subscriber';
  is_enabled: boolean;
};

const CACHE_KEY = 'library_user_access';

export async function saveUserAccess(
  data: CachedUserAccess
): Promise<void> {
  try {
    const value = JSON.stringify(data);
    if (Platform.OS === 'web') {
      localStorage.setItem(CACHE_KEY, value);
    } else {
      await AsyncStorage.setItem(CACHE_KEY, value);
    }
  } catch (error) {
    console.error('Unable to save user access cache.', error);
  }
}

export async function getUserAccess(): Promise<CachedUserAccess | null> {
  try {
    const value = Platform.OS === 'web'
      ? localStorage.getItem(CACHE_KEY)
      : await AsyncStorage.getItem(CACHE_KEY);
    if (!value) {
      return null;
    }

    const cached = JSON.parse(value) as CachedUserAccess;
    if (
      typeof cached.id !== 'string' ||
      typeof cached.username !== 'string' ||
      (cached.role !== 'admin' && cached.role !== 'subscriber') ||
      typeof cached.is_enabled !== 'boolean'
    ) {
      return null;
    }
    return cached;
  } catch (error) {
    console.error('Unable to read user access cache.', error);
    return null;
  }
}

export async function clearUserAccess(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      localStorage.removeItem(CACHE_KEY);
    } else {
      await AsyncStorage.removeItem(CACHE_KEY);
    }
  } catch (error) {
    console.error('Unable to clear user access cache.', error);
  }
}
