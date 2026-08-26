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

import { Colors } from '../../constants/theme';
import { supabase } from '../../lib/supabase';


export default function ForgotPasswordScreen() {

  const [email, setEmail] =
    useState('');

  const [sending, setSending] =
    useState(false);


  async function sendResetEmail() {

    if (!email.trim()) {

      Alert.alert(
        'Email Required',
        'Please enter your email address.'
      );

      return;
    }


    try {

      setSending(true);


      const redirectUrl =
  'libraryapp://reset-password';


      const { error } =
        await supabase.auth
          .resetPasswordForEmail(
            email
              .trim()
              .toLowerCase(),
            {
              redirectTo:
                redirectUrl,
            }
          );


      if (error) {
        throw error;
      }


      Alert.alert(
        'Check Your Email',
        'We sent you a password reset link. Open the email and tap the link to continue.'
      );


    } catch (error: any) {

      Alert.alert(
        'Unable to Send Email',
        error?.message ??
          'Please try again.'
      );

    } finally {

      setSending(false);

    }

  }


  return (

    <SafeAreaView style={styles.safeArea}>

      <View style={styles.container}>


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


        <View style={styles.iconBox}>

          <Ionicons
            name="mail-outline"
            size={34}
            color={Colors.primary}
          />

        </View>


        <Text style={styles.title}>
          Forgot Password?
        </Text>

        <Text style={styles.description}>
          Enter the email linked to your library account.
          We'll send you a password reset link.
        </Text>


        <Text style={styles.label}>
          Email Address
        </Text>

        <View style={styles.inputBox}>

          <Ionicons
            name="mail-outline"
            size={19}
            color={Colors.textSecondary}
          />

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Enter your email"
            placeholderTextColor={
              Colors.textSecondary
            }
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />

        </View>


        <Pressable
          onPress={sendResetEmail}
          disabled={sending}
          style={({ pressed }) => [
            styles.button,
            pressed &&
              styles.buttonPressed,
            sending && {
              opacity: 0.65,
            },
          ]}
        >

          {sending ? (

            <ActivityIndicator
              color="#FFFFFF"
            />

          ) : (

            <Text style={styles.buttonText}>
              Send Reset Link
            </Text>

          )}

        </Pressable>


        <Pressable
          onPress={() =>
            router.replace(
              '/(auth)/login'
            )
          }
        >

          <Text style={styles.backToLogin}>
            Back to Login
          </Text>

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
    paddingTop: 18,
  },

  backButton: {
    width: 42,
    height: 42,

    alignItems: 'center',
    justifyContent: 'center',

    borderRadius: 14,

    backgroundColor:
      Colors.surface,

    borderWidth: 1,
    borderColor:
      Colors.border,
  },

  iconBox: {
    width: 68,
    height: 68,

    alignItems: 'center',
    justifyContent: 'center',

    borderRadius: 22,

    backgroundColor:
      Colors.roseMist,

    marginTop: 50,
  },

  title: {
    color:
      Colors.primaryDark,

    fontSize: 27,
    fontWeight: '800',

    marginTop: 20,
  },

  description: {
    color:
      Colors.textSecondary,

    fontSize: 12,
    lineHeight: 19,

    marginTop: 7,
    marginBottom: 27,

    maxWidth: 330,
  },

  label: {
    color:
      Colors.textSecondary,

    fontSize: 10,
    fontWeight: '700',

    marginBottom: 7,
  },

  inputBox: {
    height: 52,

    flexDirection: 'row',
    alignItems: 'center',

    gap: 9,

    paddingHorizontal: 14,

    backgroundColor:
      Colors.surface,

    borderWidth: 1,
    borderColor:
      Colors.border,

    borderRadius: 15,
  },

  input: {
    flex: 1,

    color:
      Colors.textPrimary,

    fontSize: 14,
  },

  button: {
    height: 52,

    alignItems: 'center',
    justifyContent: 'center',

    borderRadius: 16,

    backgroundColor:
      Colors.primary,

    marginTop: 18,
  },

  buttonText: {
    color: '#FFFFFF',

    fontSize: 14,
    fontWeight: '800',
  },

  backToLogin: {
    color:
      Colors.primaryDark,

    fontSize: 11,
    fontWeight: '700',

    textAlign: 'center',

    marginTop: 18,
  },

  buttonPressed: {
    opacity: 0.82,
  },

});