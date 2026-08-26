import {
    useEffect,
    useState,
} from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
    ActivityIndicator,
    FlatList,
    Image,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import {
    Ionicons,
} from '@expo/vector-icons';

import {
    router,
} from 'expo-router';

import {
    getMyBorrowings,
    MyBorrowing,
} from '../../services/account';

import {
    Colors,
} from '../../constants/theme';


type Filter =
  | 'all'
  | 'issued'
  | 'overdue'
  | 'returned';



export default function MyBorrowingsScreen() {

  const [records, setRecords] =
    useState<MyBorrowing[]>([]);

  const [filter, setFilter] =
    useState<Filter>('all');

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);


  useEffect(() => {

    loadBorrowings('all');

  }, []);


  async function loadBorrowings(
    selectedFilter: Filter,
    refresh = false
  ) {

    try {

      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }


      const data =
        await getMyBorrowings(
          selectedFilter
        );


      setRecords(data);


    } finally {

      setLoading(false);
      setRefreshing(false);

    }

  }


  async function changeFilter(
    value: Filter
  ) {

    setFilter(value);

    await loadBorrowings(value);

  }


  function prettyDate(
    value: string | null
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


    return date.toLocaleDateString(
      'en-IN',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }
    );

  }


  function renderBook({
    item,
  }: {
    item: MyBorrowing;
  }) {

    return (

      <Pressable
        onPress={() =>
          router.push({
            pathname:
              '/book/[id]',
            params: {
              id: item.book_id,
            },
          })
        }
        style={styles.card}
      >

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
                size={27}
                color={Colors.primary}
              />

            </View>

          )}

        </View>


        <View style={styles.content}>

          <View style={styles.titleRow}>

            <Text
              style={styles.title}
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
                {item.status ===
                'returned'
                  ? 'Returned'
                  : item.status ===
                      'overdue'
                  ? 'Overdue'
                  : 'Issued'}
              </Text>

            </View>

          </View>


          <Text
            style={styles.info}
            numberOfLines={1}
          >
            Writer - {item.author}
          </Text>


          <Text
            style={styles.info}
            numberOfLines={1}
          >
            Publisher -{' '}
            {item.publisher ||
              'Not set'}
          </Text>


          <Text style={styles.serial}>
            #{item.serial_number}
          </Text>


          <View style={styles.dateArea}>

            <View>

              <Text
                style={styles.dateLabel}
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


            <View>

              <Text
                style={styles.dateLabel}
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

          </View>


          {item.returned_at && (

            <Text
              style={styles.returnedDate}
            >
              Returned:{' '}
              {prettyDate(
                item.returned_at
              )}
            </Text>

          )}

        </View>

      </Pressable>

    );

  }


  return (

    <SafeAreaView
      style={styles.safeArea}
    >

      <View style={styles.container}>


        <View style={styles.header}>


          <View style={styles.headerText}>

            <Text
              style={styles.headerTitle}
            >
              My Borrowings
            </Text>

            <Text
              style={
                styles.headerSubtitle
              }
            >
              Your Borrowing activity
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



        <View style={styles.filters}>

          {(
            [
              'all',
              'issued',
              'overdue',
              'returned',
            ] as Filter[]
          ).map((item) => (

            <Pressable
              key={item}

              onPress={() =>
                changeFilter(item)
              }

              style={[
                styles.filterButton,

                filter === item &&
                  styles.activeFilter,
              ]}
            >

              <Text
                style={[
                  styles.filterText,

                  filter === item &&
                    styles.activeFilterText,
                ]}
              >
                {item === 'all'
                  ? 'All'
                  : item === 'issued'
                  ? 'Issued'
                  : item === 'overdue'
                  ? 'Overdue'
                  : 'Returned'}
              </Text>

            </Pressable>

          ))}

        </View>



        {loading ? (

          <View style={styles.loadingArea}>

            <ActivityIndicator
              size="large"
              color={Colors.primary}
            />

          </View>

        ) : (

          <FlatList
            data={records}

            renderItem={renderBook}

            keyExtractor={(item) =>
              item.borrowing_id
            }

            showsVerticalScrollIndicator={
              false
            }

            contentContainerStyle={
              styles.list
            }

            refreshControl={
              <RefreshControl
                refreshing={refreshing}

                onRefresh={() =>
                  loadBorrowings(
                    filter,
                    true
                  )
                }
              />
            }

            ListEmptyComponent={

              <View style={styles.empty}>

                <Ionicons
                  name="library-outline"
                  size={50}
                  color={
                    Colors.secondary
                  }
                />

                <Text
                  style={
                    styles.emptyTitle
                  }
                >
                  No borrowing records
                </Text>

                <Text
                  style={
                    styles.emptyText
                  }
                >
                  Your issued and returned books will appear here.
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
    backgroundColor:
      Colors.background,
  },

  container: {
    flex: 1,
    paddingHorizontal: 16,
  },

  header: {
  flexDirection: 'row',
  alignItems: 'center',

  paddingTop: 12,
  paddingBottom: 17,
},


  headerText: {
  flex: 1,
},

  headerTitle: {
  color: Colors.primaryDark,

  fontSize: 25,
  fontWeight: '800',
},

  headerSubtitle: {
  color: Colors.textSecondary,

  fontSize: 11,
  marginTop: 3,
},

  logo: {
  width: 52,
  height: 52,
},

  filters: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 15,
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

  activeFilter: {
    backgroundColor:
      Colors.softAccent,

    borderColor:
      Colors.secondary,
  },

  filterText: {
    color:
      Colors.textSecondary,

    fontSize: 8,
    fontWeight: '700',
  },

  activeFilterText: {
    color:
      Colors.primaryDark,

    fontWeight: '800',
  },

  card: {
    flexDirection: 'row',

    padding: 10,

    borderRadius: 18,

    backgroundColor:
      Colors.surface,

    borderWidth: 1,
    borderColor:
      Colors.border,

    marginBottom: 9,
  },

  coverBox: {
    width: 72,
    height: 104,

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

  content: {
    flex: 1,
    marginLeft: 11,
  },

  titleRow: {
    flexDirection: 'row',
    gap: 5,
  },

  title: {
    flex: 1,

    color:
      Colors.textPrimary,

    fontSize: 14,
    fontWeight: '800',
  },

  info: {
    color:
      Colors.textSecondary,

    fontSize: 9,
    marginTop: 3,
  },

  serial: {
    color:
      Colors.primaryDark,

    fontSize: 9,
    fontWeight: '800',
    marginTop: 5,
  },

  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,

    borderRadius: 7,

    alignSelf: 'flex-start',
  },

  statusText: {
    fontSize: 7,
    fontWeight: '800',
  },

  issuedBadge: {
    backgroundColor: '#FFF4E6',
  },

  issuedText: {
    color: '#C17916',
  },

  overdueBadge: {
    backgroundColor: '#FFF0F2',
  },

  overdueText: {
    color: Colors.danger,
  },

  returnedBadge: {
    backgroundColor: '#EAF6EF',
  },

  returnedText: {
    color: Colors.success,
  },

  dateArea: {
    flexDirection: 'row',
    justifyContent:
      'space-between',

    marginTop: 9,

    padding: 8,

    borderRadius: 10,

    backgroundColor:
      Colors.roseMist,
  },

  dateLabel: {
    color:
      Colors.textSecondary,
    fontSize: 7,
  },

  dateValue: {
    color:
      Colors.textPrimary,

    fontSize: 8,
    fontWeight: '800',

    marginTop: 2,
  },

  returnedDate: {
    color:
      Colors.success,

    fontSize: 8,
    fontWeight: '700',

    marginTop: 6,
  },

  loadingArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  list: {
  paddingBottom: 105,
},
  empty: {
    alignItems: 'center',
    paddingTop: 80,
  },

  emptyTitle: {
    color:
      Colors.textPrimary,

    fontSize: 17,
    fontWeight: '800',

    marginTop: 10,
  },

  emptyText: {
    color:
      Colors.textSecondary,

    fontSize: 10,

    marginTop: 4,
    textAlign: 'center',
  },

});