import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import {
    AdminSubscriber,
    searchSubscribers,
    setSubscriberEnabled,
} from '../../services/subscribers';

import { Colors } from '../../constants/theme';


export default function SubscribersScreen() {

  const [searchText, setSearchText] =
    useState('');

  const [subscribers, setSubscribers] =
    useState<AdminSubscriber[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);


  useEffect(() => {
    loadSubscribers();
  }, []);


  async function loadSubscribers(
    text: string = searchText,
    refresh = false
  ) {

    try {

      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }


      const result =
        await searchSubscribers(text);

      setSubscribers(result);


    } catch (error: any) {

      Alert.alert(
        'Unable to Load Subscribers',
        error?.message ?? 'Something went wrong.'
      );

    } finally {

      setLoading(false);
      setRefreshing(false);

    }

  }


  function clearSearch() {

    setSearchText('');
    loadSubscribers('');

  }


  function changeStatus(
    subscriber: AdminSubscriber
  ) {

    const newStatus =
      !subscriber.is_enabled;


    Alert.alert(
      newStatus
        ? 'Enable Account'
        : 'Disable Account',

      newStatus
        ? `Enable ${subscriber.full_name ?? 'this subscriber'}?`
        : `Disable ${subscriber.full_name ?? 'this subscriber'}? They will no longer be able to use the library app.`,

      [
        {
          text: 'Cancel',
          style: 'cancel',
        },

        {
          text: newStatus
            ? 'Enable'
            : 'Disable',

          style: newStatus
            ? 'default'
            : 'destructive',

          onPress: async () => {

            try {

              await setSubscriberEnabled(
                subscriber.id,
                newStatus
              );

              await loadSubscribers(
                searchText
              );


            } catch (error: any) {

              Alert.alert(
                'Update Failed',
                error?.message ??
                  'Unable to update account.'
              );

            }

          },
        },
      ]
    );

  }


  function formatDate(
    value: string | null
  ) {

    if (!value) {
      return 'Not set';
    }

    const date = new Date(value);

    return date.toLocaleDateString(
      'en-IN',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }
    );

  }


  function renderSubscriber({
    item,
  }: {
    item: AdminSubscriber;
  }) {

    return (

      <Pressable
        style={({ pressed }) => [
          styles.card,

          !item.is_enabled &&
            styles.disabledCard,

          pressed &&
            styles.pressed,
        ]}
      >

        <View style={styles.avatar}>

          <Text style={styles.avatarText}>
            {(
              item.full_name?.trim()?.[0] ??
              item.email?.[0] ??
              '?'
            ).toUpperCase()}
          </Text>

        </View>


        <View style={styles.cardContent}>

          <View style={styles.nameRow}>

            <Text
              style={styles.name}
              numberOfLines={1}
            >
              {item.full_name || 'Unnamed Subscriber'}
            </Text>


            <View
              style={[
                styles.statusBadge,

                item.is_enabled
                  ? styles.enabledBadge
                  : styles.disabledBadge,
              ]}
            >

              <Text
                style={[
                  styles.statusText,

                  item.is_enabled
                    ? styles.enabledText
                    : styles.disabledText,
                ]}
              >
                {item.is_enabled
                  ? 'Enabled'
                  : 'Disabled'}
              </Text>

            </View>

          </View>


          <View style={styles.infoRow}>

            <Ionicons
              name="mail-outline"
              size={13}
              color={Colors.textSecondary}
            />

            <Text
              style={styles.email}
              numberOfLines={1}
            >
              {item.email || 'No email'}
            </Text>

          </View>


          <View style={styles.subscriptionBox}>

            <View style={styles.dateColumn}>

              <Text style={styles.dateLabel}>
                Start
              </Text>

              <Text style={styles.dateValue}>
                {formatDate(
                  item.subscription_start
                )}
              </Text>

            </View>


            <View style={styles.dateDivider} />


            <View style={styles.dateColumn}>

              <Text style={styles.dateLabel}>
                Expiry
              </Text>

              <Text style={styles.dateValue}>
                {formatDate(
                  item.subscription_expiry
                )}
              </Text>

            </View>

          </View>


          <View style={styles.actions}>

            <Pressable
            onPress={() =>
             router.push({
               pathname:
                 '/(admin)/subscriber/[id]',
               params: {
                 id: item.id,
               },
             })
           }
  style={styles.detailsButton}
>

              <Ionicons
                name="person-outline"
                size={15}
                color={Colors.primaryDark}
              />

              <Text style={styles.detailsText}>
                Details
              </Text>

            </Pressable>


            <Pressable
              onPress={(event) => {

                event.stopPropagation();

                changeStatus(item);

              }}
              style={[
                styles.statusButton,

                item.is_enabled
                  ? styles.disableButton
                  : styles.enableButton,
              ]}
            >

              <Ionicons
                name={
                  item.is_enabled
                    ? 'ban-outline'
                    : 'checkmark-circle-outline'
                }
                size={15}
                color={
                  item.is_enabled
                    ? Colors.danger
                    : Colors.success
                }
              />

              <Text
                style={[
                  styles.statusButtonText,

                  {
                    color:
                      item.is_enabled
                        ? Colors.danger
                        : Colors.success,
                  },
                ]}
              >

                {item.is_enabled
                  ? 'Disable'
                  : 'Enable'}

              </Text>

            </Pressable>

          </View>

        </View>

      </Pressable>

    );

  }


  return (

    <SafeAreaView style={styles.safeArea}>

      <View style={styles.container}>


        {/* HEADER */}

        <View style={styles.header}>

          <Pressable
            onPress={() => router.back()}
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
              Subscribers
            </Text>

            <Text style={styles.headerSubtitle}>
              Manage library accounts
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



        {/* SEARCH */}

        <View style={styles.searchRow}>

          <View style={styles.searchBox}>

            <Ionicons
              name="search-outline"
              size={19}
              color={Colors.primary}
            />

            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search name or email..."
              placeholderTextColor={
                Colors.textSecondary
              }
              returnKeyType="search"
              onSubmitEditing={() =>
                loadSubscribers(searchText)
              }
              style={styles.searchInput}
            />


            {!!searchText && (

              <Pressable
                onPress={clearSearch}
              >

                <Ionicons
                  name="close-circle"
                  size={19}
                  color={Colors.textSecondary}
                />

              </Pressable>

            )}

          </View>


          <Pressable
            onPress={() =>
              loadSubscribers(searchText)
            }
            style={styles.searchButton}
          >

            <Ionicons
              name="search"
              size={19}
              color="#FFFFFF"
            />

          </Pressable>

        </View>



        {/* COUNT */}

        <View style={styles.resultHeader}>

          <Text style={styles.resultTitle}>
            Subscriber Accounts
          </Text>

          <View style={styles.countBadge}>

            <Text style={styles.countText}>
              {subscribers.length}
            </Text>

          </View>

        </View>



        {loading ? (

          <View style={styles.loadingArea}>

            <ActivityIndicator
              size="large"
              color={Colors.primary}
            />

            <Text style={styles.loadingText}>
              Loading subscribers...
            </Text>

          </View>

        ) : (

          <FlatList
            data={subscribers}
            renderItem={renderSubscriber}

            keyExtractor={(item) =>
              item.id
            }

            showsVerticalScrollIndicator={false}

            contentContainerStyle={
              styles.listContent
            }

            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() =>
                  loadSubscribers(
                    searchText,
                    true
                  )
                }
              />
            }

            ListEmptyComponent={

              <View style={styles.emptyState}>

                <Ionicons
                  name="people-outline"
                  size={48}
                  color={Colors.secondary}
                />

                <Text style={styles.emptyTitle}>
                  No subscribers found
                </Text>

                <Text style={styles.emptyText}>
                  New user accounts will appear here.
                </Text>

              </View>

            }
          />

        )}

      </View>

    </SafeAreaView>

  );

}


