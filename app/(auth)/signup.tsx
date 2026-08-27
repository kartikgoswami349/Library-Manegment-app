import { useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { Ionicons } from '@expo/vector-icons';

import {
    router,
} from 'expo-router';

import {
    supabase,
} from '../../lib/supabase';

import {
    Colors,
} from '../../constants/theme';


export default function SignupScreen() {

  const [fullName, setFullName] =
    useState('');

  const [email, setEmail] =
    useState('');
    const [mobileNumber, setMobileNumber] =
  useState('');

  const [password, setPassword] =
    useState('');

  const [confirmPassword, setConfirmPassword] =
    useState('');

  const [showPassword, setShowPassword] =
    useState(false);

  const [loading, setLoading] =
    useState(false);


  async function createAccount() {

    if (
      !mobileNumber.trim() ||
      !fullName.trim() ||
  !email.trim() ||
  !password
) {

  Alert.alert(
    'Missing Information',
    'Please enter your name, mobile number, email and password.'
  );

  return;
}


    if (password.length < 6) {

      Alert.alert(
        'Password Too Short',
        'Password must contain at least 6 characters.'
      );

      return;
    }


    if (password !== confirmPassword) {

      Alert.alert(
        'Passwords Do Not Match',
        'Please enter the same password in both fields.'
      );

      return;
    }


    try {

      setLoading(true);


      const {
        data,
        error,
      } = await supabase.auth.signUp({

        email:
          email.trim().toLowerCase(),

        password,

        options: {

  data: {
    full_name:
      fullName.trim(),

    mobile_number:
      mobileNumber.trim(),
  },

},

      });


      if (error) {
        throw error;
      }


      /*
       * Email confirmation disabled:
       * Supabase normally returns a session
       * immediately.
       */

      if (data.session) {

        router.replace(
          '/(user)'
        );

        return;
      }


      /*
       * Email confirmation enabled:
       */

      Alert.alert(
        'Account Created',
        'Please check your email and confirm your account before signing in.',
        [
          {
            text: 'OK',

            onPress: () =>
              router.replace(
                '/(auth)/login'
              ),
          },
        ]
      );


    } catch (error: any) {

      console.log(
        'Signup error:',
        error
      );


      Alert.alert(
        'Unable to Create Account',
        error?.message ??
          'Something went wrong.'
      );


    } finally {

      setLoading(false);

    }

  }


  return (

    <SafeAreaView
      style={styles.safeArea}
    >

      <KeyboardAvoidingView
        style={styles.flex}

        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : undefined
        }
      >

        <ScrollView
          showsVerticalScrollIndicator={
            false
          }

          keyboardShouldPersistTaps="handled"

          contentContainerStyle={
            styles.content
          }
        >


          <Pressable
            onPress={() =>
              router.back()
            }

            style={styles.backButton}
          >

            <Ionicons
              name="chevron-back"
              size={23}
              color={
                Colors.primaryDark
              }
            />

          </Pressable>



          <View style={styles.brand}>

            <Image
              source={require(
                '../../assets/images/library-logo.png'
              )}

              style={styles.logo}

              resizeMode="contain"
            />


            <Text style={styles.title}>
              Create Account
            </Text>


            <Text style={styles.subtitle}>
              Join the library
            </Text>

          </View>



          <View style={styles.formCard}>


            <InputField
              label="Full Name"
              placeholder="Enter your full name"
              value={fullName}
              onChangeText={
                setFullName
              }
              icon="person-outline"
            />

            <InputField
  label="Mobile Number"
  placeholder="Enter your mobile number"
  value={mobileNumber}
  onChangeText={setMobileNumber}
  icon="call-outline"
  keyboardType="phone-pad"
/>


            <InputField
              label="Email Address"
              placeholder="Enter your email"
              value={email}
              onChangeText={
                setEmail
              }
              icon="mail-outline"
              keyboardType="email-address"
              autoCapitalize="none"
            />


            <Text style={styles.label}>
              Password
            </Text>


            <View style={styles.inputBox}>

              <Ionicons
                name="lock-closed-outline"
                size={18}
                color={
                  Colors.primary
                }
              />

              <TextInput
                value={password}
                onChangeText={
                  setPassword
                }

                placeholder="Create password"

                placeholderTextColor={
                  Colors.textSecondary
                }

                secureTextEntry={
                  !showPassword
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

                  size={19}

                  color={
                    Colors.textSecondary
                  }
                />

              </Pressable>

            </View>



            <InputField
              label="Confirm Password"
              placeholder="Enter password again"
              value={confirmPassword}
              onChangeText={
                setConfirmPassword
              }
              icon="shield-checkmark-outline"
              secureTextEntry={
                !showPassword
              }
            />


            <Pressable
              onPress={
                createAccount
              }

              disabled={loading}

              style={[
                styles.signupButton,

                loading &&
                  styles.disabledButton,
              ]}
            >

              {loading ? (

                <ActivityIndicator
                  color="#FFFFFF"
                />

              ) : (

                <>
                  <Ionicons
                    name="person-add-outline"
                    size={20}
                    color="#FFFFFF"
                  />

                  <Text
                    style={
                      styles.signupText
                    }
                  >
                    Create Account
                  </Text>
                </>

              )}

            </Pressable>



            <View style={styles.loginRow}>

              <Text
                style={
                  styles.loginQuestion
                }
              >
                Already have an account?
              </Text>


              <Pressable
                onPress={() =>
                  router.replace(
                    '/(auth)/login'
                  )
                }
              >

                <Text
                  style={
                    styles.loginLink
                  }
                >
                  Sign In
                </Text>

              </Pressable>

            </View>


          </View>


        </ScrollView>

      </KeyboardAvoidingView>

    </SafeAreaView>

  );

}



function InputField({
  label,
  placeholder,
  value,
  onChangeText,
  icon,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  secureTextEntry = false,
}: {
  label: string;
  placeholder: string;
  value: string;

  onChangeText:
    (value: string) => void;

  icon:
    keyof typeof Ionicons.glyphMap;

  keyboardType?:
  | 'default'
  | 'email-address'
  | 'phone-pad';

  autoCapitalize?:
    'none' |
    'sentences';

  secureTextEntry?: boolean;
}) {

  return (

    <View style={styles.field}>

      <Text style={styles.label}>
        {label}
      </Text>


      <View style={styles.inputBox}>

        <Ionicons
          name={icon}
          size={18}
          color={Colors.primary}
        />

        <TextInput
          value={value}

          onChangeText={
            onChangeText
          }

          placeholder={
            placeholder
          }

          placeholderTextColor={
            Colors.textSecondary
          }

          keyboardType={
            keyboardType
          }

          autoCapitalize={
            autoCapitalize
          }

          secureTextEntry={
            secureTextEntry
          }

          style={styles.input}
        />

      </View>

    </View>

  );

}



const styles = StyleSheet.create({

  flex: {
    flex: 1,
  },


  safeArea: {
    flex: 1,
    backgroundColor:
      Colors.background,
  },


  content: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 35,
  },


  backButton: {
    width: 40,
    height: 40,

    borderRadius: 20,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor:
      Colors.surface,

    borderWidth: 1,
    borderColor:
      Colors.border,
  },


  brand: {
    alignItems: 'center',

    marginTop: 5,
    marginBottom: 20,
  },


  logo: {
    width: 100,
    height: 90,
  },


  title: {
    color:
      Colors.primaryDark,

    fontSize: 28,
    fontWeight: '800',

    marginTop: 6,
  },


  subtitle: {
    color:
      Colors.textSecondary,

    fontSize: 13,

    marginTop: 4,
  },


  formCard: {
    backgroundColor:
      Colors.surface,

    padding: 17,

    borderRadius: 22,

    borderWidth: 1,
    borderColor:
      Colors.border,
  },


  field: {
    marginBottom: 14,
  },


  label: {
    color:
      Colors.textPrimary,

    fontSize: 12,
    fontWeight: '700',

    marginBottom: 7,
  },


  inputBox: {
    height: 50,

    flexDirection: 'row',
    alignItems: 'center',

    gap: 9,

    paddingHorizontal: 13,

    borderRadius: 14,

    backgroundColor:
      Colors.roseMist,

    borderWidth: 1,
    borderColor:
      Colors.border,

    marginBottom: 14,
  },


  input: {
    flex: 1,

    height: '100%',

    color:
      Colors.textPrimary,

    fontSize: 13,
  },


  signupButton: {
    height: 52,

    marginTop: 7,

    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',

    gap: 8,

    borderRadius: 16,

    backgroundColor:
      Colors.primary,
  },


  signupText: {
    color: '#FFFFFF',

    fontSize: 14,
    fontWeight: '800',
  },


  disabledButton: {
    opacity: 0.65,
  },


  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',

    gap: 5,

    marginTop: 18,
  },


  loginQuestion: {
    color:
      Colors.textSecondary,

    fontSize: 11,
  },


  loginLink: {
    color:
      Colors.primaryDark,

    fontSize: 11,
    fontWeight: '800',
  },

});