import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import {
    router,
} from 'expo-router';

import * as ImagePicker from 'expo-image-picker';

import {
    createBook,
    serialNumberExists,
    uploadBookCover,
} from '../../services/books';

import {
    AppTheme,
    Colors,
} from '../../constants/theme';


export default function AddBookScreen() {

  const [serialNumber, setSerialNumber] =
    useState('');

  const [title, setTitle] =
    useState('');

  const [author, setAuthor] =
    useState('');

  const [publisher, setPublisher] =
    useState('');

  const [location, setLocation] =
    useState('');

  const [cost, setCost] =
    useState('');

  const [category, setCategory] =
    useState('');

  const [coverUri, setCoverUri] =
    useState<string | null>(null);

  const [saving, setSaving] =
    useState(false);


  async function selectCover() {

    try {

      const permission =
        await ImagePicker
          .requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {

        Alert.alert(
          'Permission Required',
          'Please allow access to your photos to select a book cover.'
        );

        return;
      }


      const result =
        await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [2, 3],
          quality: 0.8,
        });


      if (!result.canceled) {
        setCoverUri(
          result.assets[0].uri
        );
      }

    } catch (error) {

      console.log(
        'Image picker error:',
        error
      );

      Alert.alert(
        'Error',
        'Unable to select the image.'
      );

    }

  }


  function removeCover() {
    setCoverUri(null);
  }


  async function saveBook() {

    if (!serialNumber.trim()) {

      Alert.alert(
        'Serial Number Required',
        'Please enter the book serial number.'
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
        'Please enter a valid book cost.'
      );

      return;
    }


    try {

      setSaving(true);


      const duplicateSerial =
        await serialNumberExists(
          serialNumber
        );


      if (duplicateSerial) {

        Alert.alert(
          'Serial Number Exists',
          `A book with serial number ${serialNumber.trim()} already exists.`
        );

        return;
      }


      let coverPath:
        string | null = null;


      if (coverUri) {

        coverPath =
          await uploadBookCover(
            coverUri,
            serialNumber
          );

      }


      await createBook({
        serial_number:
          serialNumber,

        title,

        author,

        publisher:
          publisher || null,

        location:
          location || null,

        cost:
          parsedCost,

        category:
          category || null,

        cover_path:
          coverPath,
      });


      Alert.alert(
        'Book Added',
        `"${title.trim()}" has been added successfully.`,
        [
          {
            text: 'Add Another',

            onPress: () => {
              resetForm();
            },
          },

          {
            text: 'Done',

            onPress: () => {
              router.back();
            },
          },
        ]
      );


    } catch (error: any) {

      console.log(
        'Add book error:',
        error
      );


      Alert.alert(
        'Unable to Add Book',
        error?.message ??
          'Something went wrong while adding the book.'
      );

    } finally {

      setSaving(false);

    }

  }


  function resetForm() {

    setSerialNumber('');
    setTitle('');
    setAuthor('');
    setPublisher('');
    setLocation('');
    setCost('');
    setCategory('');
    setCoverUri(null);

  }


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
                Add Book
              </Text>

              <Text
                style={
                  styles.headerSubtitle
                }
              >
                Add a new physical copy
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



          {/* COVER */}

          <Text
            style={styles.sectionTitle}
          >
            Book Cover
          </Text>


          <View style={styles.coverArea}>

            <Pressable
              onPress={selectCover}
              style={({ pressed }) => [
                styles.coverPicker,

                pressed &&
                  styles.pressed,
              ]}
            >

              {coverUri ? (

                <Image
                  source={{
                    uri: coverUri,
                  }}
                  style={styles.coverImage}
                  resizeMode="cover"
                />

              ) : (

                <View
                  style={
                    styles.coverEmpty
                  }
                >

                  <View
                    style={
                      styles.coverIcon
                    }
                  >

                    <Ionicons
                      name="image-outline"
                      size={28}
                      color={
                        Colors.primary
                      }
                    />

                  </View>

                  <Text
                    style={
                      styles.coverTitle
                    }
                  >
                    Add Cover
                  </Text>

                  <Text
                    style={
                      styles.coverHint
                    }
                  >
                    Tap to select image
                  </Text>

                </View>

              )}

            </Pressable>


            {coverUri && (

              <View
                style={styles.coverActions}
              >

                <Pressable
                  onPress={selectCover}
                  style={
                    styles.smallAction
                  }
                >

                  <Ionicons
                    name="swap-horizontal-outline"
                    size={17}
                    color={
                      Colors.primaryDark
                    }
                  />

                  <Text
                    style={
                      styles.smallActionText
                    }
                  >
                    Change
                  </Text>

                </Pressable>


                <Pressable
                  onPress={removeCover}
                  style={
                    styles.smallAction
                  }
                >

                  <Ionicons
                    name="trash-outline"
                    size={17}
                    color={Colors.danger}
                  />

                  <Text
                    style={[
                      styles
                        .smallActionText,

                      {
                        color:
                          Colors.danger,
                      },
                    ]}
                  >
                    Remove
                  </Text>

                </Pressable>

              </View>

            )}

          </View>



          {/* BASIC DETAILS */}

          <Text
            style={styles.sectionTitle}
          >
            Book Information
          </Text>


          <View style={styles.formCard}>

            <FormInput
              label="Serial Number *"
              placeholder="e.g. 1005"
              value={serialNumber}
              onChangeText={
                setSerialNumber
              }
              icon="barcode-outline"
            />


            <FormInput
              label="Book Title *"
              placeholder="Enter book title"
              value={title}
              onChangeText={setTitle}
              icon="book-outline"
            />


            <FormInput
              label="Writer *"
              placeholder="Enter writer name"
              value={author}
              onChangeText={setAuthor}
              icon="person-outline"
            />


            <FormInput
              label="Publisher"
              placeholder="Enter publisher"
              value={publisher}
              onChangeText={
                setPublisher
              }
              icon="business-outline"
            />


            <FormInput
              label="Category"
              placeholder="e.g. Spiritual"
              value={category}
              onChangeText={setCategory}
              icon="grid-outline"
            />


            <FormInput
              label="Location"
              placeholder="e.g. Shelf A-12"
              value={location}
              onChangeText={setLocation}
              icon="location-outline"
            />


            <FormInput
              label="Cost"
              placeholder="e.g. 250"
              value={cost}
              onChangeText={setCost}
              icon="pricetag-outline"
              keyboardType="decimal-pad"
              last
            />

          </View>



          {/* SAVE */}

          <Pressable
            onPress={saveBook}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveButton,

              pressed &&
                styles.savePressed,

              saving &&
                styles.saveDisabled,
            ]}
          >

            {saving ? (

              <>
                <ActivityIndicator
                  color="#FFFFFF"
                  size="small"
                />

                <Text
                  style={
                    styles.saveText
                  }
                >
                  Saving...
                </Text>
              </>

            ) : (

              <>
                <Ionicons
                  name="add-circle-outline"
                  size={21}
                  color="#FFFFFF"
                />

                <Text
                  style={
                    styles.saveText
                  }
                >
                  Add Book
                </Text>
              </>

            )}

          </Pressable>


          <Text style={styles.note}>
            * Required fields
          </Text>


        </ScrollView>

      </KeyboardAvoidingView>

    </SafeAreaView>

  );

}