const styles = StyleSheet.create({

  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  container: {
    flex: 1,
    paddingHorizontal: 16,
    backgroundColor: Colors.background,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 15,
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
    fontSize: 22,
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

  searchRow: {
    flexDirection: 'row',
    gap: 8,
  },

  searchBox: {
    flex: 1,
    height: 49,

    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,

    paddingHorizontal: 13,

    backgroundColor: Colors.surface,

    borderWidth: 1,
    borderColor: Colors.border,

    borderRadius: 16,
  },

  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 12,
  },

  searchButton: {
    width: 49,
    height: 49,
    borderRadius: 16,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: Colors.primary,
  },

  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',

    marginTop: 19,
    marginBottom: 10,
  },

  resultTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },

  countBadge: {
    minWidth: 26,
    height: 26,

    paddingHorizontal: 7,

    alignItems: 'center',
    justifyContent: 'center',

    borderRadius: 13,

    backgroundColor: Colors.softAccent,

    marginLeft: 8,
  },

  countText: {
    color: Colors.primaryDark,
    fontSize: 11,
    fontWeight: '800',
  },

  card: {
    flexDirection: 'row',

    backgroundColor: Colors.surface,

    borderRadius: 19,

    padding: 12,

    marginBottom: 10,

    borderWidth: 1,
    borderColor: Colors.border,
  },

  disabledCard: {
    opacity: 0.68,
  },

  avatar: {
    width: 49,
    height: 49,

    borderRadius: 16,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: Colors.roseMist,
  },

  avatarText: {
    color: Colors.primaryDark,
    fontSize: 19,
    fontWeight: '800',
  },

  cardContent: {
    flex: 1,
    marginLeft: 11,
  },

  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  name: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 5,
  },

  email: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 10,
  },

  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
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

  subscriptionBox: {
    flexDirection: 'row',

    marginTop: 10,

    padding: 9,

    borderRadius: 11,

    backgroundColor: Colors.roseMist,
  },

  dateColumn: {
    flex: 1,
  },

  dateDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 8,
  },

  dateLabel: {
    color: Colors.textSecondary,
    fontSize: 8,
  },

  dateValue: {
    color: Colors.textPrimary,
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
  },

  actions: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 9,
  },

  detailsButton: {
    height: 31,

    flexDirection: 'row',
    alignItems: 'center',

    gap: 5,

    paddingHorizontal: 10,

    borderRadius: 10,

    backgroundColor: Colors.softAccent,
  },

  detailsText: {
    color: Colors.primaryDark,
    fontSize: 9,
    fontWeight: '800',
  },

  statusButton: {
    height: 31,

    flexDirection: 'row',
    alignItems: 'center',

    gap: 5,

    paddingHorizontal: 10,

    borderRadius: 10,

    borderWidth: 1,
  },

  disableButton: {
    backgroundColor: '#FFF5F6',
    borderColor: '#F4CDD4',
  },

  enableButton: {
    backgroundColor: '#F1F9F4',
    borderColor: '#CBE7D4',
  },

  statusButtonText: {
    fontSize: 9,
    fontWeight: '800',
  },

  loadingArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 8,
  },

  listContent: {
    paddingBottom: 30,
  },

  emptyState: {
    alignItems: 'center',
    paddingTop: 75,
  },

  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    marginTop: 11,
  },

  emptyText: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 4,
  },

  pressed: {
    opacity: 0.8,
  },

});