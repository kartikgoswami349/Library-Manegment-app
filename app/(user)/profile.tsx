import {
    useEffect,
    useState,
} from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { router } from 'expo-router';
import {
    ActivityIndicator,
    Alert,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';



import {
    getMyProfile,
    MyProfile,
    updateMyProfile,
} from '../../services/account';

import {
    Colors,
} from '../../constants/theme';


export default function ProfileScreen() {

  const [profile, setProfile] =
    useState<MyProfile | null>(null);

  const [name, setName] =
    useState('');

    const [mobileNumber, setMobileNumber] =
  useState('');
  

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);


  useEffect(() => {
    loadProfile();
  }, []);


  async function loadProfile() {
  try {
    const data =
      await getMyProfile();

    setProfile(data);

    setName(
      data?.full_name ?? ''
    );

    setMobileNumber(
      data?.mobile_number ?? ''
    );

  } finally {
    setLoading(false);
  }
}


  async function saveName() {

    if (!name.trim()) {

      Alert.alert(
        'Name Required',
        'Please enter your name.'
      );

      return;
    }


    try {

      setSaving(true);

      await updateMyProfile(
        name,
        mobileNumber
      );


      Alert.alert(
        'Profile Updated',
        'Your name has been updated.'
      );

      await loadProfile();


    } catch (error: any) {

      Alert.alert(
        'Update Failed',
        error?.message ??
          'Unable to update profile.'
      );


    } finally {

      setSaving(false);

    }

  }


  function formatDate(
    value: string | null
  ) {

    if (!value) {
      return 'Not set';
    }

    return new Date(
      value.length === 10
        ? `${value}T00:00:00`
        : value
    ).toLocaleDateString(
      'en-IN',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }
    );

  }


  if (loading) {

    return (
      <SafeAreaView
        style={styles.loading}
      >
        <ActivityIndicator
          size="large"
          color={Colors.primary}
        />
      </SafeAreaView>
    );

  }


  if (!profile) {
    return null;
  }


  return (

    <SafeAreaView
      style={styles.safeArea}
    >

      <ScrollView
      showsVerticalScrollIndicator={false}
       contentContainerStyle={styles.container}
           >

        <View style={styles.header}>

  <View style={styles.headerText}>
    

    <Text style={styles.headerTitle}>
      My Profile
    </Text>
    

    <Text style={styles.headerSubtitle}>
      Manage your account
    </Text>

  </View>


  <Image
    source={require(
      '../../assets/images/library-logo.png'
    )}
    style={styles.logo}
    resizeMode="contain"
  />

</View>


        <View style={styles.profileCard}>

          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(
                name[0] ??
                profile.email?.[0] ??
                '?'
              ).toUpperCase()}
            </Text>
          </View>

          <Text style={styles.name}>
            {name}
          </Text>

          <Text style={styles.email}>
            {profile.email}
          </Text>

        </View>


        <View style={styles.formCard}>

          <Text style={styles.label}>
            Full Name
          </Text>

          <TextInput
            value={name}
            onChangeText={setName}
            style={styles.input}
          />

          


          <Text style={styles.label}>
  Mobile Number
          </Text>

<TextInput
  value={mobileNumber}
  onChangeText={setMobileNumber}
  style={styles.input}
  placeholder="Enter mobile number"
  placeholderTextColor={
    Colors.textSecondary
  }
  keyboardType="phone-pad"
  maxLength={15}
/>


          <Text style={styles.label}>
            Email
          </Text>

          <View style={styles.readOnly}>
            <Text style={styles.readOnlyText}>
              {profile.email}
            </Text>
          </View>


          <Text style={styles.label}>
            Subscription Start
          </Text>

          <Text style={styles.infoText}>
            {formatDate(
              profile.subscription_start
            )}
          </Text>


          <Text style={styles.label}>
            Subscription Expiry
          </Text>

          <Text style={styles.infoText}>
            {formatDate(
              profile.subscription_expiry
            )}
          </Text>


          <Text style={styles.label}>
            Account Created
          </Text>

          <Text style={styles.infoText}>
            {formatDate(
              profile.created_at
            )}
          </Text>

        </View>

        <Pressable
  onPress={() =>
    router.push('/change-password')
  }
  style={({ pressed }) => [
    styles.passwordButton,
    pressed && {
      opacity: 0.75,
    },
  ]}
>

  <Text style={styles.passwordButtonText}>
    Change Password
  </Text>

</Pressable>


        <Pressable
          onPress={saveName}
          disabled={saving}
          style={styles.saveButton}
        >

          {saving ? (
            <ActivityIndicator
              color="#FFFFFF"
            />
          ) : (
            <Text style={styles.saveText}>
              Save Profile
            </Text>
          )}

        </Pressable>

        

      </ScrollView>
    

    </SafeAreaView>
    

  );

}


const styles = StyleSheet.create({

  safeArea: {
    flex: 1,
    backgroundColor:
      Colors.background,
  },
  headerText: {
  flex: 1,
},

  container: {
  paddingHorizontal: 16,
  paddingTop: 8,
  paddingBottom: 110,
},

  header: {
  flexDirection: 'row',
  alignItems: 'center',

  paddingTop: 12,
  paddingBottom: 5,
},


  headerTitle: {
  color: Colors.primaryDark,

  fontSize: 25,
  fontWeight: '800',
},


  
logo: {
  width: 52,
  height: 52,
},

  profileCard: {
    alignItems: 'center',

    marginTop: 22,
    marginBottom: 18,
  },

  avatar: {
    width: 75,
    height: 75,
    borderRadius: 25,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor:
      Colors.softAccent,
  },

  avatarText: {
    color:
      Colors.primaryDark,

    fontSize: 29,
    fontWeight: '800',
  },

  name: {
    color:
      Colors.textPrimary,

    fontSize: 18,
    fontWeight: '800',
    marginTop: 9,
  },

  email: {
    color:
      Colors.textSecondary,

    fontSize: 10,
    marginTop: 3,
  },

  formCard: {
    backgroundColor:
      Colors.surface,

    borderWidth: 1,
    borderColor:
      Colors.border,

    borderRadius: 19,
    padding: 14,
  },

  label: {
    color:
      Colors.textSecondary,

    fontSize: 9,
    marginTop: 10,
    marginBottom: 5,
  },
  

  input: {
    height: 45,

    borderRadius: 12,

    paddingHorizontal: 11,

    color:
      Colors.textPrimary,

    backgroundColor:
      Colors.roseMist,
  },
   passwordButton: {
  height: 47,

  alignItems: 'center',
  justifyContent: 'center',

  marginTop: 14,

  borderRadius: 15,

  backgroundColor: Colors.softAccent,

  borderWidth: 1,
  borderColor: Colors.border,
},

passwordButtonText: {
  color: Colors.primaryDark,

  fontSize: 12,
  fontWeight: '800',
},
  headerSubtitle: {
  color: Colors.textSecondary,

  fontSize: 11,
  marginTop: 3,
},

  readOnly: {
    minHeight: 45,

    justifyContent: 'center',

    paddingHorizontal: 11,

    borderRadius: 12,

    backgroundColor:
      '#F6F3F4',
  },

  readOnlyText: {
    color:
      Colors.textSecondary,

    fontSize: 11,
  },

  infoText: {
    color:
      Colors.textPrimary,

    fontSize: 11,
    fontWeight: '700',
  },

  saveButton: {
    height: 51,

    alignItems: 'center',
    justifyContent: 'center',

    marginTop: 16,

    borderRadius: 16,

    backgroundColor:
      Colors.primary,
  },

  saveText: {
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

});