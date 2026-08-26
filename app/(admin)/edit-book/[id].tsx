import {
    useEffect,
    useState,
} from 'react';

import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    SafeAreaView,
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
    useLocalSearchParams,
} from 'expo-router';

import * as ImagePicker from 'expo-image-picker';

import {
    AdminBook,
    deleteBookCover,
    getAdminBookById,
    serialBelongsToAnotherBook,
    updateBook,
    uploadBookCover,
} from '../../../services/books';

import {
    Colors,
} from '../../../constants/theme';


export default function EditBookScreen() {

  const { id } =
    useLocalSearchParams<{
      id: string;
    }>();


  const [book, setBook] =
    useState<AdminBook | null>(null);


  const [serialNumber, setSerialNumber] =
    useState('');

  const [title, setTitle] =
    useState('');

  const [author, setAuthor] =
    useState('');

  const [publisher, setPublisher] =
    useState('');

  const [category, setCategory] =
    useState('');

  const [location, setLocation] =
    useState('');

  const [cost, setCost] =
    useState('');


  const [originalCoverPath, setOriginalCoverPath] =
    useState<string | null>(null);

  const [existingCoverUrl, setExistingCoverUrl] =
    useState<string | null>(null);

  const [newCoverUri, setNewCoverUri] =
    useState<string | null>(null);

  const [removeCoverRequested, setRemoveCoverRequested] =
    useState(false);


  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);


  useEffect(() => {

    if (id) {
      loadBook();
    }

  }, [id]);


  async function loadBook() {

    try {

      setLoading(true);

      const result =
        await getAdminBookById(id);


      if (!result) {

        Alert.alert(
          'Book Not Found',
          'This physical copy could not be found.',
          [
            {
              text: 'Go Back',
              onPress: () =>
                router.back(),
            },
          ]
        );

        return;
      }


      setBook(result);

      setSerialNumber(
        result.serial_number ?? ''
      );

      setTitle(
        result.title ?? ''
      );

      setAuthor(
        result.author ?? ''
      );

      setPublisher(
        result.publisher ?? ''
      );

      setCategory(
        result.category ?? ''
      );

      setLocation(
        result.location ?? ''
      );

      setCost(
        result.cost !== null &&
        result.cost !== undefined
          ? String(result.cost)
          : ''
      );

      setOriginalCoverPath(
        result.cover_path ?? null
      );

      setExistingCoverUrl(
        result.cover_url ?? null
      );

    } catch (error: any) {

      console.log(
        'Load edit book error:',
        error
      );

      Alert.alert(
        'Unable to Load Book',
        error?.message ??
          'Something went wrong.'
      );

    } finally {

      setLoading(false);

    }

  }


  async function selectCover() {

    const permission =
      await ImagePicker
        .requestMediaLibraryPermissionsAsync();


    if (!permission.granted) {

      Alert.alert(
        'Permission Required',
        'Please allow photo access to select a book cover.'
      );

      return;
    }


    const result =
      await ImagePicker
        .launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [2, 3],
          quality: 0.8,
        });


    if (!result.canceled) {

      setNewCoverUri(
        result.assets[0].uri
      );

      setRemoveCoverRequested(false);

    }

  }


  function removeCover() {

    setNewCoverUri(null);

    setExistingCoverUrl(null);

    setRemoveCoverRequested(true);

  }


  async function saveChanges() {

    if (!book) {
      return;
    }


    if (!serialNumber.trim()) {

      Alert.alert(
        'Serial Number Required',
        'Please enter the serial number.'
      );

      return;
    }


    if (!title.trim()) {

      Alert.alert(
        'Title Required',
        'Please enter the book title.'
      );

      return;
    }


    if (!author.trim()) {

      Alert.alert(
        'Writer Required',
        'Please enter the writer name.'
      );

      return;
    }


    const parsedCost =
      cost.trim()
        ? Number(cost)
        : null;


    if (
      parsedCost !== null &&
      (
        Number.isNaN(parsedCost) ||
        parsedCost < 0
      )
    ) {

      Alert.alert(
        'Invalid Cost',
        'Please enter a valid cost.'
      );

      return;
    }


    let uploadedCoverPath:
      string | null = null;


    try {

      setSaving(true);


      const serialConflict =
        await serialBelongsToAnotherBook(
          serialNumber,
          book.id
        );


      if (serialConflict) {

        Alert.alert(
          'Serial Number Exists',
          `Another book already uses serial number ${serialNumber.trim()}.`
        );

        return;
      }


      let finalCoverPath =
        originalCoverPath;


      if (newCoverUri) {

        uploadedCoverPath =
          await uploadBookCover(
            newCoverUri,
            serialNumber
          );

        finalCoverPath =
          uploadedCoverPath;

      } else if (
        removeCoverRequested
      ) {

        finalCoverPath = null;

      }


      await updateBook(
        book.id,
        {
          serial_number:
            serialNumber.trim(),

          title:
            title.trim(),

          author:
            author.trim(),

          publisher:
            publisher.trim() || null,

          category:
            category.trim() || null,

          location:
            location.trim() || null,

          cost:
            parsedCost,

          cover_path:
            finalCoverPath,
        }
      );


      /*
       * Remove the old image only AFTER
       * the database update succeeds.
       */

      if (
        originalCoverPath &&
        originalCoverPath !==
          finalCoverPath
      ) {

        try {

          await deleteBookCover(
            originalCoverPath
          );

        } catch (coverError) {

          console.log(
            'Old cover cleanup failed:',
            coverError
          );

        }

      }


      Alert.alert(
        'Book Updated',
        `"${title.trim()}" has been updated successfully.`,
        [
          {
            text: 'Done',
            onPress: () =>
              router.back(),
          },
        ]
      );


    } catch (error: any) {

      /*
       * If we uploaded a new cover
       * but database update failed,
       * remove the unused image.
       */

      if (uploadedCoverPath) {

        try {

          await deleteBookCover(
            uploadedCoverPath
          );

        } catch {}

      }


      console.log(
        'Update book error:',
        error
      );


      Alert.alert(
        'Update Failed',
        error?.message ??
          'Unable to update this book.'
      );


    } finally {

      setSaving(false);

    }

  }


  if (loading) {

    return (

      <SafeAreaView
        style={styles.loadingScreen}
      >

        <ActivityIndicator
          size="large"
          color={Colors.primary}
        />

        <Text
          style={styles.loadingText}
        >
          Loading book...
        </Text>

      </SafeAreaView>

    );

  }


  if (!book) {
    return null;
  }


  const displayedCover =
    newCoverUri ??
    existingCoverUrl;


  return (

    <SafeAreaView
      style={styles.safeArea}
    >

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : undefined
        }
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
                style={
                  styles.headerTitle
                }
              >
                Edit Book
              </Text>

              <Text
                style={
                  styles.headerSubtitle
                }
              >
                Physical copy #{book.serial_number}
              </Text>

            </View>


            <Image
              source={require(
                '../../../assets/images/library-logo.png'
              )}
              style={styles.logo}
              resizeMode="contain"
            />

          </View>



          {/* STATUS */}

          <View style={styles.statusRow}>

            <View
              style={[
                styles.statusBadge,

                book.is_available
                  ? styles.availableBadge
                  : styles.issuedBadge,
              ]}
            >

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


            <View
              style={[
                styles.statusBadge,

                book.is_active
                  ? styles.activeBadge
                  : styles.inactiveBadge,
              ]}
            >

              <Text
                style={[
                  styles.statusText,

                  book.is_active
                    ? styles.activeText
                    : styles.inactiveText,
                ]}
              >
                {book.is_active
                  ? 'Active'
                  : 'Inactive'}
              </Text>

            </View>

          </View>



          {/* COVER */}

          <Text style={styles.sectionTitle}>
            Book Cover
          </Text>


          <View style={styles.coverSection}>

            <Pressable
              onPress={selectCover}
              style={styles.coverBox}
            >

              {displayedCover ? (

                <Image
                  source={{
                    uri: displayedCover,
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
                    name="image-outline"
                    size={32}
                    color={
                      Colors.primary
                    }
                  />

                  <Text
                    style={
                      styles.noCoverText
                    }
                  >
                    Select Cover
                  </Text>

                </View>

              )}

            </Pressable>


            <View
              style={styles.coverActions}
            >

              <Pressable
                onPress={selectCover}
                style={styles.coverButton}
              >

                <Ionicons
                  name="image-outline"
                  size={16}
                  color={
                    Colors.primaryDark
                  }
                />

                <Text
                  style={
                    styles.coverButtonText
                  }
                >
                  Change
                </Text>

              </Pressable>


              {displayedCover && (

                <Pressable
                  onPress={removeCover}
                  style={
                    styles.coverButton
                  }
                >

                  <Ionicons
                    name="trash-outline"
                    size={16}
                    color={
                      Colors.danger
                    }
                  />

                  <Text
                    style={[
                      styles
                        .coverButtonText,
                      {
                        color:
                          Colors.danger,
                      },
                    ]}
                  >
                    Remove
                  </Text>

                </Pressable>

              )}

            </View>

          </View>



          {/* DETAILS */}

          <Text style={styles.sectionTitle}>
            Book Information
          </Text>


          <View style={styles.formCard}>

            <FormInput
              label="Serial Number *"
              icon="barcode-outline"
              value={serialNumber}
              onChangeText={
                setSerialNumber
              }
            />

            <FormInput
              label="Book Title *"
              icon="book-outline"
              value={title}
              onChangeText={setTitle}
            />

            <FormInput
              label="Writer *"
              icon="person-outline"
              value={author}
              onChangeText={setAuthor}
            />

            <FormInput
              label="Publisher"
              icon="business-outline"
              value={publisher}
              onChangeText={
                setPublisher
              }
            />

            <FormInput
              label="Category"
              icon="grid-outline"
              value={category}
              onChangeText={
                setCategory
              }
            />

            <FormInput
              label="Location"
              icon="location-outline"
              value={location}
              onChangeText={
                setLocation
              }
            />

            <FormInput
              label="Cost"
              icon="pricetag-outline"
              value={cost}
              onChangeText={setCost}
              keyboardType="decimal-pad"
              last
            />

          </View>



          {/* SAVE */}

          <Pressable
            onPress={saveChanges}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveButton,

              pressed &&
                styles.buttonPressed,

              saving &&
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
                  name="save-outline"
                  size={20}
                  color="#FFFFFF"
                />

                <Text
                  style={styles.saveText}
                >
                  Save Changes
                </Text>
              </>

            )}

          </Pressable>


        </ScrollView>

      </KeyboardAvoidingView>

    </SafeAreaView>

  );

}



