import { useRef, useState } from 'react';
import {
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Colors } from '../../constants/theme';
import { addSubscriber } from '../../services/subscribers';

export default function AddSubscriberScreen() {
  const [fullName, setFullName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);

  async function save() {
    if (submitting.current) {
      return;
    }
    if (!fullName.trim()) {
      Alert.alert('Name Required', 'Enter the subscriber name.');
      return;
    }
    try {
      submitting.current = true;
      setSaving(true);
      await addSubscriber(fullName, mobileNumber);
      router.back();
      Alert.alert('Subscriber Added', 'This subscriber is now available when issuing a book.');
    } catch (error) {
      Alert.alert('Unable to Add Subscriber', error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="chevron-back" size={23} color={Colors.primaryDark} />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={styles.title}>Add Subscriber</Text>
              <Text style={styles.subtitle}>Add a borrower manually</Text>
            </View>
            <Image
              source={require('../../assets/images/library-logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Subscriber name</Text>
            <TextInput
              autoFocus
              value={fullName}
              onChangeText={setFullName}
              placeholder="Enter full name"
              placeholderTextColor={Colors.textSecondary}
              style={styles.input}
            />
            <Text style={styles.label}>Mobile number (optional)</Text>
            <TextInput
              value={mobileNumber}
              onChangeText={setMobileNumber}
              keyboardType="phone-pad"
              placeholder="Enter mobile number"
              placeholderTextColor={Colors.textSecondary}
              style={styles.input}
            />
            <Text style={styles.helpText}>
              This creates a local library borrower only. It does not create a login account.
            </Text>
            <Pressable
              disabled={saving}
              onPress={() => void save()}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, saving && styles.disabled]}
            >
              <Ionicons name="person-add-outline" size={20} color={Colors.surface} />
              <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : 'Add subscriber'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  content: { padding: 16, gap: 16 },
  header: { alignItems: 'center', flexDirection: 'row', paddingBottom: 8 },
  backButton: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  headerText: { flex: 1, marginLeft: 11 },
  title: { color: Colors.primaryDark, fontSize: 22, fontWeight: '800' },
  subtitle: { color: Colors.textSecondary, fontSize: 10, marginTop: 2 },
  logo: { height: 45, width: 45 },
  card: { backgroundColor: Colors.surface, borderColor: Colors.border, borderRadius: 16, borderWidth: 1, gap: 10, padding: 16 },
  label: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700' },
  input: { backgroundColor: Colors.background, borderColor: Colors.border, borderRadius: 10, borderWidth: 1, color: Colors.textPrimary, minHeight: 48, paddingHorizontal: 12 },
  helpText: { color: Colors.textSecondary, fontSize: 12, lineHeight: 18 },
  primaryButton: { alignItems: 'center', backgroundColor: Colors.primary, borderRadius: 12, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 48, marginTop: 6 },
  primaryButtonText: { color: Colors.surface, fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.55 },
});
