import {
    useEffect,
    useState,
} from 'react';

import {
    ActivityIndicator,
    Alert,
    Image,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from 'react-native';

import {
    Ionicons,
} from '@expo/vector-icons';

import {
    router,
    useLocalSearchParams,
} from 'expo-router';

import DateTimePicker, {
    DateTimePickerEvent,
} from '@react-native-community/datetimepicker';

import {
    AdminSubscriber,
    getSubscriberById,
    updateSubscriber,
} from '../../../services/subscribers';

import {
    Colors,
} from '../../../constants/theme';


export default function SubscriberDetailsScreen() {

  const { id } =
    useLocalSearchParams<{
      id: string;
    }>();

  const [subscriber, setSubscriber] =
    useState<AdminSubscriber | null>(null);

  const [fullName, setFullName] =
    useState('');

  const [startDate, setStartDate] =
    useState<string | null>(null);

  const [expiryDate, setExpiryDate] =
    useState<string | null>(null);

  const [enabled, setEnabled] =
    useState(true);

  const [showStartPicker, setShowStartPicker] =
    useState(false);

  const [showExpiryPicker, setShowExpiryPicker] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);


  useEffect(() => {

    if (id) {
      loadSubscriber();
    }

  }, [id]);


  async function loadSubscriber() {

    try {

      setLoading(true);

      const result =
        await getSubscriberById(id);

      if (!result) {

        Alert.alert(
          'Subscriber Not Found',
          'This subscriber could not be found.',
          [
            {
              text: 'Go Back',
              onPress: () =>
                router.back(),
            },
          ]
        );

        return;
      }

      setSubscriber(result);

      setFullName(
        result.full_name ?? ''
      );

      setStartDate(
        result.subscription_start
      );

      setExpiryDate(
        result.subscription_expiry
      );

      setEnabled(
        result.is_enabled
      );

    } catch (error: any) {

      Alert.alert(
        'Unable to Load Subscriber',
        error?.message ??
          'Something went wrong.'
      );

    } finally {

      setLoading(false);

    }

  }


  function dateFromString(
    value: string | null
  ) {

    if (!value) {
      return new Date();
    }

    return new Date(
      `${value}T00:00:00`
    );

  }


  function dateToString(
    date: Date
  ) {

    const year =
      date.getFullYear();

    const month =
      String(
        date.getMonth() + 1
      ).padStart(2, '0');

    const day =
      String(
        date.getDate()
      ).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }


  function prettyDate(
    value: string | null
  ) {

    if (!value) {
      return 'Not set';
    }

    return dateFromString(value)
      .toLocaleDateString(
        'en-IN',
        {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }
      );

  }


  function onStartChange(
    event: DateTimePickerEvent,
    date?: Date
  ) {

    if (Platform.OS === 'android') {
      setShowStartPicker(false);
    }

    if (
      event.type === 'set' &&
      date
    ) {
      setStartDate(
        dateToString(date)
      );
    }

  }


  function onExpiryChange(
    event: DateTimePickerEvent,
    date?: Date
  ) {

    if (Platform.OS === 'android') {
      setShowExpiryPicker(false);
    }

    if (
      event.type === 'set' &&
      date
    ) {
      setExpiryDate(
        dateToString(date)
      );
    }

  }


  async function saveChanges() {

    if (!fullName.trim()) {

      Alert.alert(
        'Name Required',
        'Please enter the subscriber name.'
      );

      return;
    }


    if (
      startDate &&
      expiryDate &&
      expiryDate < startDate
    ) {

      Alert.alert(
        'Invalid Dates',
        'Subscription expiry cannot be before the start date.'
      );

      return;
    }


    try {

      setSaving(true);

      await updateSubscriber(
        id,
        {
          full_name:
            fullName.trim(),

          subscription_start:
            startDate,

          subscription_expiry:
            expiryDate,

          is_enabled:
            enabled,
        }
      );


      Alert.alert(
        'Subscriber Updated',
        'The account has been updated successfully.',
        [
          {
            text: 'Done',
            onPress: () =>
              router.back(),
          },
        ]
      );

    } catch (error: any) {

      Alert.alert(
        'Update Failed',
        error?.message ??
          'Unable to update this subscriber.'
      );

    } finally {

      setSaving(false);

    }

  }


  if (loading) {

    return (

      <SafeAreaView
        style={styles.loadingScreen}
      >

        <ActivityIndicator
          size="large"
          color={Colors.primary}
        />

        <Text style={styles.loadingText}>
          Loading subscriber...
        </Text>

      </SafeAreaView>

    );

  }


  if (!subscriber) {
    return null;
  }


  return (

    <SafeAreaView
      style={styles.safeArea}
    >

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >


        {/* HEADER */}

        <View style={styles.header}>

          <Pressable
            onPress={() =>
              router.back()
            }
            style={styles.backButton}
          >

            <Ionicons
              name="chevron-back"
              size={23}
              color={Colors.primaryDark}
            />

          </Pressable>


          <View style={styles.headerText}>

            <Text style={styles.headerTitle}>
              Subscriber Details
            </Text>

            <Text style={styles.headerSubtitle}>
              View & manage account
            </Text>

          </View>


          <Image
            source={require(
              '../../../assets/images/library-logo.png'
            )}
            style={styles.logo}
            resizeMode="contain"
          />

        </View>



        {/* PROFILE */}

        <View style={styles.profileCard}>

          <View style={styles.avatar}>

            <Text style={styles.avatarText}>
              {(
                fullName.trim()[0] ??
                subscriber.email?.[0] ??
                '?'
              ).toUpperCase()}
            </Text>

          </View>


          <View style={styles.profileInfo}>

            <Text style={styles.profileName}>
              {fullName || 'Subscriber'}
            </Text>

            <Text
              style={styles.email}
              numberOfLines={1}
            >
              {subscriber.email}
            </Text>

          </View>


          <View
            style={[
              styles.statusBadge,

              enabled
                ? styles.enabledBadge
                : styles.disabledBadge,
            ]}
          >

            <Text
              style={[
                styles.statusText,

                enabled
                  ? styles.enabledText
                  : styles.disabledText,
              ]}
            >
              {enabled
                ? 'Enabled'
                : 'Disabled'}
            </Text>

          </View>

        </View>



        {/* ACCOUNT */}

        <Text style={styles.sectionTitle}>
          Account Information
        </Text>


        <View style={styles.formCard}>

          <Text style={styles.label}>
            Full Name
          </Text>

          <View style={styles.inputBox}>

            <Ionicons
              name="person-outline"
              size={18}
              color={Colors.primary}
            />

            <TextInput
              value={fullName}
              onChangeText={setFullName}
              style={styles.input}
            />

          </View>


          <Text style={styles.label}>
            Email Address
          </Text>

          <View
            style={[
              styles.inputBox,
              styles.readOnlyBox,
            ]}
          >

            <Ionicons
              name="mail-outline"
              size={18}
              color={Colors.textSecondary}
            />

            <Text
              style={styles.readOnlyText}
              numberOfLines={1}
            >
              {subscriber.email}
            </Text>

          </View>

          <Text style={styles.helperText}>
            Email cannot be changed from this screen.
          </Text>

        </View>



        {/* SUBSCRIPTION */}

        <Text style={styles.sectionTitle}>
          Subscription
        </Text>


        <View style={styles.formCard}>

          <Text style={styles.label}>
            Subscription Start
          </Text>

          <Pressable
            onPress={() =>
              setShowStartPicker(true)
            }
            style={styles.dateBox}
          >

            <Ionicons
              name="calendar-outline"
              size={18}
              color={Colors.primary}
            />

            <Text style={styles.dateText}>
              {prettyDate(startDate)}
            </Text>

            <Ionicons
              name="chevron-down"
              size={16}
              color={Colors.textSecondary}
            />

          </Pressable>


          {startDate && (

            <Pressable
              onPress={() =>
                setStartDate(null)
              }
              style={styles.clearDate}
            >
              <Text style={styles.clearDateText}>
                Clear start date
              </Text>
            </Pressable>

          )}


          {showStartPicker && (

            <DateTimePicker
              value={
                dateFromString(
                  startDate
                )
              }
              mode="date"
              onChange={
                onStartChange
              }
            />

          )}



          <Text
            style={[
              styles.label,
              styles.secondLabel,
            ]}
          >
            Subscription Expiry
          </Text>


          <Pressable
            onPress={() =>
              setShowExpiryPicker(true)
            }
            style={styles.dateBox}
          >

            <Ionicons
              name="calendar-outline"
              size={18}
              color={Colors.primary}
            />

            <Text style={styles.dateText}>
              {prettyDate(expiryDate)}
            </Text>

            <Ionicons
              name="chevron-down"
              size={16}
              color={Colors.textSecondary}
            />

          </Pressable>


          {expiryDate && (

            <Pressable
              onPress={() =>
                setExpiryDate(null)
              }
              style={styles.clearDate}
            >
              <Text style={styles.clearDateText}>
                Clear expiry date
              </Text>
            </Pressable>

          )}


          {showExpiryPicker && (

            <DateTimePicker
              value={
                dateFromString(
                  expiryDate
                )
              }
              mode="date"
              onChange={
                onExpiryChange
              }
            />

          )}


          <View style={styles.subscriptionNote}>

            <Ionicons
              name="information-circle-outline"
              size={17}
              color={Colors.primary}
            />

            <Text style={styles.subscriptionNoteText}>
              Subscription dates are for record keeping only and do not restrict book browsing.
            </Text>

          </View>

        </View>



        {/* STATUS */}

        <Text style={styles.sectionTitle}>
          Account Access
        </Text>


        <View style={styles.accessCard}>

          <View style={styles.accessIcon}>

            <Ionicons
              name={
                enabled
                  ? 'checkmark-circle-outline'
                  : 'ban-outline'
              }
              size={23}
              color={
                enabled
                  ? Colors.success
                  : Colors.danger
              }
            />

          </View>


          <View style={styles.accessContent}>

            <Text style={styles.accessTitle}>
              Account Enabled
            </Text>

            <Text style={styles.accessDescription}>
              Disabled accounts cannot use library services.
            </Text>

          </View>


          <Switch
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{
              false: '#E6CED3',
              true: Colors.softAccent,
            }}
            thumbColor={
              enabled
                ? Colors.primary
                : '#999999'
            }
          />

        </View>



        {/* CREATED */}

        <View style={styles.createdRow}>

          <Ionicons
            name="time-outline"
            size={14}
            color={Colors.textSecondary}
          />

          <Text style={styles.createdText}>
            Account created:{' '}
            {subscriber.created_at
              ? new Date(
                  subscriber.created_at
                ).toLocaleDateString(
                  'en-IN',
                  {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  }
                )
              : 'Unknown'}
          </Text>

        </View>



        {/* SAVE */}

        <Pressable
          onPress={saveChanges}
          disabled={saving}
          style={[
            styles.saveButton,

            saving &&
              styles.saveDisabled,
          ]}
        >

          {saving ? (

            <ActivityIndicator
              color="#FFFFFF"
            />

          ) : (

            <>
              <Ionicons
                name="save-outline"
                size={19}
                color="#FFFFFF"
              />

              <Text style={styles.saveText}>
                Save Changes
              </Text>
            </>

          )}

        </Pressable>


      </ScrollView>

    </SafeAreaView>

  );

}


