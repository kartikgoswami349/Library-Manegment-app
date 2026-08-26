import {
    useEffect,
    useState,
} from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
    ActivityIndicator,
    Alert,
    Image,
    Platform,
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

import DateTimePicker, {
    DateTimePickerEvent,
} from '@react-native-community/datetimepicker';

import {
    AdminBook,
    searchAdminBooks,
} from '../../services/books';

import {
    AdminSubscriber,
    searchSubscribers,
} from '../../services/subscribers';

import {
    issueBook,
} from '../../services/borrowings';

import {
    Colors,
} from '../../constants/theme';



export default function IssueBookScreen() {

  const [bookSearch, setBookSearch] =
    useState('');

  const [subscriberSearch, setSubscriberSearch] =
    useState('');


  const [bookResults, setBookResults] =
    useState<AdminBook[]>([]);

  const [subscriberResults, setSubscriberResults] =
    useState<AdminSubscriber[]>([]);


  const [selectedBook, setSelectedBook] =
    useState<AdminBook | null>(null);

  const [
    selectedSubscriber,
    setSelectedSubscriber,
  ] = useState<AdminSubscriber | null>(null);


  const [dueDate, setDueDate] =
    useState<string | null>(null);

  const [showDatePicker, setShowDatePicker] =
    useState(false);

  const [notes, setNotes] =
    useState('');

  const [saving, setSaving] =
    useState(false);


  useEffect(() => {

    /*
     * Default due date:
     * 14 days from today.
     */

    const date = new Date();

    date.setDate(
      date.getDate() + 14
    );

    setDueDate(
      dateToString(date)
    );

  }, []);



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


  function dateFromString(
    value: string
  ) {

    return new Date(
      `${value}T00:00:00`
    );

  }


  function prettyDate(
    value: string | null
  ) {

    if (!value) {
      return 'No due date';
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



  async function searchBooks() {

    if (!bookSearch.trim()) {

      Alert.alert(
        'Search Book',
        'Enter a serial number, title, writer or publisher.'
      );

      return;
    }


    try {

      const result =
        await searchAdminBooks(
          bookSearch
        );


      /*
       * Issue screen should show only
       * active + available copies.
       */

      const available =
        result.filter(
          (book) =>
            book.is_active &&
            book.is_available
        );


      setBookResults(
        available
      );


    } catch (error: any) {

      Alert.alert(
        'Search Failed',
        error?.message ??
          'Unable to search books.'
      );

    }

  }



  async function searchUsers() {

    if (!subscriberSearch.trim()) {

      Alert.alert(
        'Search Subscriber',
        'Enter subscriber name or email.'
      );

      return;
    }


    try {

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

    }

  }



  function onDateChange(
    event: DateTimePickerEvent,
    date?: Date
  ) {

    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }


    if (
      event.type === 'set' &&
      date
    ) {

      setDueDate(
        dateToString(date)
      );

    }

  }



  async function confirmIssue() {

    if (!selectedBook) {

      Alert.alert(
        'Select Book',
        'Please select a book to issue.'
      );

      return;
    }


    if (!selectedSubscriber) {

      Alert.alert(
        'Select Subscriber',
        'Please select the subscriber receiving the book.'
      );

      return;
    }


    Alert.alert(
      'Confirm Issue',

      `Issue #${selectedBook.serial_number} "${selectedBook.title}" to ${selectedSubscriber.full_name || selectedSubscriber.email}?`,

      [
        {
          text: 'Cancel',
          style: 'cancel',
        },

        {
          text: 'Issue Book',

          onPress: async () => {

            try {

              setSaving(true);


              await issueBook(
                selectedBook.id,
                selectedSubscriber.id,
                dueDate,
                notes.trim() || null
              );


              Alert.alert(
                'Book Issued',
                `"${selectedBook.title}" has been issued successfully.`,
                [
                  {
                    text: 'Issue Another',

                    onPress: () => {
                      resetForm();
                    },
                  },

                  {
                    text: 'Done',

                    onPress: () =>
                      router.back(),
                  },
                ]
              );


            } catch (error: any) {

              Alert.alert(
                'Issue Failed',
                error?.message ??
                  'Unable to issue this book.'
              );


            } finally {

              setSaving(false);

            }

          },
        },
      ]
    );

  }



  function resetForm() {

    setBookSearch('');
    setSubscriberSearch('');

    setBookResults([]);
    setSubscriberResults([]);

    setSelectedBook(null);
    setSelectedSubscriber(null);

    setNotes('');


    const date =
      new Date();

    date.setDate(
      date.getDate() + 14
    );

    setDueDate(
      dateToString(date)
    );

  }



  return (

    <SafeAreaView
      style={styles.safeArea}
    >

      <ScrollView
        showsVerticalScrollIndicator={false}

        keyboardShouldPersistTaps="handled"

        contentContainerStyle={
          styles.content
        }
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
              Issue Book
            </Text>

            <Text
              style={
                styles.headerSubtitle
              }
            >
              Lend a physical copy
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



        {/* STEP 1 */}

        <Text style={styles.stepTitle}>
          1. Select Book
        </Text>


        {!selectedBook ? (

          <>

            <View style={styles.searchRow}>

              <View style={styles.searchBox}>

                <Ionicons
                  name="search-outline"
                  size={19}
                  color={Colors.primary}
                />

                <TextInput
                  value={bookSearch}
                  onChangeText={
                    setBookSearch
                  }

                  placeholder="Serial, title, writer..."

                  placeholderTextColor={
                    Colors.textSecondary
                  }

                  returnKeyType="search"

                  onSubmitEditing={
                    searchBooks
                  }

                  style={
                    styles.searchInput
                  }
                />

              </View>


              <Pressable
                onPress={searchBooks}
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


            {bookResults.map(
              (book) => (

                <Pressable
                  key={book.id}

                  onPress={() => {

                    setSelectedBook(
                      book
                    );

                    setBookResults([]);

                  }}

                  style={
                    styles.resultCard
                  }
                >

                  <View
                    style={
                      styles.bookIcon
                    }
                  >

                    <Ionicons
                      name="book-outline"
                      size={23}
                      color={
                        Colors.primary
                      }
                    />

                  </View>


                  <View
                    style={
                      styles.resultContent
                    }
                  >

                    <Text
                      style={
                        styles.resultTitle
                      }
                      numberOfLines={1}
                    >
                      {book.title}
                    </Text>

                    <Text
                      style={
                        styles.resultLine
                      }
                      numberOfLines={1}
                    >
                      Writer - {book.author}
                    </Text>

                    <Text
                      style={
                        styles.resultLine
                      }
                      numberOfLines={1}
                    >
                      Publisher - {book.publisher || 'Not set'}
                    </Text>

                    <Text
                      style={
                        styles.serial
                      }
                    >
                      #{book.serial_number}
                    </Text>

                  </View>


                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={
                      Colors.primary
                    }
                  />

                </Pressable>

              )
            )}

          </>

        ) : (

          <View style={styles.selectedCard}>

            <View
              style={styles.selectedIcon}
            >

              <Ionicons
                name="book-outline"
                size={25}
                color={
                  Colors.primaryDark
                }
              />

            </View>


            <View style={styles.selectedContent}>

              <Text style={styles.selectedTitle}>
                {selectedBook.title}
              </Text>

              <Text style={styles.selectedLine}>
                Writer - {selectedBook.author}
              </Text>

              <Text style={styles.selectedLine}>
                Publisher - {selectedBook.publisher || 'Not set'}
              </Text>

              <Text style={styles.selectedSerial}>
                #{selectedBook.serial_number}
              </Text>

            </View>


            <Pressable
              onPress={() =>
                setSelectedBook(null)
              }
            >

              <Ionicons
                name="close-circle"
                size={23}
                color={Colors.danger}
              />

            </Pressable>

          </View>

        )}



        {/* STEP 2 */}

        <Text style={styles.stepTitle}>
          2. Select Subscriber
        </Text>


        {!selectedSubscriber ? (

          <>

            <View style={styles.searchRow}>

              <View style={styles.searchBox}>

                <Ionicons
                  name="search-outline"
                  size={19}
                  color={Colors.primary}
                />

                <TextInput
                  value={
                    subscriberSearch
                  }

                  onChangeText={
                    setSubscriberSearch
                  }

                  placeholder="Name or email..."

                  placeholderTextColor={
                    Colors.textSecondary
                  }

                  returnKeyType="search"

                  onSubmitEditing={
                    searchUsers
                  }

                  style={
                    styles.searchInput
                  }
                />

              </View>


              <Pressable
                onPress={searchUsers}
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


            {subscriberResults.map(
              (subscriber) => (

                <Pressable
                  key={
                    subscriber.id
                  }

                  onPress={() => {

                    setSelectedSubscriber(
                      subscriber
                    );

                    setSubscriberResults(
                      []
                    );

                  }}

                  style={
                    styles.resultCard
                  }
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
                        subscriber
                          .full_name?.[0] ??
                        subscriber
                          .email?.[0] ??
                        '?'
                      ).toUpperCase()}
                    </Text>

                  </View>


                  <View
                    style={
                      styles.resultContent
                    }
                  >

                    <Text
                      style={
                        styles.resultTitle
                      }
                    >
                      {subscriber.full_name ||
                        'Subscriber'}
                    </Text>

                    <Text
                      style={
                        styles.resultLine
                      }
                    >
                      {subscriber.email}
                    </Text>

                  </View>


                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={
                      Colors.primary
                    }
                  />

                </Pressable>

              )
            )}

          </>

        ) : (

          <View style={styles.selectedCard}>

            <View style={styles.personIcon}>

              <Text
                style={
                  styles.personInitial
                }
              >
                {(
                  selectedSubscriber
                    .full_name?.[0] ??
                  selectedSubscriber
                    .email?.[0] ??
                  '?'
                ).toUpperCase()}
              </Text>

            </View>


            <View style={styles.selectedContent}>

              <Text style={styles.selectedTitle}>
                {selectedSubscriber.full_name ||
                  'Subscriber'}
              </Text>

              <Text style={styles.selectedLine}>
                {selectedSubscriber.email}
              </Text>

            </View>


            <Pressable
              onPress={() =>
                setSelectedSubscriber(
                  null
                )
              }
            >

              <Ionicons
                name="close-circle"
                size={23}
                color={Colors.danger}
              />

            </Pressable>

          </View>

        )}



        {/* STEP 3 */}

        <Text style={styles.stepTitle}>
          3. Due Date
        </Text>


        <Pressable
          onPress={() =>
            setShowDatePicker(true)
          }
          style={styles.dateBox}
        >

          <Ionicons
            name="calendar-outline"
            size={19}
            color={Colors.primary}
          />

          <Text style={styles.dateText}>
            {prettyDate(dueDate)}
          </Text>

          <Ionicons
            name="chevron-down"
            size={16}
            color={
              Colors.textSecondary
            }
          />

        </Pressable>


        {showDatePicker && (

          <DateTimePicker
            value={
              dueDate
                ? dateFromString(
                    dueDate
                  )
                : new Date()
            }

            mode="date"

            minimumDate={
              new Date()
            }

            onChange={
              onDateChange
            }
          />

        )}



        {/* NOTES */}

        <Text style={styles.stepTitle}>
          4. Notes
        </Text>


        <View style={styles.notesBox}>

          <TextInput
            value={notes}

            onChangeText={setNotes}

            placeholder="Optional notes..."

            placeholderTextColor={
              Colors.textSecondary
            }

            multiline

            style={styles.notesInput}
          />

        </View>



        {/* CONFIRM */}

        <Pressable
          onPress={confirmIssue}

          disabled={
            saving ||
            !selectedBook ||
            !selectedSubscriber
          }

          style={[
            styles.issueButton,

            (
              saving ||
              !selectedBook ||
              !selectedSubscriber
            ) &&
              styles.disabledButton,
          ]}
        >

          {saving ? (

            <ActivityIndicator
              color="#FFFFFF"
            />

          ) : (

            <>

              <Ionicons
                name="arrow-up-circle-outline"
                size={21}
                color="#FFFFFF"
              />

              <Text
                style={
                  styles.issueButtonText
                }
              >
                Issue Book
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
    backgroundColor:
      Colors.background,
  },

  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
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

  stepTitle: {
    color:
      Colors.textPrimary,

    fontSize: 14,
    fontWeight: '800',

    marginTop: 7,
    marginBottom: 9,
  },

  searchRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 9,
  },

  searchBox: {
    flex: 1,
    height: 48,

    flexDirection: 'row',
    alignItems: 'center',

    gap: 8,

    paddingHorizontal: 12,

    backgroundColor:
      Colors.surface,

    borderWidth: 1,
    borderColor:
      Colors.border,

    borderRadius: 15,
  },

  searchInput: {
    flex: 1,

    color:
      Colors.textPrimary,

    fontSize: 12,
  },

  searchButton: {
    width: 48,
    height: 48,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor:
      Colors.primary,

    borderRadius: 15,
  },

  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',

    padding: 11,

    backgroundColor:
      Colors.surface,

    borderWidth: 1,
    borderColor:
      Colors.border,

    borderRadius: 16,

    marginBottom: 7,
  },

  bookIcon: {
    width: 43,
    height: 53,

    borderRadius: 12,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor:
      Colors.roseMist,
  },

  personIcon: {
    width: 43,
    height: 43,

    borderRadius: 14,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor:
      Colors.roseMist,
  },

  personInitial: {
    color:
      Colors.primaryDark,

    fontSize: 17,
    fontWeight: '800',
  },

  resultContent: {
    flex: 1,
    marginLeft: 10,
  },

  resultTitle: {
    color:
      Colors.textPrimary,

    fontSize: 12,
    fontWeight: '800',
  },

  resultLine: {
    color:
      Colors.textSecondary,

    fontSize: 9,
    marginTop: 2,
  },

  serial: {
    color:
      Colors.primaryDark,

    fontSize: 9,
    fontWeight: '800',

    marginTop: 4,
  },

  selectedCard: {
    flexDirection: 'row',
    alignItems: 'center',

    padding: 12,

    backgroundColor:
      Colors.softAccent,

    borderWidth: 1,
    borderColor:
      Colors.secondary,

    borderRadius: 17,

    marginBottom: 12,
  },

  selectedIcon: {
    width: 46,
    height: 54,

    alignItems: 'center',
    justifyContent: 'center',

    borderRadius: 13,

    backgroundColor:
      Colors.surface,
  },

  selectedContent: {
    flex: 1,
    marginLeft: 10,
  },

  selectedTitle: {
    color:
      Colors.textPrimary,

    fontSize: 13,
    fontWeight: '800',
  },

  selectedLine: {
    color:
      Colors.textSecondary,

    fontSize: 9,
    marginTop: 2,
  },

  selectedSerial: {
    color:
      Colors.primaryDark,

    fontSize: 9,
    fontWeight: '800',
    marginTop: 4,
  },

  dateBox: {
    height: 49,

    flexDirection: 'row',
    alignItems: 'center',

    gap: 8,

    paddingHorizontal: 13,

    borderRadius: 15,

    backgroundColor:
      Colors.surface,

    borderWidth: 1,
    borderColor:
      Colors.border,

    marginBottom: 13,
  },

  dateText: {
    flex: 1,

    color:
      Colors.textPrimary,

    fontSize: 11,
    fontWeight: '700',
  },

  notesBox: {
    minHeight: 90,

    padding: 12,

    borderRadius: 15,

    backgroundColor:
      Colors.surface,

    borderWidth: 1,
    borderColor:
      Colors.border,

    marginBottom: 22,
  },

  notesInput: {
    minHeight: 65,

    color:
      Colors.textPrimary,

    fontSize: 11,

    textAlignVertical: 'top',
  },

  issueButton: {
    height: 53,

    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',

    gap: 8,

    borderRadius: 17,

    backgroundColor:
      Colors.primary,
  },

  issueButtonText: {
    color: '#FFFFFF',

    fontSize: 14,
    fontWeight: '800',
  },

  disabledButton: {
    opacity: 0.45,
  },

});