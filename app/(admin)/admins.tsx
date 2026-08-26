import {
    useEffect,
    useState,
} from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

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
    Ionicons,
} from '@expo/vector-icons';

import {
    router,
} from 'expo-router';

import {
    AdminAccount,
    demoteAdmin,
    promoteUserToAdmin,
    searchAdmins,
} from '../../services/admins';

import {
    AdminSubscriber,
    searchSubscribers,
} from '../../services/subscribers';

import {
    Colors,
} from '../../constants/theme';



export default function AdminManagementScreen() {

  const [admins, setAdmins] =
    useState<AdminAccount[]>([]);

  const [subscriberSearch, setSubscriberSearch] =
    useState('');

  const [subscriberResults, setSubscriberResults] =
    useState<AdminSubscriber[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [searching, setSearching] =
    useState(false);


  useEffect(() => {
    loadAdmins();
  }, []);


  async function loadAdmins() {

    try {

      setLoading(true);

      const result =
        await searchAdmins();

      setAdmins(result);

    } catch (error: any) {

      Alert.alert(
        'Unable to Load Admins',
        error?.message ??
          'Something went wrong.'
      );

    } finally {

      setLoading(false);

    }

  }


  async function findSubscribers() {

    if (!subscriberSearch.trim()) {

      Alert.alert(
        'Search Subscriber',
        'Enter a subscriber name or email.'
      );

      return;
    }


    try {

      setSearching(true);

      const result =
        await searchSubscribers(
          subscriberSearch
        );

      setSubscriberResults(
        result.filter(
          (subscriber) =>
            subscriber.is_enabled
        )
      );

    } catch (error: any) {

      Alert.alert(
        'Search Failed',
        error?.message ??
          'Unable to search subscribers.'
      );

    } finally {

      setSearching(false);

    }

  }


  function confirmPromotion(
    subscriber: AdminSubscriber
  ) {

    Alert.alert(
      'Promote to Admin',
      `Give ${subscriber.full_name || subscriber.email} administrator access?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },

        {
          text: 'Promote',

          onPress: async () => {

            try {

              await promoteUserToAdmin(
                subscriber.id
              );

              setSubscriberResults([]);
              setSubscriberSearch('');

              await loadAdmins();


              Alert.alert(
                'Administrator Added',
                'The account now has administrator access.'
              );

            } catch (error: any) {

              Alert.alert(
                'Promotion Failed',
                error?.message ??
                  'Unable to promote this account.'
              );

            }

          },
        },
      ]
    );

  }


  function confirmDemotion(
    admin: AdminAccount
  ) {

    if (admin.is_current_user) {

      Alert.alert(
        'Not Allowed',
        'You cannot remove your own administrator access.'
      );

      return;
    }


    Alert.alert(
      'Remove Admin Access',
      `${admin.full_name || admin.email} will become a normal subscriber. Continue?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },

        {
          text: 'Remove Admin',
          style: 'destructive',

          onPress: async () => {

            try {

              await demoteAdmin(
                admin.id
              );

              await loadAdmins();


              Alert.alert(
                'Admin Removed',
                'The account is now a subscriber.'
              );

            } catch (error: any) {

              Alert.alert(
                'Unable to Remove Admin',
                error?.message ??
                  'Something went wrong.'
              );

            }

          },
        },
      ]
    );

  }


  return (

    <SafeAreaView style={styles.safeArea}>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
              Admin Management
            </Text>

            <Text style={styles.headerSubtitle}>
              Manage administrator access
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



        {/* CURRENT ADMINS */}

        <View style={styles.sectionHeader}>

          <Text style={styles.sectionTitle}>
            Administrators
          </Text>

          <View style={styles.countBadge}>

            <Text style={styles.countText}>
              {admins.length}
            </Text>

          </View>

        </View>


        {loading ? (

          <View style={styles.loadingBox}>

            <ActivityIndicator
              color={Colors.primary}
            />

          </View>

        ) : (

          admins.map((admin) => (

            <View
              key={admin.id}
              style={styles.adminCard}
            >

              <View style={styles.adminAvatar}>

                <Text style={styles.avatarText}>
                  {(
                    admin.full_name?.[0] ??
                    admin.email?.[0] ??
                    'A'
                  ).toUpperCase()}
                </Text>

              </View>


              <View style={styles.adminContent}>

                <View style={styles.nameRow}>

                  <Text
                    style={styles.adminName}
                    numberOfLines={1}
                  >
                    {admin.full_name ||
                      'Administrator'}
                  </Text>


                  {admin.is_current_user && (

                    <View style={styles.youBadge}>

                      <Text style={styles.youText}>
                        You
                      </Text>

                    </View>

                  )}

                </View>


                <Text
                  style={styles.adminEmail}
                  numberOfLines={1}
                >
                  {admin.email}
                </Text>


                <View style={styles.adminRoleRow}>

                  <Ionicons
                    name="shield-checkmark"
                    size={13}
                    color={Colors.primary}
                  />

                  <Text style={styles.adminRole}>
                    Administrator
                  </Text>

                </View>

              </View>


              {!admin.is_current_user && (

                <Pressable
                  onPress={() =>
                    confirmDemotion(
                      admin
                    )
                  }
                  style={styles.removeButton}
                >

                  <Ionicons
                    name="person-remove-outline"
                    size={18}
                    color={Colors.danger}
                  />

                </Pressable>

              )}

            </View>

          ))

        )}



        {/* ADD ADMIN */}

        <Text style={styles.addSectionTitle}>
          Add Administrator
        </Text>

        <Text style={styles.description}>
          Search an existing subscriber and promote their account to administrator.
        </Text>


        <View style={styles.searchRow}>

          <View style={styles.searchBox}>

            <Ionicons
              name="search-outline"
              size={19}
              color={Colors.primary}
            />

            <TextInput
              value={subscriberSearch}
              onChangeText={
                setSubscriberSearch
              }
              placeholder="Subscriber name or email..."
              placeholderTextColor={
                Colors.textSecondary
              }
              returnKeyType="search"
              onSubmitEditing={
                findSubscribers
              }
              style={styles.searchInput}
            />

          </View>


          <Pressable
            onPress={findSubscribers}
            style={styles.searchButton}
          >

            {searching ? (

              <ActivityIndicator
                size="small"
                color="#FFFFFF"
              />

            ) : (

              <Ionicons
                name="search"
                size={19}
                color="#FFFFFF"
              />

            )}

          </Pressable>

        </View>



        {subscriberResults.map(
          (subscriber) => (

            <View
              key={subscriber.id}
              style={styles.subscriberCard}
            >

              <View style={styles.subscriberAvatar}>

                <Text style={styles.avatarText}>
                  {(
                    subscriber.full_name?.[0] ??
                    subscriber.email?.[0] ??
                    '?'
                  ).toUpperCase()}
                </Text>

              </View>


              <View style={styles.subscriberContent}>

                <Text
                  style={styles.subscriberName}
                  numberOfLines={1}
                >
                  {subscriber.full_name ||
                    'Subscriber'}
                </Text>

                <Text
                  style={styles.subscriberEmail}
                  numberOfLines={1}
                >
                  {subscriber.email}
                </Text>

              </View>


              <Pressable
                onPress={() =>
                  confirmPromotion(
                    subscriber
                  )
                }
                style={styles.promoteButton}
              >

                <Ionicons
                  name="shield-checkmark-outline"
                  size={15}
                  color="#FFFFFF"
                />

                <Text style={styles.promoteText}>
                  Promote
                </Text>

              </Pressable>

            </View>

          )
        )}



        {/* SECURITY NOTE */}

        <View style={styles.securityCard}>

          <Ionicons
            name="lock-closed-outline"
            size={20}
            color={Colors.primaryDark}
          />

          <Text style={styles.securityText}>
            New public accounts always start as subscribers. Only an existing administrator can grant admin access.
          </Text>

        </View>


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
    marginBottom: 21,
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

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },

  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },

  countBadge: {
    minWidth: 25,
    height: 25,
    borderRadius: 13,

    alignItems: 'center',
    justifyContent: 'center',

    paddingHorizontal: 6,

    backgroundColor: Colors.softAccent,

    marginLeft: 7,
  },

  countText: {
    color: Colors.primaryDark,
    fontSize: 10,
    fontWeight: '800',
  },

  loadingBox: {
    padding: 25,
    alignItems: 'center',
  },

  adminCard: {
    flexDirection: 'row',
    alignItems: 'center',

    padding: 12,

    backgroundColor: Colors.surface,

    borderWidth: 1,
    borderColor: Colors.border,

    borderRadius: 18,

    marginBottom: 9,
  },

  adminAvatar: {
    width: 46,
    height: 46,
    borderRadius: 15,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: Colors.softAccent,
  },

  avatarText: {
    color: Colors.primaryDark,
    fontSize: 17,
    fontWeight: '800',
  },

  adminContent: {
    flex: 1,
    marginLeft: 10,
  },

  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  adminName: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },

  adminEmail: {
    color: Colors.textSecondary,
    fontSize: 9,
    marginTop: 2,
  },

  adminRoleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
  },

  adminRole: {
    color: Colors.primaryDark,
    fontSize: 8,
    fontWeight: '700',
  },

  youBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: Colors.roseMist,
  },

  youText: {
    color: Colors.primaryDark,
    fontSize: 7,
    fontWeight: '800',
  },

  removeButton: {
    width: 37,
    height: 37,

    alignItems: 'center',
    justifyContent: 'center',

    borderRadius: 12,

    backgroundColor: '#FFF2F4',
  },

  addSectionTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 22,
  },

  description: {
    color: Colors.textSecondary,
    fontSize: 9,
    lineHeight: 13,
    marginTop: 4,
    marginBottom: 10,
  },

  searchRow: {
    flexDirection: 'row',
    gap: 8,
  },

  searchBox: {
    flex: 1,
    height: 48,

    flexDirection: 'row',
    alignItems: 'center',

    gap: 8,

    paddingHorizontal: 12,

    borderRadius: 15,

    backgroundColor: Colors.surface,

    borderWidth: 1,
    borderColor: Colors.border,
  },

  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 11,
  },

  searchButton: {
    width: 48,
    height: 48,

    alignItems: 'center',
    justifyContent: 'center',

    borderRadius: 15,

    backgroundColor: Colors.primary,
  },

  subscriberCard: {
    flexDirection: 'row',
    alignItems: 'center',

    marginTop: 9,
    padding: 10,

    borderRadius: 16,

    backgroundColor: Colors.surface,

    borderWidth: 1,
    borderColor: Colors.border,
  },

  subscriberAvatar: {
    width: 42,
    height: 42,

    borderRadius: 14,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: Colors.roseMist,
  },

  subscriberContent: {
    flex: 1,
    marginLeft: 9,
  },

  subscriberName: {
    color: Colors.textPrimary,
    fontSize: 11,
    fontWeight: '800',
  },

  subscriberEmail: {
    color: Colors.textSecondary,
    fontSize: 8,
    marginTop: 2,
  },

  promoteButton: {
    height: 32,

    flexDirection: 'row',
    alignItems: 'center',

    gap: 4,

    paddingHorizontal: 9,

    borderRadius: 10,

    backgroundColor: Colors.primary,
  },

  promoteText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '800',
  },

  securityCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',

    gap: 8,

    padding: 12,

    marginTop: 20,

    borderRadius: 14,

    backgroundColor: Colors.softAccent,
  },

  securityText: {
    flex: 1,

    color: Colors.textSecondary,

    fontSize: 9,
    lineHeight: 13,
  },

});