import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';

import {
    useEffect,
    useRef,
    useState,
} from 'react';

import {
    ActivityIndicator,
    Alert,
    Pressable,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';


import { Colors } from '../constants/theme';
import { supabase } from '../lib/supabase';


export default function ResetPasswordScreen() {

  const recoveryHandled =
  useRef(false);

  const [newPassword, setNewPassword] =
    useState('');

  const [confirmPassword, setConfirmPassword] =
    useState('');

  const [showPassword, setShowPassword] =
    useState(false);

  const [showConfirm, setShowConfirm] =
    useState(false);

  const [ready, setReady] =
    useState(false);

  const [saving, setSaving] =
    useState(false);


  useEffect(() => {

  let mounted = true;


  async function handleRecoveryUrl(
    url: string | null
  ) {

    if (
      !url ||
      recoveryHandled.current
    ) {
      return;
    }


    console.log(
      'Recovery URL:',
      url
    );


    try {

      /*
        Support both Supabase recovery formats:

        #access_token=...
        #refresh_token=...

        OR

        ?code=...
      */

      const hash =
        url.includes('#')
          ? url.split('#')[1]
          : '';

      const query =
        url.includes('?')
          ? url
              .split('?')[1]
              ?.split('#')[0] ?? ''
          : '';


      const hashParams =
        new URLSearchParams(hash);

      const queryParams =
        new URLSearchParams(query);


      const accessToken =
        hashParams.get(
          'access_token'
        ) ??
        queryParams.get(
          'access_token'
        );


      const refreshToken =
        hashParams.get(
          'refresh_token'
        ) ??
        queryParams.get(
          'refresh_token'
        );


      const code =
        queryParams.get('code');


      /*
        IMPLICIT TOKEN FLOW
      */

      if (
        accessToken &&
        refreshToken
      ) {

        const { error } =
          await supabase.auth
            .setSession({
              access_token:
                accessToken,

              refresh_token:
                refreshToken,
            });


        if (error) {
          throw error;
        }


        recoveryHandled.current =
          true;


        if (mounted) {
          setReady(true);
        }

        return;
      }


      /*
        PKCE CODE FLOW
      */

      if (code) {

        const { error } =
          await supabase.auth
            .exchangeCodeForSession(
              code
            );


        if (error) {
          throw error;
        }


        recoveryHandled.current =
          true;


        if (mounted) {
          setReady(true);
        }

        return;
      }


    } catch (error) {

      console.log(
        'Recovery URL error:',
        error
      );

    }

  }



  /*
    1. Handle COLD START:
       app was completely closed
  */

  Linking
    .getInitialURL()
    .then(handleRecoveryUrl);



  /*
    2. Handle WARM START:
       app was already open/backgrounded
  */

  const linkSubscription =
    Linking.addEventListener(
      'url',
      (event) => {

        handleRecoveryUrl(
          event.url
        );

      }
    );



  /*
    3. Supabase may also emit
       PASSWORD_RECOVERY.
  */

  const {
    data: {
      subscription:
        authSubscription,
    },
  } =
    supabase.auth
      .onAuthStateChange(
        (event, session) => {

          if (
            event ===
              'PASSWORD_RECOVERY' &&
            session
          ) {

            recoveryHandled.current =
              true;

            if (mounted) {
              setReady(true);
            }

          }

        }
      );



  /*
    Give Android/deep linking a little
    time before declaring the link invalid.
  */

  const timer =
    setTimeout(
      async () => {

        if (
          recoveryHandled.current
        ) {
          return;
        }


        const {
          data: {
            session,
          },
        } =
          await supabase.auth
            .getSession();


        if (session) {

          recoveryHandled.current =
            true;

          if (mounted) {
            setReady(true);
          }

          return;
        }


        if (mounted) {

          Alert.alert(
            'Invalid Reset Link',
            'Please request a new password reset link.',
            [
              {
                text: 'OK',

                onPress: () =>
                  router.replace(
                    '/(auth)/forgot-password'
                  ),
              },
            ]
          );

        }

      },
      3000
    );


  return () => {

    mounted = false;

    clearTimeout(timer);

    linkSubscription.remove();

    authSubscription.unsubscribe();

  };

}, []);



  async function resetPassword() {

    if (
      !newPassword ||
      !confirmPassword
    ) {

      Alert.alert(
        'Missing Password',
        'Please complete both fields.'
      );

      return;

    }


    if (newPassword.length < 8) {

      Alert.alert(
        'Password Too Short',
        'Password must contain at least 8 characters.'
      );

      return;

    }


    if (
      newPassword !==
      confirmPassword
    ) {

      Alert.alert(
        'Passwords Do Not Match',
        'Please enter the same password in both fields.'
      );

      return;

    }


    try {

      setSaving(true);


      const { error } =
      await supabase.auth.updateUser({
    password: newPassword,
  });

if (error) {
  throw error;
}

await supabase.auth.signOut();


      /*
        Sign out after password reset so
        user logs in with the new password.
      */

      await supabase.auth.signOut();


      Alert.alert(
        'Password Reset',
        'Your password has been changed successfully.',
        [
          {
            text: 'Login',
            onPress: () =>
              router.replace(
                '/(auth)/login'
              ),
          },
        ]
      );


    } catch (error: any) {

      Alert.alert(
        'Reset Failed',
        error?.message ??
          'Unable to reset password.'
      );

    } finally {

      setSaving(false);

    }

  }



  if (!ready) {

    return (

      <SafeAreaView
        style={styles.loading}
      >

        <ActivityIndicator
          size="large"
          color={Colors.primary}
        />

        <Text style={styles.loadingText}>
          Verifying reset link...
        </Text>

      </SafeAreaView>

    );

  }



  return (

    <SafeAreaView style={styles.safeArea}>

      <View style={styles.container}>


        <View style={styles.iconBox}>

          <Ionicons
            name="lock-open-outline"
            size={34}
            color={Colors.primary}
          />

        </View>


        <Text style={styles.title}>
          Create New Password
        </Text>

        <Text style={styles.description}>
          Enter a new password for your library account.
        </Text>


        <Text style={styles.label}>
          New Password
        </Text>

        <View style={styles.passwordBox}>

          <TextInput
            value={newPassword}
            onChangeText={
              setNewPassword
            }
            secureTextEntry={
              !showPassword
            }
            placeholder="Enter new password"
            placeholderTextColor={
              Colors.textSecondary
            }
            style={styles.input}
          />

          <Pressable
            onPress={() =>
              setShowPassword(
                !showPassword
              )
            }
          >

            <Ionicons
              name={
                showPassword
                  ? 'eye-off-outline'
                  : 'eye-outline'
              }
              size={20}
              color={
                Colors.textSecondary
              }
            />

          </Pressable>

        </View>


        <Text style={styles.label}>
          Confirm Password
        </Text>

        <View style={styles.passwordBox}>

          <TextInput
            value={confirmPassword}
            onChangeText={
              setConfirmPassword
            }
            secureTextEntry={
              !showConfirm
            }
            placeholder="Re-enter new password"
            placeholderTextColor={
              Colors.textSecondary
            }
            style={styles.input}
          />

          <Pressable
            onPress={() =>
              setShowConfirm(
                !showConfirm
              )
            }
          >

            <Ionicons
              name={
                showConfirm
                  ? 'eye-off-outline'
                  : 'eye-outline'
              }
              size={20}
              color={
                Colors.textSecondary
              }
            />

          </Pressable>

        </View>


        <Pressable
          onPress={resetPassword}
          disabled={saving}
          style={styles.button}
        >

          {saving ? (

            <ActivityIndicator
              color="#FFFFFF"
            />

          ) : (

            <Text style={styles.buttonText}>
              Reset Password
            </Text>

          )}

        </Pressable>


      </View>

    </SafeAreaView>

  );

}



const styles =
StyleSheet.create({

  safeArea: {
    flex: 1,
    backgroundColor:
      Colors.background,
  },

  container: {
    flex: 1,

    paddingHorizontal: 22,
    paddingTop: 70,
  },

  iconBox: {
    width: 68,
    height: 68,

    alignItems: 'center',
    justifyContent: 'center',

    borderRadius: 22,

    backgroundColor:
      Colors.roseMist,
  },

  title: {
    color:
      Colors.primaryDark,

    fontSize: 26,
    fontWeight: '800',

    marginTop: 20,
  },

  description: {
    color:
      Colors.textSecondary,

    fontSize: 12,

    marginTop: 7,
    marginBottom: 25,
  },

  label: {
    color:
      Colors.textSecondary,

    fontSize: 10,
    fontWeight: '700',

    marginTop: 13,
    marginBottom: 6,
  },

  passwordBox: {
    height: 51,

    flexDirection: 'row',
    alignItems: 'center',

    paddingHorizontal: 13,

    borderRadius: 14,

    backgroundColor:
      Colors.surface,

    borderWidth: 1,
    borderColor:
      Colors.border,
  },

  input: {
    flex: 1,

    color:
      Colors.textPrimary,

    fontSize: 14,

    paddingRight: 10,
  },

  button: {
    height: 52,

    alignItems: 'center',
    justifyContent: 'center',

    borderRadius: 16,

    backgroundColor:
      Colors.primary,

    marginTop: 28,
  },

  buttonText: {
    color: '#FFFFFF',

    fontSize: 14,
    fontWeight: '800',
  },

  loading: {
    flex: 1,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor:
      Colors.background,
  },

  loadingText: {
    color:
      Colors.textSecondary,

    fontSize: 11,

    marginTop: 10,
  },

});