import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../constants/theme';

export function RefreshStatusBar({
  onRefresh,
  refreshing,
  message,
  error,
}: {
  onRefresh: () => void;
  refreshing: boolean;
  message: string | null;
  error?: boolean;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.messageArea}>
        {refreshing ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <Ionicons
            name={error ? 'alert-circle-outline' : 'checkmark-circle-outline'}
            size={18}
            color={error ? Colors.danger : Colors.success}
          />
        )}
        <Text style={[styles.message, error && styles.errorText]}>
          {refreshing ? 'Refreshing data…' : message || 'Data is up to date'}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Refresh data"
        disabled={refreshing}
        onPress={onRefresh}
        style={({ pressed }) => [styles.button, pressed && styles.pressed, refreshing && styles.disabled]}
      >
        <Ionicons name="refresh-outline" size={18} color={Colors.primaryDark} />
        <Text style={styles.buttonText}>Refresh</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
  },
  messageArea: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 7,
  },
  message: {
    color: Colors.textSecondary,
    flex: 1,
    fontSize: 12,
  },
  errorText: {
    color: Colors.danger,
  },
  button: {
    alignItems: 'center',
    backgroundColor: Colors.roseMist,
    borderRadius: 9,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  buttonText: {
    color: Colors.primaryDark,
    fontSize: 12,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.55,
  },
});
