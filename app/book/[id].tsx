import {
    useEffect,
    useState,
} from 'react';

import {
    ActivityIndicator,
    Image,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import {
    router,
    useLocalSearchParams,
} from 'expo-router';

import {
    Ionicons,
} from '@expo/vector-icons';

import {
    getLibraryBookById,
    LibraryBook,
} from '../../services/books';

import {
    AppTheme,
    Colors,
} from '../../constants/theme';


export default function BookDetailsScreen() {

  const { id } =
    useLocalSearchParams<{
      id: string;
    }>();

  const [book, setBook] =
    useState<LibraryBook | null>(null);

  const [loading, setLoading] =
    useState(true);


  useEffect(() => {

    loadBook();

  }, [id]);


  async function loadBook() {

    if (!id) {
      setLoading(false);
      return;
    }

    try {

      setLoading(true);

      const result =
        await getLibraryBookById(id);

      setBook(result);

    } catch (error) {

      console.log(
        'Book details error:',
        error
      );

    } finally {

      setLoading(false);

    }

  }


  if (loading) {

    return (

      <SafeAreaView style={styles.loadingScreen}>

        <Image
          source={require(
            '../../assets/images/library-logo.png'
          )}
          style={styles.loadingLogo}
          resizeMode="contain"
        />

        <ActivityIndicator
          size="large"
          color={Colors.primary}
        />

        <Text style={styles.loadingText}>
          Loading book...
        </Text>

      </SafeAreaView>

    );

  }


  if (!book) {

    return (

      <SafeAreaView style={styles.emptyScreen}>

        <Ionicons
          name="book-outline"
          size={54}
          color={Colors.secondary}
        />

        <Text style={styles.notFoundTitle}>
          Book not found
        </Text>

        <Text style={styles.notFoundText}>
          This book may no longer be available
          in the catalog.
        </Text>

        <Pressable
          onPress={() => router.back()}
          style={styles.returnButton}
        >

          <Text style={styles.returnButtonText}>
            Go Back
          </Text>

        </Pressable>

      </SafeAreaView>

    );

  }


  return (

    <SafeAreaView style={styles.safeArea}>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >


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


          <Text style={styles.headerTitle}>
            Book Details
          </Text>


          <Image
            source={require(
              '../../assets/images/library-logo.png'
            )}
            style={styles.headerLogo}
            resizeMode="contain"
          />

        </View>


        {/* COVER */}

        <View style={styles.coverSection}>

          <View style={styles.coverFrame}>

            {book.cover_url ? (

              <Image
                source={{
                  uri: book.cover_url,
                }}
                style={styles.cover}
                resizeMode="cover"
              />

            ) : (

              <View style={styles.coverPlaceholder}>

                <Ionicons
                  name="book-outline"
                  size={54}
                  color={Colors.secondary}
                />

                <Text style={styles.noCoverText}>
                  No cover
                </Text>

              </View>

            )}

          </View>

        </View>


        {/* MAIN DETAILS */}

        <View style={styles.titleSection}>

          {book.category && (

            <View style={styles.categoryBadge}>

              <Text style={styles.categoryText}>
                {book.category}
              </Text>

            </View>

          )}


          <Text style={styles.title}>
            {book.title}
          </Text>


          <View style={styles.writerPublisherSection}>

  <View style={styles.infoLine}>
    <Ionicons
      name="person-outline"
      size={15}
      color={Colors.primary}
    />

    <Text style={styles.bookInfoText}>
      <Text style={styles.bookInfoLabel}>
        Writer -{' '}
      </Text>
      {book.author}
    </Text>
  </View>

  {book.publisher && (
    <View style={styles.infoLine}>
      <Ionicons
        name="business-outline"
        size={15}
        color={Colors.primary}
      />

      <Text style={styles.bookInfoText}>
        <Text style={styles.bookInfoLabel}>
          Publisher -{' '}
        </Text>
        {book.publisher}
      </Text>
    </View>
  )}

</View>


          <View
            style={[
              styles.statusBadge,

              book.is_available
                ? styles.availableBadge
                : styles.issuedBadge,
            ]}
          >

            <View
              style={[
                styles.statusDot,

                book.is_available
                  ? styles.availableDot
                  : styles.issuedDot,
              ]}
            />

            <Text
              style={[
                styles.statusText,

                book.is_available
                  ? styles.availableText
                  : styles.issuedText,
              ]}
            >

              {book.is_available
                ? 'Available'
                : 'Currently Issued'}

            </Text>

          </View>

        </View>


        {/* INFORMATION */}

        <Text style={styles.sectionTitle}>
          Book Information
        </Text>


        <View style={styles.detailsCard}>

          <DetailRow
            icon="barcode-outline"
            label="Serial Number"
            value={book.serial_number}
          />

          <DetailRow
            icon="business-outline"
            label="Publisher"
            value={book.publisher}
          />

          <DetailRow
            icon="grid-outline"
            label="Category"
            value={book.category}
          />

          <DetailRow
            icon="location-outline"
            label="Location"
            value={book.location}
          />

          <DetailRow
            icon="pricetag-outline"
            label="Cost"
            value={
              book.cost !== null
                ? `₹${book.cost}`
                : null
            }
            last
          />

        </View>


        {/* AVAILABILITY INFO */}

        <View style={styles.availabilityCard}>

          <View style={styles.availabilityIcon}>

            <Ionicons
              name={
                book.is_available
                  ? 'checkmark-circle-outline'
                  : 'time-outline'
              }
              size={25}
              color={
                book.is_available
                  ? Colors.success
                  : Colors.danger
              }
            />

          </View>


          <View style={styles.availabilityContent}>

            <Text style={styles.availabilityTitle}>

              {book.is_available
                ? 'Ready to borrow'
                : 'Book currently issued'}

            </Text>

            <Text style={styles.availabilityDescription}>

              {book.is_available
                ? 'This book is currently available in the library.'
                : 'This book has been issued and is currently unavailable.'}

            </Text>

          </View>

        </View>


      </ScrollView>

    </SafeAreaView>

  );

}


function DetailRow({
  icon,
  label,
  value,
  last = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | null;
  last?: boolean;
}) {

  return (

    <View
      style={[
        styles.detailRow,
        last && styles.lastDetailRow,
      ]}
    >

      <View style={styles.detailLeft}>

        <View style={styles.detailIcon}>

          <Ionicons
            name={icon}
            size={18}
            color={Colors.primaryDark}
          />

        </View>


        <Text style={styles.detailLabel}>
          {label}
        </Text>

      </View>


      <Text
        style={styles.detailValue}
        numberOfLines={3}
      >
        {value || 'Not available'}
      </Text>

    </View>

  );

}


const styles = StyleSheet.create({

  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },


  content: {
    paddingHorizontal: 16,
    paddingBottom: 38,
  },


  header: {
    height: 58,

    flexDirection: 'row',
    alignItems: 'center',

    justifyContent: 'space-between',
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


  headerTitle: {
    color: Colors.primaryDark,

    fontSize: 17,
    fontWeight: '800',
  },


  headerLogo: {
    width: 42,
    height: 42,
  },


  coverSection: {
    alignItems: 'center',

    paddingTop: 12,
    paddingBottom: 22,
  },
  writerPublisherSection: {
  alignItems: 'center',
  marginTop: 10,
  gap: 5,
},

infoLine: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
},

bookInfoText: {
  color: Colors.textSecondary,
  fontSize: 13,
},

bookInfoLabel: {
  color: Colors.textPrimary,
  fontWeight: '700',
},



  coverFrame: {
    width: 170,
    height: 238,

    borderRadius: 20,

    overflow: 'hidden',

    backgroundColor: Colors.surface,

    borderWidth: 1,
    borderColor: Colors.border,

    elevation: 5,

    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 15,

    shadowOffset: {
      width: 0,
      height: 6,
    },
  },


  cover: {
    width: '100%',
    height: '100%',
  },


  coverPlaceholder: {
    flex: 1,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: Colors.roseMist,
  },


  noCoverText: {
    color: Colors.textSecondary,

    fontSize: 11,

    marginTop: 8,
  },


  titleSection: {
    alignItems: 'center',

    paddingHorizontal: 8,
  },


  categoryBadge: {
    paddingHorizontal: 11,
    paddingVertical: 5,

    borderRadius: AppTheme.radius.pill,

    backgroundColor: Colors.softAccent,

    marginBottom: 11,
  },


  categoryText: {
    color: Colors.primaryDark,

    fontSize: 11,
    fontWeight: '800',
  },


  title: {
    color: Colors.textPrimary,

    fontSize: 24,
    fontWeight: '800',

    lineHeight: 30,

    textAlign: 'center',
  },


  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',

    gap: 6,

    marginTop: 9,
  },


  author: {
    color: Colors.textSecondary,

    fontSize: 14,

    textAlign: 'center',
  },


  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',

    paddingHorizontal: 12,
    paddingVertical: 7,

    borderRadius: AppTheme.radius.pill,

    marginTop: 15,
  },


  availableBadge: {
    backgroundColor: '#EAF6EF',
  },


  issuedBadge: {
    backgroundColor: '#FFF1F3',
  },


  statusDot: {
    width: 7,
    height: 7,

    borderRadius: 4,

    marginRight: 7,
  },


  availableDot: {
    backgroundColor: Colors.success,
  },


  issuedDot: {
    backgroundColor: Colors.danger,
  },


  statusText: {
    fontSize: 11,
    fontWeight: '800',
  },


  availableText: {
    color: Colors.success,
  },


  issuedText: {
    color: Colors.danger,
  },


  sectionTitle: {
    color: Colors.textPrimary,

    fontSize: 17,
    fontWeight: '800',

    marginTop: 28,
    marginBottom: 11,
  },


  detailsCard: {
    backgroundColor: Colors.surface,

    borderRadius: 20,

    paddingHorizontal: 14,

    borderWidth: 1,
    borderColor: Colors.border,
  },


  detailRow: {
    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'space-between',

    paddingVertical: 14,

    borderBottomWidth: 1,
    borderBottomColor: Colors.border,

    gap: 12,
  },


  lastDetailRow: {
    borderBottomWidth: 0,
  },


  detailLeft: {
    flexDirection: 'row',
    alignItems: 'center',

    flex: 1,
  },


  detailIcon: {
    width: 34,
    height: 34,

    borderRadius: 11,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: Colors.roseMist,

    marginRight: 10,
  },


  detailLabel: {
    color: Colors.textSecondary,

    fontSize: 12,
    fontWeight: '600',
  },


  detailValue: {
    color: Colors.textPrimary,

    fontSize: 12,
    fontWeight: '800',

    textAlign: 'right',

    flex: 1,
  },


  availabilityCard: {
    flexDirection: 'row',

    alignItems: 'center',

    marginTop: 18,

    padding: 14,

    borderRadius: 18,

    backgroundColor: Colors.surface,

    borderWidth: 1,
    borderColor: Colors.border,
  },


  availabilityIcon: {
    width: 44,
    height: 44,

    borderRadius: 14,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: Colors.roseMist,
  },


  availabilityContent: {
    flex: 1,

    marginLeft: 12,
  },


  availabilityTitle: {
    color: Colors.textPrimary,

    fontSize: 13,
    fontWeight: '800',
  },


  availabilityDescription: {
    color: Colors.textSecondary,

    fontSize: 11,

    lineHeight: 16,

    marginTop: 3,
  },


  loadingScreen: {
    flex: 1,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: Colors.background,
  },


  loadingLogo: {
    width: 85,
    height: 70,

    marginBottom: 18,
  },


  loadingText: {
    color: Colors.textSecondary,

    fontSize: 12,

    marginTop: 10,
  },


  emptyScreen: {
    flex: 1,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: Colors.background,

    paddingHorizontal: 30,
  },


  notFoundTitle: {
    color: Colors.textPrimary,

    fontSize: 20,
    fontWeight: '800',

    marginTop: 14,
  },


  notFoundText: {
    color: Colors.textSecondary,

    textAlign: 'center',

    fontSize: 12,

    lineHeight: 18,

    marginTop: 6,
  },


  returnButton: {
    backgroundColor: Colors.primary,

    paddingHorizontal: 24,
    paddingVertical: 12,

    borderRadius: 14,

    marginTop: 22,
  },


  returnButtonText: {
    color: Colors.surface,

    fontWeight: '800',
  },

});