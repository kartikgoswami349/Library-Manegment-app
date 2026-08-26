import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { Colors } from '../../constants/theme';


export default function UserLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,

        tabBarHideOnKeyboard: true,

        tabBarStyle: {
          position: 'absolute',

          left: 14,
          right: 14,
          bottom: Platform.OS === 'ios' ? 18 : 12,

          height: 66,

          paddingTop: 7,
          paddingBottom: 7,

          backgroundColor: Colors.surface,

          borderTopWidth: 0,

          borderRadius: 22,

          elevation: 12,

          shadowColor: '#000',
          shadowOffset: {
            width: 0,
            height: 4,
          },
          shadowOpacity: 0.08,
          shadowRadius: 10,
        },

        tabBarItemStyle: {
          borderRadius: 16,
          marginHorizontal: 3,
        },

        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: '700',
          marginTop: 1,
        },
      }}
    >

      {/* HOME */}

      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',

          tabBarIcon: ({
            color,
            focused,
          }) => (
            <Ionicons
              name={
                focused
                  ? 'home'
                  : 'home-outline'
              }
              size={21}
              color={color}
            />
          ),
        }}
      />


      {/* MY BOOKS */}

      <Tabs.Screen
        name="my-borrowings"
        options={{
          title: 'My Books',

          tabBarIcon: ({
            color,
            focused,
          }) => (
            <Ionicons
              name={
                focused
                  ? 'book'
                  : 'book-outline'
              }
              size={21}
              color={color}
            />
          ),
        }}
      />


      {/* PROFILE */}

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',

          tabBarIcon: ({
            color,
            focused,
          }) => (
            <Ionicons
              name={
                focused
                  ? 'person'
                  : 'person-outline'
              }
              size={21}
              color={color}
            />
          ),
        }}
      />

    </Tabs>
  );
}