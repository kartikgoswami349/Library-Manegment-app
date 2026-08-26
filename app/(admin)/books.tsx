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
    AdminBook,
    searchAdminBooks,
    setBookActiveStatus,
} from '../../services/books';

import {
    Colors
} from '../../constants/theme';


export default function BooksManagementScreen() {

  const [searchText, setSearchText] =
    useState('');

  const [books, setBooks] =
    useState<AdminBook[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);


  useEffect(() => {
    loadBooks();
  }, []);


  async function loadBooks(
    text: string = searchText,
    refresh: boolean = false
  ) {

    try {

      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const result =
        await searchAdminBooks(text);

      setBooks(result);

    } catch (error: any) {

      console.log(
        'Admin books error:',
        error
      );

      Alert.alert(
        'Unable to Load Books',
        error?.message ??
          'Something went wrong.'
      );

    } finally {

      setLoading(false);
      setRefreshing(false);

    }

  }


  function openEditBook(
    book: AdminBook
  ) {

    router.push({
      pathname:
        '/(admin)/edit-book/[id]',
      params: {
        id: book.id,
      },
    });

  }
  function openBookDetails(book: AdminBook) {
  router.push({
    pathname: '/book/[id]',
    params: {
      id: book.id,
    },
  });
}


  function changeBookStatus(
    book: AdminBook
  ) {

    if (
      book.is_active &&
      !book.is_available
    ) {

      Alert.alert(
        'Book Currently Issued',
        'Receive this book before deactivating it.'
      );

      return;
    }


    const newStatus =
      !book.is_active;


    Alert.alert(
      newStatus
        ? 'Activate Book'
        : 'Deactivate Book',

      newStatus
        ? `Make "${book.title}" active again?`
        : `Deactivate physical copy #${book.serial_number}? It will disappear from the public catalog and search.`,

      [
        {
          text: 'Cancel',
          style: 'cancel',
        },

        {
          text: newStatus
            ? 'Activate'
            : 'Deactivate',

          style: newStatus
            ? 'default'
            : 'destructive',

          onPress: async () => {

            try {

              await setBookActiveStatus(
                book.id,
                newStatus
              );

              await loadBooks(
                searchText
              );

            } catch (error: any) {

              Alert.alert(
                'Update Failed',
                error?.message ??
                  'Unable to update the book.'
              );

            }

          },
        },
      ]
    );

  }


  function clearSearch() {

    setSearchText('');
    loadBooks('');

  }


  function renderBook({
    item,
  }: {
    item: AdminBook;
  }) {

    return (

      <Pressable
  onPress={() => openBookDetails(item)}
  style={({ pressed }) => [
    styles.bookCard,

    !item.is_active &&
      styles.inactiveCard,

    pressed &&
      styles.bookCardPressed,
  ]}
>


        {/* COVER */}

        <View style={styles.coverBox}>

          {item.cover_url ? (

            <Image
              source={{
                uri: item.cover_url,
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



        {/* BOOK DATA */}

        <View style={styles.bookContent}>

          <View style={styles.titleRow}>

            <Text
              style={styles.bookTitle}
              numberOfLines={2}
            >
              {item.title}
            </Text>


            {!item.is_active && (

              <View
                style={
                  styles.inactiveBadge
                }
              >

                <Text
                  style={
                    styles.inactiveText
                  }
                >
                  Inactive
                </Text>

              </View>

            )}

          </View>
          


          <Text
            style={styles.writer}
            numberOfLines={1}
          >
            <Text
              style={styles.infoLabel}
            >
              Writer -{' '}
            </Text>

            {item.author}
          </Text>


          {item.publisher && (

            <Text
              style={styles.publisher}
              numberOfLines={1}
            >

              <Text
                style={
                  styles.infoLabel
                }
              >
                Publisher -{' '}
              </Text>

              {item.publisher}

            </Text>

          )}


          <View style={styles.metaRow}>

            <View style={styles.serialBadge}>

              <Ionicons
                name="barcode-outline"
                size={13}
                color={
                  Colors.primaryDark
                }
              />

              <Text
                style={styles.serialText}
              >
                {item.serial_number}
              </Text>

            </View>


            {item.category && (

              <View
                style={
                  styles.categoryBadge
                }
              >

                <Text
                  style={
                    styles.categoryText
                  }
                  numberOfLines={1}
                >
                  {item.category}
                </Text>

              </View>

            )}

          </View>


          {item.location && (

            <View
              style={styles.locationRow}
            >

              <Ionicons
                name="location-outline"
                size={13}
                color={
                  Colors.textSecondary
                }
              />

              <Text
                style={
                  styles.locationText
                }
                numberOfLines={1}
              >
                {item.location}
              </Text>

            </View>

          )}


          <View style={styles.statusRow}>

            <View
              style={[
                styles.statusBadge,

                item.is_available
                  ? styles.availableBadge
                  : styles.issuedBadge,
              ]}
            >

              <Text
                style={[
                  styles.statusText,

                  item.is_available
                    ? styles.availableText
                    : styles.issuedText,
                ]}
              >
                {item.is_available
                  ? 'Available'
                  : 'Issued'}
              </Text>

            </View>

          </View>



          {/* ACTIONS */}

          <View style={styles.actions}>

            <Pressable
              onPress={(event) => {
             event.stopPropagation();
              openEditBook(item);
              }}
              style={({ pressed }) => [
                styles.editButton,

                pressed &&
                  styles.pressed,
              ]}
            >

              <Ionicons
                name="create-outline"
                size={16}
                color="#FFFFFF"
              />

              <Text
                style={
                  styles.editButtonText
                }
              >
                Edit
              </Text>

            </Pressable>


            <Pressable
              onPress={(event) => {
              event.stopPropagation();
              changeBookStatus(item);
              }}
              style={({ pressed }) => [
                styles.statusButton,

                item.is_active
                  ? styles.deactivateButton
                  : styles.activateButton,

                pressed &&
                  styles.pressed,
              ]}
            >

              <Ionicons
                name={
                  item.is_active
                    ? 'eye-off-outline'
                    : 'eye-outline'
                }
                size={15}
                color={
                  item.is_active
                    ? Colors.danger
                    : Colors.success
                }
              />

              <Text
                style={[
                  styles
                    .statusButtonText,

                  {
                    color:
                      item.is_active
                        ? Colors.danger
                        : Colors.success,
                  },
                ]}
              >

                {item.is_active
                  ? 'Deactivate'
                  : 'Activate'}

              </Text>

            </Pressable>

          </View>

        </View>

      </Pressable>

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
              Manage Books
            </Text>

            <Text
              style={
                styles.headerSubtitle
              }
            >
              Search, edit & manage copies
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
              size={20}
              color={Colors.primary}
            />

            <TextInput
              value={searchText}
              onChangeText={
                setSearchText
              }
              placeholder="Title, writer, publisher, serial..."
              placeholderTextColor={
                Colors.textSecondary
              }
              returnKeyType="search"
              onSubmitEditing={() =>
                loadBooks(searchText)
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
                  color={
                    Colors.textSecondary
                  }
                />

              </Pressable>

            )}

          </View>


          <Pressable
            onPress={() =>
              loadBooks(searchText)
            }
            style={({ pressed }) => [
              styles.searchButton,

              pressed &&
                styles.pressed,
            ]}
          >

            <Ionicons
              name="search"
              size={20}
              color="#FFFFFF"
            />

          </Pressable>

        </View>



        {/* ADD BOOK SHORTCUT */}

        <Pressable
          onPress={() =>
            router.push(
              '/(admin)/add-book'
            )
          }
          style={({ pressed }) => [
            styles.addBookButton,

            pressed &&
              styles.pressed,
          ]}
        >

          <Ionicons
            name="add-circle-outline"
            size={19}
            color={
              Colors.primaryDark
            }
          />

          <Text
            style={styles.addBookText}
          >
            Add New Book
          </Text>

        </Pressable>



        {/* RESULTS HEADER */}

        <View
          style={styles.resultsHeader}
        >

          <Text
            style={styles.resultsTitle}
          >
            Physical Copies
          </Text>

          <View
            style={
              styles.resultCountBadge
            }
          >

            <Text
              style={
                styles.resultCount
              }
            >
              {books.length}
            </Text>

          </View>

        </View>



        {/* LIST */}

        {loading ? (

          <View
            style={styles.loadingArea}
          >

            <ActivityIndicator
              size="large"
              color={Colors.primary}
            />

            <Text
              style={styles.loadingText}
            >
              Loading books...
            </Text>

          </View>

        ) : (

          <FlatList
            data={books}
            renderItem={renderBook}

            keyExtractor={(item) =>
              item.id
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
                  loadBooks(
                    searchText,
                    true
                  )
                }
              />
            }

            ListEmptyComponent={

              <View
                style={
                  styles.emptyState
                }
              >

                <Ionicons
                  name="book-outline"
                  size={46}
                  color={
                    Colors.secondary
                  }
                />

                <Text
                  style={
                    styles.emptyTitle
                  }
                >
                  No books found
                </Text>

                <Text
                  style={
                    styles.emptyText
                  }
                >
                  Try another search term.
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

    backgroundColor:
      Colors.background,
  },


  /* HEADER */

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

    fontSize: 22,
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


  /* SEARCH */

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

    backgroundColor:
      Colors.surface,

    borderWidth: 1,
    borderColor:
      Colors.border,

    borderRadius: 16,
  },


  searchInput: {
    flex: 1,

    color:
      Colors.textPrimary,

    fontSize: 12,
  },


  searchButton: {
    width: 49,
    height: 49,

    borderRadius: 16,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor:
      Colors.primary,
  },


  /* ADD */

  addBookButton: {
    height: 43,

    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',

    gap: 7,

    marginTop: 10,

    borderRadius: 14,

    backgroundColor:
      Colors.softAccent,

    borderWidth: 1,
    borderColor:
      Colors.secondary,
  },
  bookCardPressed: {
  opacity: 0.82,
  transform: [{ scale: 0.99 }],
},


  addBookText: {
    color:
      Colors.primaryDark,

    fontSize: 12,
    fontWeight: '800',
  },


  /* RESULTS */

  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',

    marginTop: 19,
    marginBottom: 10,
  },


  resultsTitle: {
    color:
      Colors.textPrimary,

    fontSize: 16,
    fontWeight: '800',
  },


  resultCountBadge: {
    minWidth: 26,
    height: 26,

    alignItems: 'center',
    justifyContent: 'center',

    paddingHorizontal: 7,

    borderRadius: 13,

    backgroundColor:
      Colors.softAccent,

    marginLeft: 8,
  },


  resultCount: {
    color:
      Colors.primaryDark,

    fontSize: 11,
    fontWeight: '800',
  },


  /* BOOK CARD */

  bookCard: {
    flexDirection: 'row',

    backgroundColor:
      Colors.surface,

    borderRadius: 19,

    borderWidth: 1,
    borderColor:
      Colors.border,

    padding: 10,

    marginBottom: 10,
  },


  inactiveCard: {
    opacity: 0.68,
  },


  coverBox: {
    width: 78,
    height: 112,

    borderRadius: 13,

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

    marginLeft: 11,
  },


  titleRow: {
    flexDirection: 'row',

    alignItems: 'flex-start',

    gap: 6,
  },


  bookTitle: {
    flex: 1,

    color:
      Colors.textPrimary,

    fontSize: 15,
    fontWeight: '800',

    lineHeight: 19,
  },


  inactiveBadge: {
    backgroundColor:
      '#F2F2F2',

    paddingHorizontal: 6,
    paddingVertical: 3,

    borderRadius: 7,
  },


  inactiveText: {
    color:
      Colors.textSecondary,

    fontSize: 8,
    fontWeight: '800',
  },


  writer: {
    color:
      Colors.textSecondary,

    fontSize: 11,

    marginTop: 5,
  },


  publisher: {
    color:
      Colors.textSecondary,

    fontSize: 10,

    marginTop: 2,
  },


  infoLabel: {
    color:
      Colors.textPrimary,

    fontWeight: '700',
  },


  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',

    alignItems: 'center',

    gap: 6,

    marginTop: 7,
  },


  serialBadge: {
    flexDirection: 'row',
    alignItems: 'center',

    gap: 4,

    paddingHorizontal: 6,
    paddingVertical: 3,

    borderRadius: 7,

    backgroundColor:
      Colors.roseMist,
  },


  serialText: {
    color:
      Colors.primaryDark,

    fontSize: 9,
    fontWeight: '800',
  },


  categoryBadge: {
    backgroundColor:
      Colors.softAccent,

    paddingHorizontal: 6,
    paddingVertical: 3,

    borderRadius: 7,
  },


  categoryText: {
    color:
      Colors.primaryDark,

    fontSize: 9,
    fontWeight: '700',
  },


  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',

    gap: 3,

    marginTop: 6,
  },


  locationText: {
    color:
      Colors.textSecondary,

    fontSize: 9,
  },


  statusRow: {
    flexDirection: 'row',

    marginTop: 7,
  },


  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,

    borderRadius: 7,
  },


  availableBadge: {
    backgroundColor:
      '#EAF6EF',
  },


  issuedBadge: {
    backgroundColor:
      '#FFF1F3',
  },


  statusText: {
    fontSize: 9,
    fontWeight: '800',
  },


  availableText: {
    color:
      Colors.success,
  },


  issuedText: {
    color:
      Colors.danger,
  },


  /* ACTION BUTTONS */

  actions: {
    flexDirection: 'row',

    gap: 7,

    marginTop: 9,
  },


  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',

    gap: 5,

    paddingHorizontal: 11,
    height: 32,

    borderRadius: 10,

    backgroundColor:
      Colors.primary,
  },


  editButtonText: {
    color: '#FFFFFF',

    fontSize: 10,
    fontWeight: '800',
  },


  statusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',

    gap: 5,

    paddingHorizontal: 9,
    height: 32,

    borderRadius: 10,

    borderWidth: 1,
  },


  deactivateButton: {
    backgroundColor:
      '#FFF5F6',

    borderColor:
      '#F4CDD4',
  },


  activateButton: {
    backgroundColor:
      '#F1F9F4',

    borderColor:
      '#CBE7D4',
  },


  statusButtonText: {
    fontSize: 9,
    fontWeight: '800',
  },


  pressed: {
    opacity: 0.75,
  },


  /* STATES */

  loadingArea: {
    flex: 1,

    alignItems: 'center',
    justifyContent: 'center',
  },


  loadingText: {
    color:
      Colors.textSecondary,

    fontSize: 11,

    marginTop: 8,
  },


  listContent: {
    paddingBottom: 30,
  },


  emptyState: {
    alignItems: 'center',

    paddingTop: 70,
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

    fontSize: 11,

    marginTop: 4,
  },
  

}
);