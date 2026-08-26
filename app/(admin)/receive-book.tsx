import {
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
    ActiveBorrowing,
    receiveBook,
    searchActiveBorrowings,
} from '../../services/borrowings';

import {
    Colors,
} from '../../constants/theme';



export default function ReceiveBookScreen() {

  const [searchText, setSearchText] =
    useState('');

  const [results, setResults] =
    useState<ActiveBorrowing[]>([]);

  const [
    selectedBorrowing,
    setSelectedBorrowing,
  ] =
    useState<ActiveBorrowing | null>(
      null
    );

  const [searching, setSearching] =
    useState(false);

  const [receiving, setReceiving] =
    useState(false);



  async function searchIssuedBooks() {

    try {

      setSearching(true);

      const data =
        await searchActiveBorrowings(
          searchText
        );

      setResults(data);


    } catch (error: any) {

      Alert.alert(
        'Search Failed',
        error?.message ??
          'Unable to search issued books.'
      );


    } finally {

      setSearching(false);

    }

  }



  function clearSelection() {

    setSelectedBorrowing(null);

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



  function checkOverdue(
    value: string | null
  ) {

    if (!value) {
      return false;
    }


    const due =
      new Date(
        `${value}T23:59:59`
      );


    return due.getTime() <
      new Date().getTime();

  }



  function confirmReceive() {

    if (!selectedBorrowing) {
      return;
    }


    Alert.alert(
      'Receive Book',

      `Confirm return of #${selectedBorrowing.serial_number} "${selectedBorrowing.title}" from ${selectedBorrowing.subscriber_name || selectedBorrowing.subscriber_email}?`,

      [
        {
          text: 'Cancel',
          style: 'cancel',
        },

        {
          text: 'Receive Book',

          onPress: async () => {

            try {

              setReceiving(true);


              await receiveBook(
                selectedBorrowing.borrowing_id
              );


              Alert.alert(
                'Book Received',
                `"${selectedBorrowing.title}" is now available again.`,
                [
                  {
                    text:
                      'Receive Another',

                    onPress: () => {

                      setSelectedBorrowing(
                        null
                      );

                      setResults([]);

                      setSearchText('');

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
                'Receive Failed',
                error?.message ??
                  'Unable to receive this book.'
              );


            } finally {

              setReceiving(false);

            }

          },
        },
      ]
    );

  }



  return (

    <SafeAreaView
      style={styles.safeArea}
    >

      <ScrollView
        showsVerticalScrollIndicator={
          false
        }

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
              Receive Book
            </Text>

            <Text
              style={
                styles.headerSubtitle
              }
            >
              Return an issued copy
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

        {!selectedBorrowing && (

          <>

            <Text style={styles.sectionTitle}>
              Find Issued Book
            </Text>


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

                  placeholder="Serial, title, subscriber..."

                  placeholderTextColor={
                    Colors.textSecondary
                  }

                  returnKeyType="search"

                  onSubmitEditing={
                    searchIssuedBooks
                  }

                  style={
                    styles.searchInput
                  }
                />

                {!!searchText && (

                  <Pressable
                    onPress={() => {

                      setSearchText('');

                      setResults([]);

                    }}
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
                onPress={
                  searchIssuedBooks
                }

                style={
                  styles.searchButton
                }
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



            {/* RESULTS */}

            {results.length > 0 && (

              <View
                style={
                  styles.resultsHeader
                }
              >

                <Text
                  style={
                    styles.resultsTitle
                  }
                >
                  Active Borrowings
                </Text>

                <View
                  style={
                    styles.countBadge
                  }
                >

                  <Text
                    style={
                      styles.countText
                    }
                  >
                    {results.length}
                  </Text>

                </View>

              </View>

            )}


            {results.map(
              (item) => {

                const overdue =
                  checkOverdue(
                    item.due_date
                  );


                return (

                  <Pressable
                    key={
                      item.borrowing_id
                    }

                    onPress={() => {

                      setSelectedBorrowing(
                        item
                      );

                      setResults([]);

                    }}

                    style={
                      styles.resultCard
                    }
                  >


                    <View
                      style={
                        styles.coverBox
                      }
                    >

                      {item.cover_url ? (

                        <Image
                          source={{
                            uri:
                              item.cover_url,
                          }}

                          style={
                            styles.cover
                          }

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



                    <View
                      style={
                        styles.resultContent
                      }
                    >

                      <Text
                        style={
                          styles.bookTitle
                        }
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>


                      <Text
                        style={
                          styles.detailLine
                        }
                        numberOfLines={1}
                      >
                        Writer - {item.author}
                      </Text>


                      <Text
                        style={
                          styles.detailLine
                        }
                        numberOfLines={1}
                      >
                        Publisher - {item.publisher || 'Not set'}
                      </Text>


                      <Text
                        style={
                          styles.serialText
                        }
                      >
                        #{item.serial_number}
                      </Text>


                      <View
                        style={
                          styles.borrowerRow
                        }
                      >

                        <Ionicons
                          name="person-outline"
                          size={12}
                          color={
                            Colors.textSecondary
                          }
                        />

                        <Text
                          style={
                            styles.borrowerText
                          }
                          numberOfLines={1}
                        >
                          {item.subscriber_name ||
                            item.subscriber_email}
                        </Text>

                      </View>


                      <View
                        style={
                          styles.dateRow
                        }
                      >

                        <Text
                          style={
                            styles.dateLabel
                          }
                        >
                          Due:{' '}
                          {prettyDate(
                            item.due_date
                          )}
                        </Text>


                        {overdue && (

                          <View
                            style={
                              styles.overdueBadge
                            }
                          >

                            <Text
                              style={
                                styles.overdueText
                              }
                            >
                              Overdue
                            </Text>

                          </View>

                        )}

                      </View>

                    </View>


                    <Ionicons
                      name="chevron-forward"
                      size={19}
                      color={
                        Colors.primary
                      }
                    />

                  </Pressable>

                );

              }
            )}


            {!searching &&
              results.length === 0 &&
              searchText.trim() !== '' && (

                <View
                  style={
                    styles.emptyState
                  }
                >

                  <Ionicons
                    name="return-down-back-outline"
                    size={44}
                    color={
                      Colors.secondary
                    }
                  />

                  <Text
                    style={
                      styles.emptyTitle
                    }
                  >
                    No issued book found
                  </Text>

                  <Text
                    style={
                      styles.emptyText
                    }
                  >
                    Try another serial,
                    title or subscriber.
                  </Text>

                </View>

              )}

          </>

        )}



        {/* SELECTED BORROWING */}

        {selectedBorrowing && (

          <>

            <Text
              style={styles.sectionTitle}
            >
              Return Details
            </Text>


            <View
              style={
                styles.selectedBookCard
              }
            >

              <View
                style={
                  styles.selectedTop
                }
              >

                <View
                  style={
                    styles.largeCoverBox
                  }
                >

                  {selectedBorrowing.cover_url ? (

                    <Image
                      source={{
                        uri:
                          selectedBorrowing.cover_url,
                      }}

                      style={
                        styles.cover
                      }

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
                        size={32}
                        color={
                          Colors.primary
                        }
                      />

                    </View>

                  )}

                </View>


                <View
                  style={
                    styles.selectedContent
                  }
                >

                  <Text
                    style={
                      styles.selectedTitle
                    }
                  >
                    {selectedBorrowing.title}
                  </Text>


                  <Text
                    style={
                      styles.selectedLine
                    }
                  >
                    Writer -{' '}
                    {selectedBorrowing.author}
                  </Text>


                  <Text
                    style={
                      styles.selectedLine
                    }
                  >
                    Publisher -{' '}
                    {selectedBorrowing.publisher ||
                      'Not set'}
                  </Text>


                  <View
                    style={
                      styles.serialBadge
                    }
                  >

                    <Ionicons
                      name="barcode-outline"
                      size={13}
                      color={
                        Colors.primaryDark
                      }
                    />

                    <Text
                      style={
                        styles.serialBadgeText
                      }
                    >
                      #{selectedBorrowing.serial_number}
                    </Text>

                  </View>

                </View>


                <Pressable
                  onPress={
                    clearSelection
                  }
                >

                  <Ionicons
                    name="close-circle"
                    size={24}
                    color={
                      Colors.danger
                    }
                  />

                </Pressable>

              </View>

            </View>



            {/* BORROWER */}

            <View
              style={
                styles.infoCard
              }
            >

              <View
                style={
                  styles.infoIcon
                }
              >

                <Ionicons
                  name="person-outline"
                  size={22}
                  color={
                    Colors.primaryDark
                  }
                />

              </View>


              <View
                style={
                  styles.infoContent
                }
              >

                <Text
                  style={
                    styles.infoLabel
                  }
                >
                  Borrowed By
                </Text>

                <Text
                  style={
                    styles.infoMain
                  }
                >
                  {selectedBorrowing.subscriber_name ||
                    'Subscriber'}
                </Text>

                <Text
                  style={
                    styles.infoSecondary
                  }
                >
                  {selectedBorrowing.subscriber_email}
                </Text>

              </View>

            </View>



            {/* DATES */}

            <View
              style={
                styles.dateDetailsCard
              }
            >

              <View
                style={
                  styles.dateColumn
                }
              >

                <Text
                  style={
                    styles.dateHeading
                  }
                >
                  Issued
                </Text>

                <Text
                  style={
                    styles.dateValue
                  }
                >
                  {prettyDate(
                    selectedBorrowing.issued_at
                  )}
                </Text>

              </View>


              <View
                style={
                  styles.dateDivider
                }
              />


              <View
                style={
                  styles.dateColumn
                }
              >

                <Text
                  style={
                    styles.dateHeading
                  }
                >
                  Due
                </Text>

                <Text
                  style={[
                    styles.dateValue,

                    checkOverdue(
                      selectedBorrowing.due_date
                    ) && {
                      color:
                        Colors.danger,
                    },
                  ]}
                >
                  {prettyDate(
                    selectedBorrowing.due_date
                  )}
                </Text>

              </View>

            </View>



            {selectedBorrowing.notes && (

              <View
                style={
                  styles.notesCard
                }
              >

                <Text
                  style={
                    styles.notesLabel
                  }
                >
                  Issue Notes
                </Text>

                <Text
                  style={
                    styles.notesText
                  }
                >
                  {selectedBorrowing.notes}
                </Text>

              </View>

            )}



            {/* RECEIVE */}

            <Pressable
              onPress={
                confirmReceive
              }

              disabled={
                receiving
              }

              style={[
                styles.receiveButton,

                receiving &&
                  styles.disabledButton,
              ]}
            >

              {receiving ? (

                <ActivityIndicator
                  color="#FFFFFF"
                />

              ) : (

                <>

                  <Ionicons
                    name="arrow-down-circle-outline"
                    size={21}
                    color="#FFFFFF"
                  />

                  <Text
                    style={
                      styles.receiveButtonText
                    }
                  >
                    Receive Book
                  </Text>

                </>

              )}

            </Pressable>

          </>

        )}


      </ScrollView>

    </SafeAreaView>

  );

}



const styles =
  StyleSheet.create({

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

    sectionTitle: {
      color:
        Colors.textPrimary,

      fontSize: 15,
      fontWeight: '800',

      marginBottom: 10,
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

      borderRadius: 16,

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

    resultsHeader: {
      flexDirection: 'row',
      alignItems: 'center',

      marginTop: 18,
      marginBottom: 9,
    },

    resultsTitle: {
      color:
        Colors.textPrimary,

      fontSize: 14,
      fontWeight: '800',
    },

    countBadge: {
      minWidth: 25,
      height: 25,

      borderRadius: 13,

      paddingHorizontal: 6,

      alignItems: 'center',
      justifyContent: 'center',

      marginLeft: 7,

      backgroundColor:
        Colors.softAccent,
    },

    countText: {
      color:
        Colors.primaryDark,

      fontSize: 10,
      fontWeight: '800',
    },

    resultCard: {
      flexDirection: 'row',
      alignItems: 'center',

      padding: 10,

      borderRadius: 17,

      backgroundColor:
        Colors.surface,

      borderWidth: 1,
      borderColor:
        Colors.border,

      marginBottom: 8,
    },

    coverBox: {
      width: 60,
      height: 86,

      borderRadius: 11,

      overflow: 'hidden',

      backgroundColor:
        Colors.roseMist,
    },

    largeCoverBox: {
      width: 73,
      height: 103,

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

    resultContent: {
      flex: 1,
      marginLeft: 10,
    },

    bookTitle: {
      color:
        Colors.textPrimary,

      fontSize: 13,
      fontWeight: '800',
    },

    detailLine: {
      color:
        Colors.textSecondary,

      fontSize: 9,
      marginTop: 2,
    },

    serialText: {
      color:
        Colors.primaryDark,

      fontSize: 9,
      fontWeight: '800',
      marginTop: 4,
    },

    borrowerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 5,
    },

    borrowerText: {
      flex: 1,

      color:
        Colors.textSecondary,

      fontSize: 9,
    },

    dateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 5,
    },

    dateLabel: {
      color:
        Colors.textSecondary,

      fontSize: 8,
    },

    overdueBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,

      borderRadius: 6,

      backgroundColor:
        '#FFF0F2',
    },

    overdueText: {
      color:
        Colors.danger,

      fontSize: 7,
      fontWeight: '800',
    },

    emptyState: {
      alignItems: 'center',
      paddingTop: 70,
    },

    emptyTitle: {
      color:
        Colors.textPrimary,

      fontSize: 16,
      fontWeight: '800',
      marginTop: 9,
    },

    emptyText: {
      color:
        Colors.textSecondary,

      fontSize: 10,
      marginTop: 4,
    },

    selectedBookCard: {
      backgroundColor:
        Colors.surface,

      borderRadius: 19,

      padding: 12,

      borderWidth: 1,
      borderColor:
        Colors.border,

      marginBottom: 11,
    },

    selectedTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },

    selectedContent: {
      flex: 1,
      marginLeft: 11,
    },

    selectedTitle: {
      color:
        Colors.textPrimary,

      fontSize: 15,
      fontWeight: '800',
    },

    selectedLine: {
      color:
        Colors.textSecondary,

      fontSize: 9,
      marginTop: 3,
    },

    serialBadge: {
      alignSelf: 'flex-start',

      flexDirection: 'row',
      alignItems: 'center',

      gap: 4,

      marginTop: 8,

      paddingHorizontal: 7,
      paddingVertical: 4,

      borderRadius: 8,

      backgroundColor:
        Colors.roseMist,
    },

    serialBadgeText: {
      color:
        Colors.primaryDark,

      fontSize: 9,
      fontWeight: '800',
    },

    infoCard: {
      flexDirection: 'row',
      alignItems: 'center',

      padding: 12,

      borderRadius: 17,

      backgroundColor:
        Colors.surface,

      borderWidth: 1,
      borderColor:
        Colors.border,

      marginBottom: 10,
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
      marginLeft: 10,
    },

    infoLabel: {
      color:
        Colors.textSecondary,

      fontSize: 8,
    },

    infoMain: {
      color:
        Colors.textPrimary,

      fontSize: 12,
      fontWeight: '800',
      marginTop: 2,
    },

    infoSecondary: {
      color:
        Colors.textSecondary,

      fontSize: 9,
      marginTop: 2,
    },

    dateDetailsCard: {
      flexDirection: 'row',

      padding: 12,

      borderRadius: 17,

      backgroundColor:
        Colors.softAccent,

      marginBottom: 10,
    },

    dateColumn: {
      flex: 1,
    },

    dateDivider: {
      width: 1,

      backgroundColor:
        Colors.border,

      marginHorizontal: 10,
    },

    dateHeading: {
      color:
        Colors.textSecondary,

      fontSize: 8,
    },

    dateValue: {
      color:
        Colors.textPrimary,

      fontSize: 10,
      fontWeight: '800',
      marginTop: 3,
    },

    notesCard: {
      padding: 12,

      borderRadius: 15,

      backgroundColor:
        Colors.surface,

      borderWidth: 1,
      borderColor:
        Colors.border,

      marginBottom: 14,
    },

    notesLabel: {
      color:
        Colors.textPrimary,

      fontSize: 9,
      fontWeight: '800',
    },

    notesText: {
      color:
        Colors.textSecondary,

      fontSize: 9,
      lineHeight: 14,

      marginTop: 5,
    },

    receiveButton: {
      height: 53,

      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',

      gap: 8,

      borderRadius: 17,

      backgroundColor:
        Colors.primary,

      marginTop: 5,
    },

    receiveButtonText: {
      color: '#FFFFFF',

      fontSize: 14,
      fontWeight: '800',
    },

    disabledButton: {
      opacity: 0.6,
    },

  });