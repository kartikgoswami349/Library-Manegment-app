import {
    useEffect,
    useState,
} from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
    EmptyState,
    ErrorState
} from '../components/ScreenState';

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
    router,
} from 'expo-router';

import {
    Ionicons,
} from '@expo/vector-icons';

import {
    getCatalogBooks,
    LibraryBook,
} from '../services/books';

import {
    Colors
} from '../constants/theme';


const PAGE_SIZE = 30;


export default function CatalogScreen() {

  const [loading, setLoading] = useState(true);
const [error, setError] = useState('');
async function loadCatalog() {

  try {

    setLoading(true);
    setError('');

    const result = await getCatalogBooks();

setBooks(result.books);
setTotal(result.total);

  } catch (error) {

    console.log(
      'Catalog load error:',
      error
    );

    setError(
      'Unable to load the library catalog.'
    );

  } finally {

    setLoading(false);

  }

  {!loading && error ? (

  <ErrorState
    title="Unable to load books"
    message={error}
    onRetry={loadCatalog}
  />

) : null}

{!loading &&
 !error &&
 books.length === 0 ? (

  <EmptyState
    icon="book-outline"
    title="No books found"
    message="There are no books available in the catalog yet."
  />

) : null}

{!loading &&
 !error &&
 books.length > 0 && (

  <>
    {/* your existing book list */}
  </>

)}

}

  const [books, setBooks] =
    useState<LibraryBook[]>([]);

  const [total, setTotal] =
    useState(0);

  
  const [loadingMore, setLoadingMore] =
    useState(false);

  const [refreshing, setRefreshing] =
    useState(false);


  useEffect(() => {
    loadInitialBooks();
  }, []);


  async function loadInitialBooks(
    isRefresh = false
  ) {

    try {

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const result =
        await getCatalogBooks(
          0,
          PAGE_SIZE
        );

      setBooks(result.books);
      setTotal(result.total);

    } catch (error) {

      console.log(
        'Catalog load error:',
        error
      );

    } finally {

      setLoading(false);
      setRefreshing(false);

    }

  }


  async function loadMoreBooks() {

    if (
      loading ||
      loadingMore ||
      books.length >= total
    ) {
      return;
    }

    try {

      setLoadingMore(true);

      const result =
        await getCatalogBooks(
          books.length,
          PAGE_SIZE
        );

      setTotal(result.total);

      setBooks((current) => {

        const existingIds =
          new Set(
            current.map(
              (book) => book.id
            )
          );

        const newBooks =
          result.books.filter(
            (book) =>
              !existingIds.has(book.id)
          );

        return [
          ...current,
          ...newBooks,
        ];

      });

    } catch (error) {

      console.log(
        'Load more error:',
        error
      );

    } finally {

      setLoadingMore(false);

    }

  }


  function openBook(
    book: LibraryBook
  ) {

    router.push({
      pathname: '/book/[id]',
      params: {
        id: book.id,
      },
    });

  }


  function renderBook({
    item,
  }: {
    item: LibraryBook;
  }) {

    return (

      <Pressable
        onPress={() => openBook(item)}
        style={({ pressed }) => [
          styles.bookCard,
          pressed &&
            styles.cardPressed,
        ]}
      >

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
                size={28}
                color={Colors.primary}
              />

            </View>

          )}

        </View>


        <View style={styles.bookContent}>

          <Text
            style={styles.bookTitle}
            numberOfLines={2}
          >
            {item.title}
          </Text>


          <Text
          style={styles.author}
          numberOfLines={1}
          >
          <Text style={styles.infoLabel}>Writer - </Text>
          {item.author}
         </Text>

         {item.publisher && (
          <Text
          style={styles.publisher}
          numberOfLines={1}
         >
          <Text style={styles.infoLabel}>Publisher - </Text>
         {item.publisher}
         </Text>
        )}


          <View style={styles.metaRow}>

            <Text style={styles.serial}>
              #{item.serial_number}
            </Text>


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


        <Ionicons
          name="chevron-forward"
          size={18}
          color={Colors.secondary}
          style={styles.chevron}
        />

      </Pressable>

    );

  }


  if (loading) {

    return (

      <SafeAreaView
        style={styles.loadingScreen}
      >

        <View style={styles.headerActions}>

  <Pressable
    onPress={() => loadInitialBooks(true)}
    style={styles.headerActionButton}
  >
    <Ionicons
      name="refresh-outline"
      size={21}
      color={Colors.primaryDark}
    />
  </Pressable>

  <Image
    source={require('../assets/images/library-logo.png')}
    style={styles.logo}
    resizeMode="contain"
  />

</View>

        <ActivityIndicator
          size="large"
          color={Colors.primary}
        />

        <Text style={styles.loadingText}>
          Loading catalog...
        </Text>

      </SafeAreaView>

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
              size={24}
              color={Colors.primaryDark}
            />

          </Pressable>


          <View style={styles.headerText}>

            <Text style={styles.title}>
              Catalog
            </Text>

            <Text style={styles.subtitle}>
              {total}{' '}
              {total === 1
                ? 'book'
                : 'books'} in library
            </Text>

          </View>


          <Image
            source={require(
              '../assets/images/library-logo.png'
            )}
            style={styles.logo}
            resizeMode="contain"
          />

        </View>



        {/* INFO CARD */}

        <View style={styles.infoCard}>

          <View style={styles.infoIcon}>

            <Ionicons
              name="library-outline"
              size={23}
              color={Colors.primaryDark}
            />

          </View>


          <View style={styles.infoContent}>

            <Text style={styles.infoTitle}>
              Complete Collection
            </Text>

            <Text style={styles.infoText}>
              Browse all books available
              in the library
            </Text>

          </View>

        </View>



        {/* BOOK LIST */}

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

          onEndReached={
            loadMoreBooks
          }

          onEndReachedThreshold={0.4}

          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() =>
                loadInitialBooks(true)
              }
            />
          }

          ListEmptyComponent={

            <View
              style={styles.emptyState}
            >

              <Ionicons
                name="library-outline"
                size={46}
                color={Colors.secondary}
              />

              <Text
                style={styles.emptyTitle}
              >
                No books found
              </Text>

              <Text
                style={styles.emptyText}
              >
                Books added to the library
                will appear here.
              </Text>

            </View>

          }

          ListFooterComponent={

            loadingMore ? (

              <View style={styles.footerLoader}>

  <ActivityIndicator
    color={Colors.primary}
  />

  <Text style={styles.footerText}>
    Loading more books...
  </Text>

  <Text style={styles.loadedCount}>
    {books.length} of {total}
  </Text>

</View>



            ) : books.length > 0 &&
              books.length >= total ? (

              <Text style={styles.endMessage}>
  All {total} books loaded
</Text>

            ) : null

          }
        />

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
  infoLabel: {
  color: Colors.textPrimary,
  fontWeight: '700',
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
    paddingBottom: 14,
  },
  headerActions: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
},

