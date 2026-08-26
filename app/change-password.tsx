import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';

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


export default function ChangePasswordScreen() {

  const [currentPassword, setCurrentPassword] =
    useState('');

  const [newPassword, setNewPassword] =
    useState('');

  const [confirmPassword, setConfirmPassword] =
    useState('');

  const [showCurrent, setShowCurrent] =
    useState(false);

  const [showNew, setShowNew] =
    useState(false);

  const [showConfirm, setShowConfirm] =
    useState(false);

  const [saving, setSaving] =
    useState(false);


  async function changePassword() {

    if (
      !currentPassword ||
      !newPassword ||
      !confirmPassword
    ) {
      Alert.alert(
        'Missing Information',
        'Please fill in all password fields.'
      );

      return;
    }


    if (newPassword.length < 8) {
      Alert.alert(
        'Password Too Short',
        'New password must contain at least 8 characters.'
      );

      return;
    }


    if (newPassword !== confirmPassword) {
      Alert.alert(
        'Passwords Do Not Match',
        'Please enter the same new password in both fields.'
      );

      return;
    }


    if (currentPassword === newPassword) {
      Alert.alert(
        'Choose Another Password',
        'Your new password must be different from your current password.'
      );

      return;
    }


    try {

      setSaving(true);


      /*
        Get logged-in user's email
      */

      const {
        data: { user },
        error: userError,
      } =
        await supabase.auth.getUser();


      if (
        userError ||
        !user ||
        !user.email
      ) {
        throw new Error(
          'Unable to verify your account.'
        );
      }


      /*
        Verify current password
      */

      const {
        error: loginError,
      } =
        await supabase.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        });


      if (loginError) {

        Alert.alert(
          'Incorrect Password',
          'Your current password is incorrect.'
        );

        return;
      }


      /*
        Change password
      */

      const {
        error: updateError,
      } =
        await supabase.auth.updateUser({
          password: newPassword,
        });


      if (updateError) {
        throw updateError;
      }


      Alert.alert(
        'Password Changed',
        'Your password has been changed successfully.',
        [
          {
            text: 'OK',
            onPress: () =>
              router.back(),
          },
        ]
      );


    } catch (error: any) {

      Alert.alert(
        'Password Change Failed',
        error?.message ??
          'Unable to change your password.'
      );

    } finally {

      setSaving(false);

    }

  }


  return (

    <SafeAreaView style={styles.safeArea}>

      <View style={styles.container}>


        {/* HEADER */}

        <View style={styles.header}>

          <Pressable
            onPress={() =>
              router.back()
            }
            style={styles.backButton}
          >

            <Ionicons
              name="arrow-back"
              size={22}
              color={Colors.primaryDark}
            />

          </Pressable>


          <View>

            <Text style={styles.title}>
              Change Password
            </Text>

            <Text style={styles.subtitle}>
              Update your account password
            </Text>

          </View>

        </View>



        {/* CURRENT PASSWORD */}

        <Text style={styles.label}>
          Current Password
        </Text>

        <View style={styles.passwordBox}>

          <TextInput
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry={!showCurrent}
            placeholder="Enter current password"
            placeholderTextColor={
              Colors.textSecondary
            }
            style={styles.input}
          />

          <Pressable
            onPress={() =>
              setShowCurrent(
                !showCurrent
              )
            }
          >

            <Ionicons
              name={
                showCurrent
                  ? 'eye-off-outline'
                  : 'eye-outline'
              }
              size={20}
              color={Colors.textSecondary}
            />

          </Pressable>

        </View>



        {/* NEW PASSWORD */}

        <Text style={styles.label}>
          New Password
        </Text>

        <View style={styles.passwordBox}>

          <TextInput
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry={!showNew}
            placeholder="Enter new password"
            placeholderTextColor={
              Colors.textSecondary
            }
            style={styles.input}
          />

          <Pressable
            onPress={() =>
              setShowNew(!showNew)
            }
          >

            <Ionicons
              name={
                showNew
                  ? 'eye-off-outline'
                  : 'eye-outline'
              }
              size={20}
              color={Colors.textSecondary}
            />

          </Pressable>

        </View>



        {/* CONFIRM PASSWORD */}

        <Text style={styles.label}>
          Confirm New Password
        </Text>

        <View style={styles.passwordBox}>

          <TextInput
            value={confirmPassword}
            onChangeText={
              setConfirmPassword
            }
            secureTextEntry={!showConfirm}
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
              color={Colors.textSecondary}
            />

          </Pressable>

        </View>



        <Text style={styles.hint}>
          Use at least 8 characters for your new password.
        </Text>



        {/* CHANGE BUTTON */}

        <Pressable
          onPress={changePassword}
          disabled={saving}
          style={({ pressed }) => [
            styles.changeButton,
            pressed &&
              styles.buttonPressed,
            saving && {
              opacity: 0.65,
            },
          ]}
        >

          {saving ? (

            <ActivityIndicator
              color="#FFFFFF"
            />

          ) : (

            <>

              <Ionicons
                name="lock-closed-outline"
                size={18}
                color="#FFFFFF"
              />

              <Text style={styles.changeText}>
                Change Password
              </Text>

            </>

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
    backgroundColor: Colors.background,
  },

  container: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',

    marginBottom: 28,
  },

  backButton: {
    width: 42,
    height: 42,

    borderRadius: 14,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: Colors.surface,

    borderWidth: 1,
    borderColor: Colors.border,

    marginRight: 12,
  },

  title: {
    color: Colors.primaryDark,

    fontSize: 22,
    fontWeight: '800',
  },

  subtitle: {
    color: Colors.textSecondary,

    fontSize: 10,

    marginTop: 2,
  },

  label: {
    color: Colors.textSecondary,

    fontSize: 10,
    fontWeight: '700',

    marginBottom: 6,
    marginTop: 13,
  },

  passwordBox: {
    height: 50,

    flexDirection: 'row',
    alignItems: 'center',

    paddingHorizontal: 13,

    borderRadius: 14,

    backgroundColor: Colors.surface,

    borderWidth: 1,
    borderColor: Colors.border,
  },

  input: {
    flex: 1,

    color: Colors.textPrimary,

    fontSize: 14,

    paddingRight: 10,
  },

  hint: {
    color: Colors.textSecondary,

    fontSize: 9,

    marginTop: 10,
  },

  changeButton: {
    height: 52,

    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',

    gap: 7,

    borderRadius: 16,

    backgroundColor: Colors.primary,

    marginTop: 28,
  },

  changeText: {
    color: '#FFFFFF',

    fontSize: 14,
    fontWeight: '800',
  },

  buttonPressed: {
    opacity: 0.85,
  },

});