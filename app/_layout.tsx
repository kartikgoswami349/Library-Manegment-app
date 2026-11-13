import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { router, Stack, useSegments } from 'expo-router';

import { getCurrentLocalAccount } from '../lib/local-auth';
import { syncPairedLanDevices } from '../lib/lan-auto-sync';
import { isDesktopLanAvailable, isLanSyncServerRunning, startLanSyncServer } from '../lib/lan-sync';
import { getLocalLanPairingCode } from '../lib/lan-pairing';

let lastAutomaticSyncWarningAt = 0;

export default function RootLayout() {
  const segments = useSegments();

  useEffect(() => {
    if (!segments[0]) {
      return;
    }

    let cancelled = false;

    async function protectRoutes() {
      const account = await getCurrentLocalAccount();
      if (cancelled) {
        return;
      }

      const isAuthRoute = segments[0] === '(auth)';
      const isAdminRoute = segments[0] === '(admin)';
      const isUserRoute = segments[0] === '(user)';
      const isPasswordRoute = segments[0] === 'change-password';

      if (
        isAdminRoute &&
        (!account || !account.is_enabled || account.role !== 'admin')
      ) {
        router.replace(
          account?.is_enabled ? '/(user)' : '/(auth)/login'
        );
        return;
      }

      if (
        isUserRoute &&
        (!account || !account.is_enabled || account.role !== 'subscriber')
      ) {
        router.replace(
          account?.is_enabled ? '/(admin)' : '/(auth)/login'
        );
        return;
      }

      if (isPasswordRoute && (!account || !account.is_enabled)) {
        router.replace('/(auth)/login');
        return;
      }

      if (isAuthRoute && account?.is_enabled) {
        router.replace(account.role === 'admin' ? '/(admin)' : '/(user)');
      }
    }

    void protectRoutes().catch((error: unknown) => {
      console.error('Unable to verify the local session.', error);
    });

    return () => {
      cancelled = true;
    };
  }, [segments]);

  useEffect(() => {
    if (Platform.OS === 'web' && !isDesktopLanAvailable()) {
      return;
    }

    const ensureServerAndSync = async () => {
      try {
        if (!isLanSyncServerRunning()) {
          const code = await getLocalLanPairingCode();
          await startLanSyncServer(code);
        }
      } catch (err) {
        console.warn('Auto-starting LAN sync server encountered an issue:', err);
      }
      if (AppState.currentState === 'active') {
        void syncPairedLanDevices().catch((error: unknown) => {
          if (
            error instanceof Error &&
            error.message.startsWith('Automatic sync could not reach every paired device.')
          ) {
            const now = Date.now();
            if (now - lastAutomaticSyncWarningAt >= 60_000) {
              lastAutomaticSyncWarningAt = now;
              console.warn('Automatic LAN sync is waiting for paired devices to reconnect.', error.message);
            }
            return;
          }
          console.error('Automatic LAN sync failed.', error);
        });
      }
    };

    void ensureServerAndSync();
    const interval = setInterval(() => {
      void ensureServerAndSync();
    }, 20000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void ensureServerAndSync();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}