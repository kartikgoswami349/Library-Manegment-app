import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';

import {
    useEffect,
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

    prepareRecovery();

  }, []);



  async function prepareRecovery() {

  try {

    const url =
      await Linking.getInitialURL();


    if (url) {

      /*
        Password recovery links commonly return:

        #access_token=...
        &refresh_token=...
        &type=recovery
      */

      const hashPart =
        url.includes('#')
          ? url.split('#')[1]
          : '';

      const queryPart =
        url.includes('?')
          ? url.split('?')[1]
              ?.split('#')[0]
          : '';


      const params =
        new URLSearchParams(
          hashPart || queryPart
        );


      const accessToken =
        params.get(
          'access_token'
        );

      const refreshToken =
        params.get(
          'refresh_token'
        );


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

      }

    }


    const {
      data: {
        session,
      },
    } =
      await supabase.auth
        .getSession();


    if (!session) {

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

      return;
    }


    setReady(true);


  } catch (error: any) {

    console.log(
      'Password recovery error:',
      error
    );


    Alert.alert(
      'Reset Link Error',
      error?.message ??
        'Unable to verify the password reset link.'
    );

  }

}



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
        await supabase.auth
          .updateUser({
            password:
              newPassword,
          });


      if (error) {
        throw error;
      }


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