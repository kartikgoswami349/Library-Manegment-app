import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../constants/theme';

type DatePickerFieldProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  minimumDate?: Date;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
};

function dateToString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromString(value: string | null): Date {
  if (!value) {
    return new Date();
  }
  return new Date(`${value}T00:00:00`);
}

export function DatePickerField({
  value,
  onChange,
  minimumDate,
  placeholder = 'Select date',
  style,
}: DatePickerFieldProps) {
  const [visible, setVisible] = useState(false);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.webField, style]}>
        <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
        {React.createElement('input', {
          type: 'date',
          value: value ?? '',
          min: minimumDate ? dateToString(minimumDate) : undefined,
          placeholder,
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
            onChange(event.target.value || null);
          },
          style: {
            background: 'transparent',
            border: 'none',
            color: value ? Colors.textPrimary : Colors.textSecondary,
            flex: 1,
            fontFamily: 'inherit',
            fontSize: 14,
            outline: 'none',
            width: '100%',
          },
        })}
      </View>
    );
  }

  function handleNativeChange(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === 'android') {
      setVisible(false);
    }
    if (event.type === 'set' && date) {
      onChange(dateToString(date));
    }
  }

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        style={[styles.nativeField, style]}
      >
        <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
        <Text style={[styles.nativeText, !value && styles.placeholder]}>
          {value ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
      </Pressable>
      {visible && (
        <DateTimePicker
          value={dateFromString(value)}
          mode="date"
          minimumDate={minimumDate}
          onChange={handleNativeChange}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  nativeField: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  webField: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  nativeText: {
    color: Colors.textPrimary,
    flex: 1,
    fontSize: 14,
  },
  placeholder: {
    color: Colors.textSecondary,
  },
});