headerActionButton: {
  width: 38,
  height: 38,

  borderRadius: 19,

  alignItems: 'center',
  justifyContent: 'center',

  backgroundColor: Colors.surface,

  borderWidth: 1,
  borderColor: Colors.border,
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

    marginLeft: 12,
  },


  title: {
    color:
      Colors.primaryDark,

    fontSize: 26,

    fontWeight: '800',
  },


  subtitle: {
    color:
      Colors.textSecondary,

    fontSize: 12,

    marginTop: 2,
  },


  logo: {
    width: 48,
    height: 48,

    marginLeft: 8,
  },
  loadedCount: {
  color: Colors.textSecondary,
  fontSize: 10,
  marginTop: 4,
},


  infoCard: {
    flexDirection: 'row',

    alignItems: 'center',

    backgroundColor:
      Colors.surface,

    padding: 13,

    borderRadius: 18,

    borderWidth: 1,

    borderColor:
      Colors.border,

    marginBottom: 15,
  },


  infoIcon: {
    width: 44,
    height: 44,

    borderRadius: 14,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor:
      Colors.roseMist,
  },


  infoContent: {
    flex: 1,

    marginLeft: 12,
  },


  infoTitle: {
    color:
      Colors.textPrimary,

    fontSize: 15,

    fontWeight: '800',
  },


  infoText: {
    color:
      Colors.textSecondary,

    fontSize: 11,

    marginTop: 3,
  },


  listContent: {
    paddingBottom: 28,
  },


  bookCard: {
    flexDirection: 'row',

    alignItems: 'center',

    backgroundColor:
      Colors.surface,

    padding: 10,

    marginBottom: 10,

    borderRadius: 18,

    borderWidth: 1,

    borderColor:
      Colors.border,
  },


  cardPressed: {
    opacity: 0.82,
  },


  coverBox: {
    width: 70,
    height: 98,

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

    marginLeft: 12,
  },


  bookTitle: {
    color:
      Colors.textPrimary,

    fontSize: 15,

    fontWeight: '800',

    lineHeight: 19,
  },


  author: {
    color:
      Colors.primaryDark,

    fontSize: 12,

    marginTop: 4,
  },


  publisher: {
    color:
      Colors.textSecondary,

    fontSize: 11,

    marginTop: 2,
  },


  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',

    alignItems: 'center',

    gap: 6,

    marginTop: 6,
  },


  serial: {
    color:
      Colors.textSecondary,

    fontSize: 10,

    fontWeight: '700',
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


  statusBadge: {
    alignSelf: 'flex-start',

    marginTop: 6,

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


  chevron: {
    marginLeft: 6,
  },


  emptyState: {
    alignItems: 'center',

    paddingTop: 80,
  },


  emptyTitle: {
    color:
      Colors.textPrimary,

    fontSize: 18,

    fontWeight: '800',

    marginTop: 12,
  },


  emptyText: {
    color:
      Colors.textSecondary,

    fontSize: 12,

    textAlign: 'center',

    marginTop: 5,
  },


  footerLoader: {
    alignItems: 'center',

    paddingVertical: 20,
  },


  footerText: {
    color:
      Colors.textSecondary,

    fontSize: 11,

    marginTop: 7,
  },


  endMessage: {
    color:
      Colors.textSecondary,

    fontSize: 10,

    textAlign: 'center',

    paddingVertical: 18,
  },


  loadingScreen: {
    flex: 1,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor:
      Colors.background,
  },


  loadingLogo: {
    width: 90,
    height: 75,

    marginBottom: 20,
  },


  loadingText: {
    color:
      Colors.textSecondary,

    marginTop: 10,

    fontSize: 12,
  },

});
