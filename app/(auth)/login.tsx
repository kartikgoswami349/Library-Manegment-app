import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import { router } from 'expo-router';

import { AppTheme, Colors } from '../../constants/theme';
import { supabase } from '../../lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password) {
      Alert.alert(
        'Missing information',
        'Please enter your email and password.'
      );
      return;
    }

    try {
      setLoading(true);

      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (error) {
        Alert.alert('Login failed', error.message);
        return;
      }

      if (!data.user) {
        Alert.alert(
          'Login failed',
          'User account could not be found.'
        );
        return;
      }

      const { data: profile, error: profileError } =
        await supabase
          .from('profiles')
          .select(
            'id, full_name, role, subscription_start, subscription_expiry, is_enabled'
          )
          .eq('id', data.user.id)
          .single();

      if (profileError || !profile) {
        await supabase.auth.signOut();

        Alert.alert(
          'Profile error',
          'Your library profile could not be found.'
        );
        return;
      }

      if (!profile.is_enabled) {
        await supabase.auth.signOut();

        Alert.alert(
          'Account disabled',
          'Please contact the library administrator.'
        );
        return;
      }

      // Subscription dates DO NOT block access.

      if (profile.role === 'admin') {
        router.replace('/(admin)');
        return;
      }

      if (profile.role === 'subscriber') {
        router.replace('/(user)');
        return;
      }

      await supabase.auth.signOut();

      Alert.alert(
        'Access denied',
        'This account does not have a valid role.'
      );
    } catch (error) {
      console.log(error);

      Alert.alert(
        'Error',
        'Something went wrong. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topDecoration} />
          <View style={styles.bottomDecoration} />

          <View style={styles.brandSection}>
            <Image
              source={require('../../assets/images/library-logo.png')}
              style={styles.logo}
            />

            <Text style={styles.appTitle}>
              Library
            </Text>

            <Text style={styles.tagline}>
              ज्ञान • भक्ति • अध्यात्म
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.welcome}>
                Welcome Back
              </Text>

              <Text style={styles.description}>
                Sign in to explore your library
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>
                Email Address
              </Text>

              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Enter your email"
                placeholderTextColor={Colors.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>
                Password
              </Text>

              <View style={styles.passwordBox}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  placeholderTextColor={Colors.textSecondary}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  style={styles.passwordInput}
                />

                <Pressable
                  onPress={() =>
                    setShowPassword(!showPassword)
                  }
                  style={styles.showButton}
                >
                  <Text style={styles.showText}>
                    {showPassword ? 'Hide' : 'Show'}
                  </Text>
                </Pressable>
              </View>
            </View>

            <Pressable
  onPress={() =>
    router.push(
      '/(auth)/forgot-password'
    )
  }
  style={styles.forgotButton}
>

  <Text style={styles.forgotText}>
    Forgot Password?
  </Text>

</Pressable>

            <Pressable
              onPress={handleLogin}
              disabled={loading}
              style={({ pressed }) => [
                styles.loginButton,
                pressed && styles.loginPressed,
                loading && styles.loginDisabled,
              ]}
            >
              {loading ? (
                <ActivityIndicator
                  color={Colors.surface}
                />
              ) : (
                <Text style={styles.loginText}>
                  Sign In
                </Text>
              )}
            </Pressable>
          </View>
            <View style={styles.divider} />

            <View style={styles.signupRow}>

           <Text style={styles.signupQuestion}>
           Don't have an account?
            </Text>

           <Pressable
    onPress={() =>
      router.push('/(auth)/signup')
    }
  >
    <Text style={styles.signupLink}>
      Create Account
    </Text>
  </Pressable>

</View>

          <Text style={styles.footer}>
            Digital Library Management System
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },

  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  signupRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  marginTop: 4,
},

signupQuestion: {
  color: Colors.textSecondary,
  fontSize: 11,
},

signupLink: {
  color: Colors.primaryDark,
  fontSize: 11,
  fontWeight: '800',
},

  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 32,
    overflow: 'hidden',
  },

  topDecoration: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: Colors.softAccent,
    opacity: 0.45,
    top: -110,
    right: -100,
  },

  bottomDecoration: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: Colors.roseMist,
    bottom: -90,
    left: -85,
  },

  brandSection: {
    alignItems: 'center',
    marginBottom: 28,
  },

  logo: {
    width: 150,
    height: 125,
    resizeMode: 'contain',
    marginBottom: 4,
  },

  appTitle: {
    color: Colors.primaryDark,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
  },

  tagline: {
    color: Colors.textSecondary,
    marginTop: 6,
    fontSize: 14,
    letterSpacing: 1.2,
  },

  card: {
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',

    backgroundColor: Colors.surface,

    borderRadius: 28,

    paddingHorizontal: 22,
    paddingVertical: 26,

    borderWidth: 1,
    borderColor: Colors.border,

    elevation: 5,

    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 8,
    },
  },

  cardHeader: {
    marginBottom: 25,
  },

  welcome: {
    color: Colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
  },

  description: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginTop: 7,
  },

  field: {
    marginBottom: 19,
  },

  label: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 9,
  },

  input: {
    height: 54,

    backgroundColor: Colors.roseMist,

    borderRadius: AppTheme.radius.medium,

    borderWidth: 1,
    borderColor: Colors.border,

    paddingHorizontal: 16,

    color: Colors.textPrimary,
    fontSize: 16,
  },

  passwordBox: {
    height: 54,

    flexDirection: 'row',
    alignItems: 'center',

    backgroundColor: Colors.roseMist,

    borderRadius: AppTheme.radius.medium,

    borderWidth: 1,
    borderColor: Colors.border,
  },

  passwordInput: {
    flex: 1,
    height: '100%',

    paddingHorizontal: 16,

    color: Colors.textPrimary,
    fontSize: 16,
  },

  showButton: {
    height: '100%',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },

  showText: {
    color: Colors.primaryDark,
    fontWeight: '700',
    fontSize: 13,
  },

  loginButton: {
    height: 55,

    backgroundColor: Colors.primary,

    borderRadius: AppTheme.radius.medium,

    alignItems: 'center',
    justifyContent: 'center',

    marginTop: 4,

    elevation: 2,
  },

  loginPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.9,
  },

  loginDisabled: {
    opacity: 0.7,
  },

  loginText: {
    color: Colors.surface,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 22,
  },

  forgotButton: {
  alignSelf: 'flex-end',
  marginTop: 8,
  marginBottom: 5,
},

forgotText: {
  color: Colors.primaryDark,
  fontSize: 11,
  fontWeight: '700',
},

  

  footer: {
    textAlign: 'center',
    marginTop: 22,
    color: Colors.textSecondary,
    fontSize: 11,
  },
});