function FormInput({
  label,
  placeholder,
  value,
  onChangeText,
  icon,
  keyboardType = 'default',
  last = false,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText:
    (text: string) => void;

  icon:
    keyof typeof Ionicons.glyphMap;

  keyboardType?:
    'default' |
    'numeric' |
    'decimal-pad';

  last?: boolean;
}) {

  return (

    <View
      style={[
        styles.inputSection,

        last &&
          styles.lastInputSection,
      ]}
    >

      <Text style={styles.label}>
        {label}
      </Text>


      <View style={styles.inputBox}>

        <Ionicons
          name={icon}
          size={18}
          color={Colors.primary}
        />

        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={
            Colors.textSecondary
          }
          keyboardType={keyboardType}
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

    marginBottom: 18,
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

    fontSize: 11,

    marginTop: 2,
  },


  logo: {
    width: 47,
    height: 47,
  },


  sectionTitle: {
    color:
      Colors.textPrimary,

    fontSize: 15,
    fontWeight: '800',

    marginBottom: 10,
    marginTop: 5,
  },


  /* COVER */

  coverArea: {
    alignItems: 'center',

    marginBottom: 23,
  },


  coverPicker: {
    width: 135,
    height: 190,

    borderRadius: 18,

    overflow: 'hidden',

    backgroundColor:
      Colors.surface,

    borderWidth: 1.5,
    borderStyle: 'dashed',

    borderColor:
      Colors.secondary,
  },


  coverImage: {
    width: '100%',
    height: '100%',
  },


  coverEmpty: {
    flex: 1,

    alignItems: 'center',
    justifyContent: 'center',

    padding: 12,
  },


  coverIcon: {
    width: 49,
    height: 49,

    borderRadius: 16,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor:
      Colors.roseMist,
  },


  coverTitle: {
    color:
      Colors.textPrimary,

    fontSize: 13,
    fontWeight: '800',

    marginTop: 10,
  },


  coverHint: {
    color:
      Colors.textSecondary,

    fontSize: 9,

    marginTop: 3,
  },


  coverActions: {
    flexDirection: 'row',

    gap: 8,

    marginTop: 9,
  },


  smallAction: {
    flexDirection: 'row',
    alignItems: 'center',

    gap: 5,

    paddingVertical: 7,
    paddingHorizontal: 11,

    borderRadius:
      AppTheme.radius.pill,

    backgroundColor:
      Colors.surface,

    borderWidth: 1,
    borderColor:
      Colors.border,
  },


  smallActionText: {
    color:
      Colors.primaryDark,

    fontSize: 10,
    fontWeight: '700',
  },


  /* FORM */

  formCard: {
    backgroundColor:
      Colors.surface,

    borderRadius: 20,

    paddingHorizontal: 14,

    borderWidth: 1,
    borderColor:
      Colors.border,

    marginBottom: 20,
  },


  inputSection: {
    paddingVertical: 12,

    borderBottomWidth: 1,
    borderBottomColor:
      Colors.border,
  },


  lastInputSection: {
    borderBottomWidth: 0,
  },


  label: {
    color:
      Colors.textPrimary,

    fontSize: 11,
    fontWeight: '700',

    marginBottom: 7,
  },


  inputBox: {
    height: 47,

    flexDirection: 'row',
    alignItems: 'center',

    gap: 9,

    paddingHorizontal: 12,

    borderRadius: 14,

    backgroundColor:
      Colors.roseMist,

    borderWidth: 1,
    borderColor:
      Colors.border,
  },


  input: {
    flex: 1,

    height: '100%',

    color:
      Colors.textPrimary,

    fontSize: 13,
  },


  /* SAVE */

  saveButton: {
    height: 52,

    flexDirection: 'row',

    alignItems: 'center',
    justifyContent: 'center',

    gap: 8,

    backgroundColor:
      Colors.primary,

    borderRadius: 17,

    elevation: 2,
  },


  savePressed: {
    opacity: 0.88,

    transform: [
      {
        scale: 0.99,
      },
    ],
  },


  saveDisabled: {
    opacity: 0.65,
  },


  saveText: {
    color: '#FFFFFF',

    fontSize: 15,
    fontWeight: '800',
  },


  note: {
    color:
      Colors.textSecondary,

    fontSize: 9,

    textAlign: 'center',

    marginTop: 10,
  },


  pressed: {
    opacity: 0.8,
  },

});