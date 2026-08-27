import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyProfile } from '../../services/account';




import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import { router } from 'expo-router';

import {
    LibraryBook,
    SearchMode,
    searchLibraryBooks,
} from '../../services/books';

import { supabase } from '../../lib/supabase';

import {
    AppTheme,
    Colors,
} from '../../constants/theme';


const SEARCH_OPTIONS: {
  label: string;
  value: SearchMode;
}[] = [
  { label: 'Title', value: 'title' },
  { label: 'Author', value: 'author' },
  { label: 'Publisher', value: 'publisher' },
  { label: 'Serial No.', value: 'serial' },
  { label: 'Category', value: 'category' },
];


export default function UserHomeScreen() {

  const [userName, setUserName] = useState('');

  useEffect(() => {

  async function loadUserName() {

    try {

      const profile = await getMyProfile();

      setUserName(
        profile?.full_name?.trim() ||
        'Reader'
      );

    } catch (error) {

      console.log(
        'Unable to load user name:',
        error
      );

      setUserName('Reader');

    }

  }

  loadUserName();

}, []);

  const [searchText, setSearchText] =
    useState('');

  const [searchMode, setSearchMode] =
    useState<SearchMode>('title');

  const [books, setBooks] =
    useState<LibraryBook[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [hasSearched, setHasSearched] =
    useState(false);


  async function searchBooks() {

    try {

      setLoading(true);
      setHasSearched(true);

      const results =
        await searchLibraryBooks(
          searchText,
          searchMode
        );

      setBooks(results);

    } catch (error: any) {

      console.log(error);

      Alert.alert(
        'Search Error',
        error?.message ??
          'Unable to search books.'
      );

    } finally {

      setLoading(false);

    }
  }


  function changeMode(mode: SearchMode) {
    setSearchMode(mode);
  }


  function openBook(book: LibraryBook) {

    router.push({
      pathname: '/book/[id]',
      params: {
        id: book.id,
      },
    });

  }


  async function logout() {

    await supabase.auth.signOut();

    router.replace('/(auth)/login');

  }


  function getPlaceholder() {

    switch (searchMode) {

      case 'author':
        return 'Search by author...';

      case 'publisher':
        return 'Search by publisher...';

      case 'serial':
        return 'Search serial number...';

      case 'category':
        return 'Search by category...';

      default:
        return 'Search by book title...';
    }

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
          pressed && styles.cardPressed,
        ]}
      >

        <View style={styles.coverBox}>

          {item.cover_url ? (

            <Image
              source={{
                uri: item.cover_url,
              }}
              style={styles.cover}
            />

          ) : (

            <View style={styles.coverPlaceholder}>

              <Text style={styles.coverPlaceholderText}>
                📖
              </Text>

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


          <View style={styles.bookMeta}>

            <Text style={styles.serial}>
              #{item.serial_number}
            </Text>

            {item.category && (

              <View style={styles.categoryBadge}>

                <Text
                  style={styles.categoryText}
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

      </Pressable>

    );

  }


return (

  <SafeAreaView style={styles.safeArea}>

    <View style={styles.container}>


      {/* =====================================
          FIXED UPPER PANEL
         ===================================== */}

      <View style={styles.fixedPanel}>


        {/* HEADER */}

        <View style={styles.header}>

          <View style={styles.brandRow}>

            <Image
              source={require(
                '../../assets/images/library-logo.png'
              )}
              style={styles.homeLogo}
              resizeMode="contain"
            />

            <View>

              <Text style={styles.heading}>
                Ashram Library
              </Text>

              <Text style={styles.subheading}>
                ज्ञान • भक्ति • अध्यात्म
              </Text>

            </View>

          </View>


          <Pressable
            onPress={logout}
            style={({ pressed }) => [
              styles.logoutButton,
              pressed && styles.logoutPressed,
            ]}
          >

            <Ionicons
              name="log-out-outline"
              size={23}
              color={Colors.primaryDark}
            />

          </Pressable>

        </View>



        {/* WELCOME CARD */}

        <View style={styles.welcomeCard}>

          


          <View style={styles.welcomeContent}>

            <Text style={styles.welcomeLabel}>
              Welcome,
            </Text>

            <Text style={styles.welcomeName}>
              {userName} 👋
            </Text>

            <Text style={styles.welcomeMessage}>
              Happy to see you again!
            </Text>

          </View>


          <View style={styles.templeArea}>
  <Image
    source={require(
      '../../assets/images/welcome-temple.png'
    )}
    style={styles.templeImage}
    resizeMode="contain"
  />
</View>

        </View>



        {/* SEARCH BOX */}

        <View style={styles.searchBox}>

          <Text style={styles.searchIcon}>
            ⌕
          </Text>

          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder={getPlaceholder()}
            placeholderTextColor={
              Colors.textSecondary
            }
            onSubmitEditing={searchBooks}
            returnKeyType="search"
            style={styles.searchInput}
          />

        </View>



        {/* FILTERS */}

        <View style={styles.filters}>

          {SEARCH_OPTIONS.map(
            (option) => {

              const active =
                searchMode === option.value;

              return (

                <Pressable
                  key={option.value}
                  onPress={() =>
                    changeMode(option.value)
                  }
                  style={[
                    styles.filter,

                    active &&
                      styles.activeFilter,
                  ]}
                >

                  <Text
                    style={[
                      styles.filterText,

                      active &&
                        styles.activeFilterText,
                    ]}
                  >
                    {option.label}
                  </Text>

                </Pressable>

              );

            }
          )}

        </View>



        {/* SEARCH BUTTON */}

        <Pressable
          onPress={searchBooks}
          style={({ pressed }) => [
            styles.searchButton,
            pressed && styles.buttonPressed,
          ]}
        >

          {loading ? (

            <ActivityIndicator
              color={Colors.surface}
            />

          ) : (

            <Text style={styles.searchButtonText}>
              Search
            </Text>

          )}

        </Pressable>

      </View>



      {/* =====================================
          SCROLLABLE LOWER AREA
         ===================================== */}

      <FlatList
        style={styles.resultsList}

        data={
          hasSearched && !loading
            ? books
            : []
        }

        renderItem={renderBook}

        keyExtractor={(item) =>
          item.id
        }

        showsVerticalScrollIndicator={false}

        keyboardShouldPersistTaps="handled"

        contentContainerStyle={
          styles.listContent
        }


        /* EVERYTHING HERE SCROLLS */

        ListHeaderComponent={

          <>

            {/* EXPLORE LIBRARY */}

            <Pressable
              onPress={() =>
                router.push('/catalog')
              }
              style={({ pressed }) => [
                styles.catalogCard,
                pressed &&
                  styles.cardPressed,
              ]}
            >

              <View style={styles.catalogIcon}>

                <Text
                  style={styles.catalogIconText}
                >
                  📚
                </Text>

              </View>


              <View style={styles.catalogContent}>

                <Text style={styles.catalogTitle}>
                  Explore Library
                </Text>

                <Text
                  style={styles.catalogSubtitle}
                >
                  Browse the complete book catalog
                </Text>

              </View>


              <Text style={styles.catalogArrow}>
                ›
              </Text>

            </Pressable>



            {/* SEARCH RESULTS HEADER */}

            {hasSearched && (

              <View style={styles.resultsHeader}>

                <Text style={styles.resultsTitle}>
                  Search Results
                </Text>

                {!loading && (

                  <Text style={styles.resultCount}>
                    {books.length}
                  </Text>

                )}

              </View>

            )}

          </>

        }


        ListEmptyComponent={

          hasSearched && !loading ? (

            <View style={styles.emptyState}>

              <Text style={styles.emptyIcon}>
                📖
              </Text>

              <Text style={styles.emptyTitle}>
                No books found
              </Text>

              <Text style={styles.emptyText}>
                Try another search.
              </Text>

            </View>

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
    backgroundColor: Colors.background,
  },

  fixedPanel: {
  backgroundColor: Colors.background,

  paddingBottom: 8,

  zIndex: 10,
},

resultsList: {
  flex: 1,
},

  welcomeCard: {
  minHeight: 68,

  flexDirection: 'row',
  alignItems: 'center',

  paddingHorizontal: 12,
  paddingVertical: 7,

  backgroundColor: Colors.roseMist,

  borderRadius: 16,

  borderWidth: 1,
  borderColor: Colors.border,

  marginBottom: 12,
},

welcomeAvatar: {
  width: 43,
  height: 43,

  borderRadius: 22,

  alignItems: 'center',
  justifyContent: 'center',

  backgroundColor: Colors.surface,
},

welcomeLogo: {
  width: 39,
  height: 39,
},

welcomeContent: {
  flex: 1,
  marginLeft: 4,
  zIndex: 2,
},

welcomeLabel: {
  color: Colors.textSecondary,
  fontSize: 8,
  fontWeight: '600',
},

welcomeName: {
  color: Colors.primaryDark,

  fontSize: 15,
  fontWeight: '800',

  marginTop: -1,
},

welcomeMessage: {
  color: Colors.textSecondary,

  fontSize: 8,
  marginTop: 1,
},
templeArea: {
  width: 150,
  height: 60,

  alignItems: 'flex-end',
  justifyContent: 'flex-end',

  overflow: 'hidden',
},

templeImage: {
  width: 150,
  height: 60,

  opacity: 0.28,
},
welcomeBooks: {
  width: 48,
  height: 48,

  borderRadius: 14,

  alignItems: 'center',
  justifyContent: 'center',

  backgroundColor: Colors.softAccent,
},

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },


  brandRow: {
  flexDirection: 'row',
  alignItems: 'center',
  flex: 1,
},

homeLogo: {
  width: 58,
  height: 58,
  marginRight: 10,
  resizeMode: 'contain',
},


logoutButton: {
  width: 42,
  height: 42,

  borderRadius: 21,

  alignItems: 'center',
  justifyContent: 'center',

  backgroundColor: Colors.surface,

  borderWidth: 1,
  borderColor: Colors.border,

  marginLeft: 10,
},

logoutPressed: {
  opacity: 0.7,
},


  container: {
  flex: 1,
  paddingHorizontal: 16,
  backgroundColor: Colors.background,
},


  header: {
    paddingTop: 18,
    paddingBottom: 24,

    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },


  heading: {
    color: Colors.primaryDark,
    fontSize: 31,
    fontWeight: '800',
  },


  subheading: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginTop: 3,
  },
  
  headerDivider: {
  height: 0.5,
  backgroundColor: Colors.border,
  opacity: 0.5,
  marginTop: 10,
  marginBottom: 14,
},



  searchBox: {
    height: 50,

    flexDirection: 'row',
    alignItems: 'center',

    paddingHorizontal: 16,

    backgroundColor: Colors.surface,

    borderWidth: 1,
    borderColor: Colors.border,

    borderRadius: 16,

    elevation: 2,

    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },


  searchIcon: {
    color: Colors.primary,
    fontSize: 25,
    marginRight: 10,
  },


  searchInput: {
    flex: 1,

    color: Colors.textPrimary,

    fontSize: 15,
  },


filters: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 7,
  marginTop: 11,
},


  filter: {
    paddingVertical: 7,
    paddingHorizontal: 11,

    borderRadius: AppTheme.radius.pill,

    backgroundColor: Colors.surface,

    borderWidth: 1,
    borderColor: Colors.border,
  },


  activeFilter: {
    backgroundColor: Colors.softAccent,
    borderColor: Colors.secondary,
  },


  filterText: {
    color: Colors.textSecondary,

    fontSize: 12,
    fontWeight: '600',
  },


  activeFilterText: {
    color: Colors.primaryDark,

    fontWeight: '800',
  },


  searchButton: {
    height: 46,

    marginTop: 12,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: Colors.primary,

    borderRadius: 15,
  },


  searchButtonText: {
    color: Colors.surface,

    fontSize: 15,
    fontWeight: '800',
  },


  buttonPressed: {
    opacity: 0.88,

    transform: [
      {
        scale: 0.99,
      },
    ],
  },


  catalogCard: {
  flexDirection: 'row',
  alignItems: 'center',

  marginTop: 16,
  padding: 13,

  backgroundColor: Colors.surface,
  borderRadius: 19,

  borderWidth: 1,
  borderColor: Colors.border,

  elevation: 2,

  shadowColor: '#000',
  shadowOpacity: 0.04,
  shadowRadius: 10,
},


  catalogIcon: {
  width: 44,
  height: 44,

  borderRadius: 14,

  alignItems: 'center',
  justifyContent: 'center',

  backgroundColor: Colors.roseMist,
},


  catalogIconText: {
    fontSize: 23,
  },


  catalogContent: {
    flex: 1,
    marginLeft: 14,
  },


  catalogTitle: {
    color: Colors.textPrimary,

    fontSize: 16,
    fontWeight: '800',
  },


  catalogSubtitle: {
    color: Colors.textSecondary,

    fontSize: 12,
    marginTop: 3,
  },


  catalogArrow: {
    color: Colors.primary,

    fontSize: 30,
    fontWeight: '400',
  },


  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',

    marginTop: 24,
    marginBottom: 12,
  },


  resultsTitle: {
    color: Colors.textPrimary,

    fontSize: 19,
    fontWeight: '800',
  },


  resultCount: {
    minWidth: 27,
    height: 27,

    paddingHorizontal: 7,

    textAlign: 'center',
    textAlignVertical: 'center',

    borderRadius: 14,

    backgroundColor: Colors.softAccent,

    color: Colors.primaryDark,

    fontWeight: '800',
  },


  listContent: {
  paddingBottom: 110,
},

  infoLabel: {
  color: Colors.textPrimary,
  fontWeight: '700',
},


  bookCard: {
    flexDirection: 'row',

    padding: 12,

    marginBottom: 12,

    backgroundColor: Colors.surface,

    borderRadius: 20,

    borderWidth: 1,
    borderColor: Colors.border,
  },


  cardPressed: {
    opacity: 0.84,
  },


  coverBox: {
    width: 78,
    height: 108,

    overflow: 'hidden',

    borderRadius: 13,

    backgroundColor: Colors.roseMist,
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


  coverPlaceholderText: {
    fontSize: 29,
  },


  bookContent: {
    flex: 1,

    marginLeft: 14,
  },


  bookTitle: {
    color: Colors.textPrimary,

    fontSize: 16,
    fontWeight: '800',

    lineHeight: 21,
  },


  author: {
    color: Colors.primaryDark,

    fontSize: 13,

    marginTop: 4,
  },


  publisher: {
    color: Colors.textSecondary,

    fontSize: 12,

    marginTop: 3,
  },


  bookMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',

    alignItems: 'center',

    gap: 7,

    marginTop: 8,
  },


  serial: {
    color: Colors.textSecondary,

    fontSize: 11,

    fontWeight: '700',
  },


  categoryBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,

    borderRadius: 8,

    backgroundColor: Colors.softAccent,
  },


  categoryText: {
    color: Colors.primaryDark,

    fontSize: 10,

    fontWeight: '700',
  },


  statusBadge: {
    alignSelf: 'flex-start',

    marginTop: 8,

    borderRadius: 8,

    paddingHorizontal: 8,
    paddingVertical: 4,
  },


  availableBadge: {
    backgroundColor: '#EAF6EF',
  },


  issuedBadge: {
    backgroundColor: '#FFF1F3',
  },


  statusText: {
    fontSize: 10,

    fontWeight: '800',
  },


  availableText: {
    color: Colors.success,
  },


  issuedText: {
    color: Colors.danger,
  },


  emptyState: {
    alignItems: 'center',

    paddingVertical: 45,
  },


  emptyIcon: {
    fontSize: 40,
  },


  emptyTitle: {
    color: Colors.textPrimary,

    fontSize: 17,
    fontWeight: '800',

    marginTop: 10,
  },
  
  emptyText: {
    color: Colors.textSecondary,

    marginTop: 4,
  },

});

