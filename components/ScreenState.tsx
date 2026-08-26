import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../constants/theme';


type EmptyStateProps = {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
};


export function EmptyState({
  icon = 'library-outline',
  title,
  message,
}: EmptyStateProps) {

  return (
    <View style={styles.container}>

      <View style={styles.iconBox}>
        <Ionicons
          name={icon}
          size={30}
          color={Colors.primary}
        />
      </View>

      <Text style={styles.title}>
        {title}
      </Text>

      {message ? (
        <Text style={styles.message}>
          {message}
        </Text>
      ) : null}

    </View>
  );
}



type LoadingStateProps = {
  message?: string;
};


export function LoadingState({
  message = 'Loading...',
}: LoadingStateProps) {

  return (
    <View style={styles.container}>

      <ActivityIndicator
        size="small"
        color={Colors.primary}
      />

      <Text style={styles.loadingText}>
        {message}
      </Text>

    </View>
  );
}



type ErrorStateProps = {
  title?: string;
  message?: string;
  onRetry?: () => void;
};


export function ErrorState({
  title = 'Something went wrong',
  message = 'Please try again.',
  onRetry,
}: ErrorStateProps) {

  return (
    <View style={styles.container}>

      <View style={styles.iconBox}>
        <Ionicons
          name="alert-circle-outline"
          size={30}
          color={Colors.primaryDark}
        />
      </View>

      <Text style={styles.title}>
        {title}
      </Text>

      <Text style={styles.message}>
        {message}
      </Text>

      {onRetry ? (

        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [
            styles.retryButton,
            pressed && {
              opacity: 0.75,
            },
          ]}
        >

          <Ionicons
            name="refresh-outline"
            size={16}
            color="#FFFFFF"
          />

          <Text style={styles.retryText}>
            Try Again
          </Text>

        </Pressable>

      ) : null}

    </View>
  );
}



const styles = StyleSheet.create({

  container: {
    alignItems: 'center',
    justifyContent: 'center',

    paddingHorizontal: 28,
    paddingVertical: 34,
  },

  iconBox: {
    width: 55,
    height: 55,

    borderRadius: 18,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: Colors.roseMist,

    marginBottom: 12,
  },

  title: {
    color: Colors.textPrimary,

    fontSize: 15,
    fontWeight: '800',

    textAlign: 'center',
  },

  message: {
    color: Colors.textSecondary,

    fontSize: 11,
    lineHeight: 16,

    textAlign: 'center',

    marginTop: 5,

    maxWidth: 260,
  },

  loadingText: {
    color: Colors.textSecondary,

    fontSize: 11,
    fontWeight: '600',

    marginTop: 10,
  },

  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',

    gap: 6,

    backgroundColor: Colors.primary,

    paddingHorizontal: 16,
    paddingVertical: 9,

    borderRadius: 12,

    marginTop: 15,
  },

  retryText: {
    color: '#FFFFFF',

    fontSize: 11,
    fontWeight: '800',
  },

});