function FormInput({
  label,
  icon,
  value,
  onChangeText,
  keyboardType = 'default',
  last = false,
}: {
  label: string;
  icon:
    keyof typeof Ionicons.glyphMap;
  value: string;
  onChangeText:
    (value: string) => void;
  keyboardType?:
    'default' |
    'decimal-pad' |
    'numeric';
  last?: boolean;
}) {

  return (

    <View
      style={[
        styles.inputSection,

        last &&
          styles.lastInput,
      ]}
    >

      <Text style={styles.label}>
        {label}
      </Text>


      <View style={styles.inputBox}>

        <Ionicons
          name={icon}
          size={17}
          color={Colors.primary}
        />

        <TextInput
          value={value}
          onChangeText={
            onChangeText
          }
          keyboardType={
            keyboardType
          }
          style={styles.input}
        />

      </View>

    </View>

  );

}



const styles = StyleSheet.create({

  flex: {
    flex: 1,
  },

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
    marginBottom: 13,
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
    width: 46,
    height: 46,
  },

  statusRow: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: 18,
  },

  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 9,
  },

  availableBadge: {
    backgroundColor:
      '#EAF6EF',
  },

  issuedBadge: {
    backgroundColor:
      '#FFF1F3',
  },

  activeBadge: {
    backgroundColor:
      Colors.softAccent,
  },

  inactiveBadge: {
    backgroundColor:
      '#EFEFEF',
  },

  statusText: {
    fontSize: 9,
    fontWeight: '800',
  },

  availableText: {
    color: Colors.success,
  },

  issuedText: {
    color: Colors.danger,
  },

  activeText: {
    color:
      Colors.primaryDark,
  },

  inactiveText: {
    color:
      Colors.textSecondary,
  },

  sectionTitle: {
    color:
      Colors.textPrimary,

    fontSize: 15,
    fontWeight: '800',

    marginBottom: 10,
  },

  coverSection: {
    alignItems: 'center',
    marginBottom: 22,
  },

  coverBox: {
    width: 135,
    height: 190,

    overflow: 'hidden',

    borderRadius: 18,

    backgroundColor:
      Colors.surface,

    borderWidth: 1,
    borderColor:
      Colors.border,
  },

  cover: {
    width: '100%',
    height: '100%',
  },

  coverPlaceholder: {
    flex: 1,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor:
      Colors.roseMist,
  },

  noCoverText: {
    color:
      Colors.textSecondary,

    fontSize: 10,
    marginTop: 7,
  },

  coverActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 9,
  },

  coverButton: {
    flexDirection: 'row',
    alignItems: 'center',

    gap: 5,

    paddingVertical: 7,
    paddingHorizontal: 11,

    backgroundColor:
      Colors.surface,

    borderRadius: 12,

    borderWidth: 1,
    borderColor:
      Colors.border,
  },

  coverButtonText: {
    color:
      Colors.primaryDark,

    fontSize: 10,
    fontWeight: '700',
  },

  formCard: {
    backgroundColor:
      Colors.surface,

    borderRadius: 20,

    paddingHorizontal: 14,

    borderWidth: 1,
    borderColor:
      Colors.border,

    marginBottom: 19,
  },

  inputSection: {
    paddingVertical: 11,

    borderBottomWidth: 1,
    borderBottomColor:
      Colors.border,
  },

  lastInput: {
    borderBottomWidth: 0,
  },

  label: {
    color:
      Colors.textPrimary,

    fontSize: 10,
    fontWeight: '700',

    marginBottom: 6,
  },

  inputBox: {
    height: 45,

    flexDirection: 'row',
    alignItems: 'center',

    gap: 8,

    paddingHorizontal: 11,

    backgroundColor:
      Colors.roseMist,

    borderRadius: 13,

    borderWidth: 1,
    borderColor:
      Colors.border,
  },

  input: {
    flex: 1,
    height: '100%',

    color:
      Colors.textPrimary,

    fontSize: 12,
  },

  saveButton: {
    height: 51,

    flexDirection: 'row',

    alignItems: 'center',
    justifyContent: 'center',

    gap: 7,

    borderRadius: 16,

    backgroundColor:
      Colors.primary,
  },

  saveText: {
    color: '#FFFFFF',

    fontSize: 14,
    fontWeight: '800',
  },

  buttonPressed: {
    opacity: 0.85,
  },

  disabledButton: {
    opacity: 0.65,
  },

  loadingScreen: {
    flex: 1,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor:
      Colors.background,
  },

  loadingText: {
    color:
      Colors.textSecondary,

    marginTop: 8,
    fontSize: 11,
  },

});