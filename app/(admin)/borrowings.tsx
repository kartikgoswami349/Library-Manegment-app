import {
    useEffect,
    useState,
} from 'react';
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

import {
    Ionicons,
} from '@expo/vector-icons';

import {
    router,
} from 'expo-router';

import {
    BorrowingHistoryItem,
    searchBorrowingHistory,
} from '../../services/borrowings';

import {
    Colors,
} from '../../constants/theme';



type HistoryFilter =
  | 'all'
  | 'issued'
  | 'returned'
  | 'overdue';



export default function BorrowingHistoryScreen() {

  const [
    searchText,
    setSearchText,
  ] = useState('');

  const [
    filter,
    setFilter,
  ] =
    useState<HistoryFilter>('all');

  const [
    records,
    setRecords,
  ] =
    useState<BorrowingHistoryItem[]>(
      []
    );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);



  useEffect(() => {

    loadHistory('', filter);

  }, []);



  async function loadHistory(
    text: string = searchText,
    selectedFilter:
      HistoryFilter = filter,
    refresh = false
  ) {

    try {

      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }


      const data =
        await searchBorrowingHistory(
          text,
          selectedFilter
        );


      setRecords(data);


    } catch (error: any) {

      Alert.alert(
        'Unable to Load History',
        error?.message ??
          'Something went wrong.'
      );


    } finally {

      setLoading(false);
      setRefreshing(false);

    }

  }



  async function changeFilter(
    newFilter: HistoryFilter
  ) {

    setFilter(newFilter);

    await loadHistory(
      searchText,
      newFilter
    );

  }



  function clearSearch() {

    setSearchText('');

    loadHistory(
      '',
      filter
    );

  }



  function prettyDate(
    value: string | null,
    includeTime = false
  ) {

    if (!value) {
      return 'Not set';
    }


    const date =
      new Date(
        value.length === 10
          ? `${value}T00:00:00`
          : value
      );


    if (includeTime) {

      return date.toLocaleString(
        'en-IN',
        {
          day: '2-digit',
          month: 'short',
          year: 'numeric',

          hour: '2-digit',
          minute: '2-digit',
        }
      );

    }


    return date.toLocaleDateString(
      'en-IN',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }
    );

  }



  function statusLabel(
    status:
      BorrowingHistoryItem['status']
  ) {

    if (status === 'returned') {
      return 'Returned';
    }

    if (status === 'overdue') {
      return 'Overdue';
    }

    return 'Issued';

  }



  function renderRecord({
    item,
  }: {
    item: BorrowingHistoryItem;
  }) {

    return (

      <View style={styles.card}>


        {/* TOP */}

        <View style={styles.bookRow}>

          <View style={styles.coverBox}>

            {item.cover_url ? (

              <Image
                source={{
                  uri:
                    item.cover_url,
                }}
                style={styles.cover}
                resizeMode="cover"
              />

            ) : (

              <View
                style={
                  styles.coverPlaceholder
                }
              >

                <Ionicons
                  name="book-outline"
                  size={25}
                  color={
                    Colors.primary
                  }
                />

              </View>

            )}

          </View>



          <View style={styles.bookContent}>

            <View style={styles.titleRow}>

              <Text
                style={styles.bookTitle}
                numberOfLines={2}
              >
                {item.title}
              </Text>


              <View
                style={[
                  styles.statusBadge,

                  item.status ===
                    'returned'
                    ? styles.returnedBadge

                    : item.status ===
                        'overdue'
                    ? styles.overdueBadge

                    : styles.issuedBadge,
                ]}
              >

                <Text
                  style={[
                    styles.statusText,

                    item.status ===
                      'returned'
                      ? styles.returnedText

                      : item.status ===
                          'overdue'
                      ? styles.overdueText

                      : styles.issuedText,
                  ]}
                >
                  {statusLabel(
                    item.status
                  )}
                </Text>

              </View>

            </View>


            <Text
              style={styles.bookInfo}
              numberOfLines={1}
            >
              <Text
                style={
                  styles.infoLabel
                }
              >
                Writer -{' '}
              </Text>

              {item.author}
            </Text>


            <Text
              style={styles.bookInfo}
              numberOfLines={1}
            >
              <Text
                style={
                  styles.infoLabel
                }
              >
                Publisher -{' '}
              </Text>

              {item.publisher ||
                'Not set'}
            </Text>


            <View
              style={
                styles.serialBadge
              }
            >

              <Ionicons
                name="barcode-outline"
                size={12}
                color={
                  Colors.primaryDark
                }
              />

              <Text
                style={
                  styles.serialText
                }
              >
                #{item.serial_number}
              </Text>

            </View>

          </View>

        </View>



        {/* SUBSCRIBER */}

        <View
          style={styles.subscriberRow}
        >

          <View
            style={
              styles.personIcon
            }
          >

            <Text
              style={
                styles.personInitial
              }
            >
              {(
                item
                  .subscriber_name?.[0] ??
                item
                  .subscriber_email?.[0] ??
                '?'
              ).toUpperCase()}
            </Text>

          </View>


          <View
            style={
              styles.subscriberContent
            }
          >

            <Text
              style={
                styles.subscriberLabel
              }
            >
              Subscriber
            </Text>

            <Text
              style={
                styles.subscriberName
              }
              numberOfLines={1}
            >
              {item.subscriber_name ||
                'Subscriber'}
            </Text>

            <Text
              style={
                styles.subscriberEmail
              }
              numberOfLines={1}
            >
              {item.subscriber_email}
            </Text>

          </View>

        </View>



        {/* DATES */}

        <View style={styles.datesCard}>

          <View style={styles.dateColumn}>

            <Text
              style={styles.dateHeading}
            >
              Issued
            </Text>

            <Text
              style={styles.dateValue}
            >
              {prettyDate(
                item.issued_at
              )}
            </Text>

          </View>


          <View
            style={styles.dateDivider}
          />


          <View style={styles.dateColumn}>

            <Text
              style={styles.dateHeading}
            >
              Due
            </Text>

            <Text
              style={[
                styles.dateValue,

                item.status ===
                  'overdue' && {
                  color:
                    Colors.danger,
                },
              ]}
            >
              {prettyDate(
                item.due_date
              )}
            </Text>

          </View>


          <View
            style={styles.dateDivider}
          />


          <View style={styles.dateColumn}>

            <Text
              style={styles.dateHeading}
            >
              Returned
            </Text>

            <Text
              style={styles.dateValue}
            >
              {item.returned_at
                ? prettyDate(
                    item.returned_at
                  )
                : '—'}
            </Text>

          </View>

        </View>



        {/* ADMIN TRAIL */}

        <View style={styles.adminTrail}>

          <View style={styles.adminLine}>

            <Ionicons
              name="arrow-up-circle-outline"
              size={14}
              color={Colors.primary}
            />

            <Text
              style={styles.adminText}
            >
              Issued by:{' '}
              <Text
                style={
                  styles.adminName
                }
              >
                {item.issued_by_name ||
                  'Admin'}
              </Text>
            </Text>

          </View>


          {item.returned_at && (

            <View
              style={styles.adminLine}
            >

              <Ionicons
                name="arrow-down-circle-outline"
                size={14}
                color={
                  Colors.success
                }
              />

              <Text
                style={
                  styles.adminText
                }
              >
                Received by:{' '}
                <Text
                  style={
                    styles.adminName
                  }
                >
                  {item.received_by_name ||
                    'Admin'}
                </Text>
              </Text>

            </View>

          )}

        </View>



        {item.notes && (

          <View style={styles.notesBox}>

            <Ionicons
              name="document-text-outline"
              size={14}
              color={
                Colors.textSecondary
              }
            />

            <Text
              style={styles.notesText}
            >
              {item.notes}
            </Text>

          </View>

        )}


        <Text style={styles.timestamp}>
          Issued {prettyDate(
            item.issued_at,
            true
          )}
        </Text>


      </View>

    );

  }



  return (

    <SafeAreaView
      style={styles.safeArea}
    >

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
              name="chevron-back"
              size={23}
              color={
                Colors.primaryDark
              }
            />

          </Pressable>


          <View
            style={styles.headerText}
          >

            <Text
              style={styles.headerTitle}
            >
              Borrowing History
            </Text>

            <Text
              style={
                styles.headerSubtitle
              }
            >
              Library circulation records
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

              onChangeText={
                setSearchText
              }

              placeholder="Book, serial, subscriber..."

              placeholderTextColor={
                Colors.textSecondary
              }

              returnKeyType="search"

              onSubmitEditing={() =>
                loadHistory(
                  searchText,
                  filter
                )
              }

              style={
                styles.searchInput
              }
            />


            {!!searchText && (

              <Pressable
                onPress={
                  clearSearch
                }
              >

                <Ionicons
                  name="close-circle"
                  size={18}
                  color={
                    Colors.textSecondary
                  }
                />

              </Pressable>

            )}

          </View>


          <Pressable
            onPress={() =>
              loadHistory(
                searchText,
                filter
              )
            }
            style={
              styles.searchButton
            }
          >

            <Ionicons
              name="search"
              size={19}
              color="#FFFFFF"
            />

          </Pressable>

        </View>



        {/* FILTERS */}

        <View style={styles.filters}>

          <FilterButton
            label="All"
            active={
              filter === 'all'
            }
            onPress={() =>
              changeFilter('all')
            }
          />

          <FilterButton
            label="Issued"
            active={
              filter === 'issued'
            }
            onPress={() =>
              changeFilter('issued')
            }
          />

          <FilterButton
            label="Returned"
            active={
              filter === 'returned'
            }
            onPress={() =>
              changeFilter('returned')
            }
          />

          <FilterButton
            label="Overdue"
            active={
              filter === 'overdue'
            }
            onPress={() =>
              changeFilter('overdue')
            }
          />

        </View>



        {/* RESULTS */}

        <View style={styles.resultsHeader}>

          <Text
            style={styles.resultsTitle}
          >
            Transactions
          </Text>


          <View
            style={styles.countBadge}
          >

            <Text
              style={styles.countText}
            >
              {records.length}
            </Text>

          </View>

        </View>



        {loading ? (

          <View style={styles.loadingArea}>

            <ActivityIndicator
              size="large"
              color={Colors.primary}
            />

            <Text
              style={styles.loadingText}
            >
              Loading history...
            </Text>

          </View>

        ) : (

          <FlatList
            data={records}

            renderItem={
              renderRecord
            }

            keyExtractor={(item) =>
              item.borrowing_id
            }

            showsVerticalScrollIndicator={
              false
            }

            contentContainerStyle={
              styles.listContent
            }

            refreshControl={
              <RefreshControl
                refreshing={refreshing}

                onRefresh={() =>
                  loadHistory(
                    searchText,
                    filter,
                    true
                  )
                }
              />
            }

            ListEmptyComponent={

              <View
                style={styles.emptyState}
              >

                <Ionicons
                  name="time-outline"
                  size={48}
                  color={
                    Colors.secondary
                  }
                />

                <Text
                  style={
                    styles.emptyTitle
                  }
                >
                  No records found
                </Text>

                <Text
                  style={
                    styles.emptyText
                  }
                >
                  Borrowing transactions will appear here.
                </Text>

              </View>

            }
          />

        )}


      </View>

    </SafeAreaView>

  );

}



function FilterButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {

  return (

    <Pressable
      onPress={onPress}

      style={[
        styles.filterButton,

        active &&
          styles.filterButtonActive,
      ]}
    >

      <Text
        style={[
          styles.filterText,

          active &&
            styles.filterTextActive,
        ]}
      >
        {label}
      </Text>

    </Pressable>

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
      paddingHorizontal: 16,
      backgroundColor:
        Colors.background,
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

      backgroundColor:
        Colors.surface,

      borderWidth: 1,
      borderColor:
        Colors.border,
    },

    headerText: {
      flex: 1,
      marginLeft: 11,
    },

    headerTitle: {
      color:
        Colors.primaryDark,

      fontSize: 21,
      fontWeight: '800',
    },

    headerSubtitle: {
      color:
        Colors.textSecondary,

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
      height: 48,

      flexDirection: 'row',
      alignItems: 'center',

      gap: 8,

      paddingHorizontal: 12,

      borderRadius: 15,

      backgroundColor:
        Colors.surface,

      borderWidth: 1,
      borderColor:
        Colors.border,
    },

    searchInput: {
      flex: 1,

      color:
        Colors.textPrimary,

      fontSize: 11,
    },

    searchButton: {
      width: 48,
      height: 48,

      borderRadius: 15,

      alignItems: 'center',
      justifyContent: 'center',

      backgroundColor:
        Colors.primary,
    },

    filters: {
      flexDirection: 'row',
      gap: 6,

      marginTop: 11,
    },

    filterButton: {
      flex: 1,

      height: 35,

      alignItems: 'center',
      justifyContent: 'center',

      borderRadius: 11,

      backgroundColor:
        Colors.surface,

      borderWidth: 1,
      borderColor:
        Colors.border,
    },

    filterButtonActive: {
      backgroundColor:
        Colors.softAccent,

      borderColor:
        Colors.secondary,
    },

    filterText: {
      color:
        Colors.textSecondary,

      fontSize: 9,
      fontWeight: '700',
    },

    filterTextActive: {
      color:
        Colors.primaryDark,

      fontWeight: '800',
    },

    resultsHeader: {
      flexDirection: 'row',
      alignItems: 'center',

      marginTop: 18,
      marginBottom: 10,
    },

    resultsTitle: {
      color:
        Colors.textPrimary,

      fontSize: 15,
      fontWeight: '800',
    },

    countBadge: {
      minWidth: 25,
      height: 25,

      paddingHorizontal: 6,

      borderRadius: 13,

      alignItems: 'center',
      justifyContent: 'center',

      backgroundColor:
        Colors.softAccent,

      marginLeft: 7,
    },

    countText: {
      color:
        Colors.primaryDark,

      fontSize: 10,
      fontWeight: '800',
    },

    card: {
      backgroundColor:
        Colors.surface,

      borderRadius: 19,

      borderWidth: 1,
      borderColor:
        Colors.border,

      padding: 11,

      marginBottom: 10,
    },

    bookRow: {
      flexDirection: 'row',
    },

    coverBox: {
      width: 65,
      height: 93,

      borderRadius: 12,

      overflow: 'hidden',

      backgroundColor:
        Colors.roseMist,
    },

    cover: {
      width: '100%',
      height: '100%',
    },

    coverPlaceholder: {
      flex: 1,

      alignItems: 'center',
      justifyContent: 'center',
    },

    bookContent: {
      flex: 1,
      marginLeft: 10,
    },

    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',

      gap: 5,
    },

    bookTitle: {
      flex: 1,

      color:
        Colors.textPrimary,

      fontSize: 14,
      fontWeight: '800',

      lineHeight: 18,
    },

    statusBadge: {
      paddingHorizontal: 6,
      paddingVertical: 3,

      borderRadius: 7,
    },

    statusText: {
      fontSize: 7,
      fontWeight: '800',
    },

    issuedBadge: {
      backgroundColor:
        '#FFF4E6',
    },

    issuedText: {
      color: '#C17916',
    },

    returnedBadge: {
      backgroundColor:
        '#EAF6EF',
    },

    returnedText: {
      color:
        Colors.success,
    },

    overdueBadge: {
      backgroundColor:
        '#FFF0F2',
    },

    overdueText: {
      color:
        Colors.danger,
    },

    bookInfo: {
      color:
        Colors.textSecondary,

      fontSize: 9,
      marginTop: 3,
    },

    infoLabel: {
      color:
        Colors.textPrimary,

      fontWeight: '700',
    },

    serialBadge: {
      alignSelf: 'flex-start',

      flexDirection: 'row',
      alignItems: 'center',

      gap: 3,

      paddingHorizontal: 6,
      paddingVertical: 3,

      borderRadius: 7,

      backgroundColor:
        Colors.roseMist,

      marginTop: 7,
    },

    serialText: {
      color:
        Colors.primaryDark,

      fontSize: 8,
      fontWeight: '800',
    },

    subscriberRow: {
      flexDirection: 'row',
      alignItems: 'center',

      marginTop: 11,

      paddingTop: 10,

      borderTopWidth: 1,
      borderTopColor:
        Colors.border,
    },

    personIcon: {
      width: 38,
      height: 38,

      borderRadius: 13,

      alignItems: 'center',
      justifyContent: 'center',

      backgroundColor:
        Colors.roseMist,
    },

    personInitial: {
      color:
        Colors.primaryDark,

      fontSize: 15,
      fontWeight: '800',
    },

    subscriberContent: {
      flex: 1,
      marginLeft: 9,
    },

    subscriberLabel: {
      color:
        Colors.textSecondary,

      fontSize: 7,
    },

    subscriberName: {
      color:
        Colors.textPrimary,

      fontSize: 11,
      fontWeight: '800',

      marginTop: 1,
    },

    subscriberEmail: {
      color:
        Colors.textSecondary,

      fontSize: 8,
      marginTop: 1,
    },

    datesCard: {
      flexDirection: 'row',

      marginTop: 10,

      padding: 9,

      borderRadius: 12,

      backgroundColor:
        Colors.roseMist,
    },

    dateColumn: {
      flex: 1,
    },

    dateDivider: {
      width: 1,

      backgroundColor:
        Colors.border,

      marginHorizontal: 7,
    },

    dateHeading: {
      color:
        Colors.textSecondary,

      fontSize: 7,
    },

    dateValue: {
      color:
        Colors.textPrimary,

      fontSize: 8,
      fontWeight: '800',

      marginTop: 3,
    },

    adminTrail: {
      marginTop: 9,

      gap: 4,
    },

    adminLine: {
      flexDirection: 'row',
      alignItems: 'center',

      gap: 5,
    },

    adminText: {
      color:
        Colors.textSecondary,

      fontSize: 8,
    },

    adminName: {
      color:
        Colors.textPrimary,

      fontWeight: '700',
    },

    notesBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',

      gap: 6,

      padding: 8,

      marginTop: 9,

      borderRadius: 10,

      backgroundColor:
        '#F8F6F6',
    },

    notesText: {
      flex: 1,

      color:
        Colors.textSecondary,

      fontSize: 8,
      lineHeight: 12,
    },

    timestamp: {
      color:
        Colors.textSecondary,

      fontSize: 7,

      textAlign: 'right',

      marginTop: 8,
    },

    loadingArea: {
      flex: 1,

      alignItems: 'center',
      justifyContent: 'center',
    },

    loadingText: {
      color:
        Colors.textSecondary,

      fontSize: 10,
      marginTop: 8,
    },

    listContent: {
      paddingBottom: 35,
    },

    emptyState: {
      alignItems: 'center',
      paddingTop: 75,
    },

    emptyTitle: {
      color:
        Colors.textPrimary,

      fontSize: 16,
      fontWeight: '800',

      marginTop: 10,
    },

    emptyText: {
      color:
        Colors.textSecondary,

      fontSize: 10,

      marginTop: 4,
    },

  });