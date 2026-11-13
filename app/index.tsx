import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';

import {
  ensureDefaultAdminAccount,
  getCurrentLocalAccount,
  signOutLocal,
} from '../lib/local-auth';
import { seedLocalCatalog } from '../lib/local-database';
import { saveUserAccess } from '../lib/user-cache';

function isRecoverableVfsError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /invalid vfs state|invalidstateerror|state cached in an interface object/i.test(
      error.message
    )
  );
}

export default function SplashScreen() {
  const [startupError, setStartupError] = useState('');
  const [retryToken, setRetryToken] = useState(0);
  const logoOpacity = useRef(new Animated.Value(0.08)).current;
  const logoScale = useRef(new Animated.Value(0.9)).current;
  const textOpacity = useRef(new Animated.Value(0.08)).current;
  const textTranslateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 1900,
        delay: 350,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(textTranslateY, {
        toValue: 0,
        duration: 1500,
        delay: 350,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
    let cancelled = false;
    void routeFromLocalSession().catch((error: unknown) => {
      if (!cancelled) {
        if (Platform.OS === 'web' && isRecoverableVfsError(error)) {
          const recoveryKey = 'library-sqlite-vfs-recovery';
          const alreadyRecovered =
            typeof sessionStorage !== 'undefined' &&
            sessionStorage.getItem(recoveryKey) === '1';
          if (!alreadyRecovered && typeof window !== 'undefined') {
            sessionStorage.setItem(recoveryKey, '1');
            window.location.reload();
            return;
          }
        }
        setStartupError(
          error instanceof Error
            ? error.message
            : 'Unable to open the local library database.'
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [retryToken]);

  async function routeFromLocalSession() {
    const minimumSplashTime = new Promise<void>((resolve) => {
      setTimeout(resolve, 2200);
    });

    try {
      await Promise.race([
        ensureDefaultAdminAccount(),
        new Promise<never>((_, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(
                  'The local database did not respond. Check the desktop build and try again.'
                )
              ),
            10000
          );
        }),
      ]);
      const account = await getCurrentLocalAccount();
      await minimumSplashTime;
      if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('library-sqlite-vfs-recovery');
      }
      void seedLocalCatalog().catch((error: unknown) => {
        console.error('Unable to import the local book catalog.', error);
      });

      if (!account || !account.is_enabled) {
        await signOutLocal();
        router.replace('/(auth)/login');
        return;
      }

      await saveUserAccess({
        id: account.id,
        username: account.username,
        role: account.role,
        is_enabled: account.is_enabled,
      });
      router.replace(account.role === 'admin' ? '/(admin)' : '/(user)');
    } catch (error) {
      console.error('Unable to initialize the local library.', error);
      await minimumSplashTime;
      throw error;
    }
  }

  if (startupError) {
    return (
      <View style={styles.container}>
        <Animated.Image
          source={require('../assets/images/library-logo.png')}
          resizeMode="contain"
          style={styles.logo}
        />
        <Animated.Text style={styles.errorTitle}>
          Library startup failed
        </Animated.Text>
        <Animated.Text style={styles.errorText}>
          {startupError}
        </Animated.Text>
        <Animated.Text
          onPress={() => {
            setStartupError('');
            setRetryToken((value) => value + 1);
          }}
          style={styles.retry}
        >
          Tap here to retry
        </Animated.Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.Image
        source={require('../assets/images/library-logo.png')}
        resizeMode="contain"
        style={[
          styles.logo,
          {
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          },
        ]}
      />
      <Animated.Text
        style={[
          styles.tagline,
          {
            opacity: textOpacity,
            transform: [{ translateY: textTranslateY }],
          },
        ]}
      >
        ज्ञान • भक्ति • अध्यात्म
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF7FA',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logo: {
    width: 170,
    height: 170,
    marginBottom: 22,
  },
  tagline: {
    color: '#8E244D',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  errorTitle: {
    color: '#8E244D',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 10,
  },
  errorText: {
    color: '#6E5962',
    fontSize: 13,
    marginTop: 10,
    maxWidth: 340,
    textAlign: 'center',
  },
  retry: {
    color: '#8E244D',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 20,
  },
});