const styles = StyleSheet.create({

  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },

  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: Colors.surface,

    borderWidth: 1,
    borderColor: Colors.border,
  },

  headerText: {
    flex: 1,
    marginLeft: 11,
  },

  headerTitle: {
    color: Colors.primaryDark,
    fontSize: 21,
    fontWeight: '800',
  },

  headerSubtitle: {
    color: Colors.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },

  logo: {
    width: 45,
    height: 45,
  },

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',

    padding: 13,

    borderRadius: 19,

    backgroundColor: Colors.surface,

    borderWidth: 1,
    borderColor: Colors.border,

    marginBottom: 22,
  },

  avatar: {
    width: 50,
    height: 50,
    borderRadius: 17,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: Colors.roseMist,
  },

  avatarText: {
    color: Colors.primaryDark,
    fontSize: 20,
    fontWeight: '800',
  },

  profileInfo: {
    flex: 1,
    marginLeft: 11,
  },

  profileName: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },

  email: {
    color: Colors.textSecondary,
    fontSize: 10,
    marginTop: 3,
  },

  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },

  enabledBadge: {
    backgroundColor: '#EAF6EF',
  },

  disabledBadge: {
    backgroundColor: '#FFF1F3',
  },

  statusText: {
    fontSize: 8,
    fontWeight: '800',
  },

  enabledText: {
    color: Colors.success,
  },

  disabledText: {
    color: Colors.danger,
  },

  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 9,
  },

  formCard: {
    backgroundColor: Colors.surface,

    padding: 14,

    borderRadius: 19,

    borderWidth: 1,
    borderColor: Colors.border,

    marginBottom: 20,
  },

  label: {
    color: Colors.textPrimary,
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 6,
  },

  secondLabel: {
    marginTop: 15,
  },

  inputBox: {
    height: 47,

    flexDirection: 'row',
    alignItems: 'center',

    gap: 8,

    paddingHorizontal: 12,

    borderRadius: 13,

    backgroundColor: Colors.roseMist,

    borderWidth: 1,
    borderColor: Colors.border,

    marginBottom: 13,
  },

  input: {
    flex: 1,
    height: '100%',
    color: Colors.textPrimary,
    fontSize: 12,
  },

  readOnlyBox: {
    backgroundColor: '#F7F5F5',
    marginBottom: 4,
  },

  readOnlyText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 11,
  },

  helperText: {
    color: Colors.textSecondary,
    fontSize: 8,
  },

  dateBox: {
    height: 47,

    flexDirection: 'row',
    alignItems: 'center',

    gap: 8,

    paddingHorizontal: 12,

    borderRadius: 13,

    backgroundColor: Colors.roseMist,

    borderWidth: 1,
    borderColor: Colors.border,
  },

  dateText: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 11,
    fontWeight: '600',
  },

  clearDate: {
    alignSelf: 'flex-end',
    marginTop: 5,
  },

  clearDateText: {
    color: Colors.danger,
    fontSize: 8,
    fontWeight: '700',
  },

  subscriptionNote: {
    flexDirection: 'row',
    gap: 7,

    padding: 10,
    marginTop: 15,

    borderRadius: 11,

    backgroundColor: Colors.softAccent,
  },

  subscriptionNoteText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 9,
    lineHeight: 13,
  },

  accessCard: {
    flexDirection: 'row',
    alignItems: 'center',

    padding: 13,

    borderRadius: 17,

    backgroundColor: Colors.surface,

    borderWidth: 1,
    borderColor: Colors.border,

    marginBottom: 12,
  },

  accessIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: Colors.roseMist,
  },

  accessContent: {
    flex: 1,
    marginLeft: 11,
  },

  accessTitle: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },

  accessDescription: {
    color: Colors.textSecondary,
    fontSize: 8,
    marginTop: 2,
  },

  createdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,

    marginBottom: 17,
  },

  createdText: {
    color: Colors.textSecondary,
    fontSize: 9,
  },

  saveButton: {
    height: 51,

    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',

    gap: 7,

    borderRadius: 16,

    backgroundColor: Colors.primary,
  },

  saveDisabled: {
    opacity: 0.65,
  },

  saveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },

  loadingText: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 8,
  },

});