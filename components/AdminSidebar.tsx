import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  SafeAreaInsetsContext,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useSegments, type Href } from 'expo-router';

import { Colors } from '../constants/theme';

type NavigationItem = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: Href;
  route: string;
};

const WORKSPACE_ITEMS: NavigationItem[] = [
  { label: 'Dashboard', icon: 'grid-outline', href: '/(admin)', route: 'index' },
  { label: 'Manage Books', icon: 'book-outline', href: '/(admin)/books', route: 'books' },
  {
    label: 'Borrowings',
    icon: 'time-outline',
    href: '/(admin)/borrowings',
    route: 'borrowings',
  },
  {
    label: 'Issue Book',
    icon: 'book-outline',
    href: '/(admin)/issue-book',
    route: 'issue-book',
  },
  {
    label: 'Receive Book',
    icon: 'return-down-back-outline',
    href: '/(admin)/receive-book',
    route: 'receive-book',
  },
  {
    label: 'Subscribers',
    icon: 'people-outline',
    href: '/(admin)/subscribers',
    route: 'subscribers',
  },
];

const MANAGEMENT_ITEMS: NavigationItem[] = [
  {
    label: 'Device Sync',
    icon: 'sync-outline',
    href: '/(admin)/sync',
    route: 'sync',
  },
  {
    label: 'Admin Accounts',
    icon: 'person-circle-outline',
    href: '/(admin)/admins',
    route: 'admins',
  },
];

function routeForSegment(segment: string | undefined): string {
  if (!segment || segment === 'index') return 'index';
  if (segment === 'add-book' || segment === 'edit-book') return 'books';
  if (segment === 'add-subscriber' || segment === 'subscriber') return 'subscribers';
  return segment;
}

function SidebarContent({
  activeRoute,
  onNavigate,
}: {
  activeRoute: string;
  onNavigate: () => void;
}) {
  function renderItems(items: NavigationItem[]) {
    return items.map((item) => {
      const active = activeRoute === item.route;
      return (
        <Pressable
          key={item.route}
          accessibilityRole="button"
          accessibilityState={{ selected: active }}
          onPress={() => {
            router.push(item.href);
            onNavigate();
          }}
          style={({ pressed }) => [
            styles.navigationItem,
            active && styles.navigationItemActive,
            pressed && styles.navigationItemPressed,
          ]}
        >
          <Ionicons
            name={item.icon}
            size={18}
            color={active ? Colors.primaryDark : Colors.textSecondary}
          />
          <Text style={[styles.navigationLabel, active && styles.navigationLabelActive]}>
            {item.label}
          </Text>
        </Pressable>
      );
    });
  }

  return (
    <SafeAreaView style={styles.sidebar} edges={['top', 'bottom', 'left']}>
      <View style={styles.brand}>
        <Image
          source={require('../assets/images/ashram-library-brand.png')}
          style={styles.brandHeader}
          resizeMode="contain"
          accessibilityLabel="Shri Siddhdata Ashram Library Management System"
        />
      </View>

      <ScrollView
        style={styles.navigation}
        contentContainerStyle={styles.navigationContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>WORKSPACE</Text>
        {renderItems(WORKSPACE_ITEMS)}
        <Text style={[styles.sectionLabel, styles.managementLabel]}>MANAGEMENT</Text>
        {renderItems(MANAGEMENT_ITEMS)}
      </ScrollView>

      <View style={styles.sidebarFooter}>
        <View style={styles.footerStatus} />
        <Text style={styles.footerText}>Local library · Device data</Text>
      </View>
    </SafeAreaView>
  );
}

export default function AdminSidebarLayout() {
  const segments = useSegments();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const activeRoute = routeForSegment(segments[1]);
  const desktop = Platform.OS === 'web' && width >= 960;
  const drawerWidth = Math.min(width * 0.84, 280);
  const drawerTranslateX = useRef(new Animated.Value(-drawerWidth)).current;
  const edgeSwipeResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          !desktop &&
          !drawerOpen &&
          gesture.dx > 12 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25,
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx >= 48) setDrawerOpen(true);
        },
      }),
    [desktop, drawerOpen]
  );

  useEffect(() => {
    if (drawerOpen) {
      drawerTranslateX.setValue(-drawerWidth);
      Animated.spring(drawerTranslateX, {
        toValue: 0,
        damping: 24,
        stiffness: 220,
        mass: 0.8,
        useNativeDriver: true,
      }).start();
    } else {
      drawerTranslateX.setValue(-drawerWidth);
    }
  }, [drawerOpen, drawerTranslateX, drawerWidth]);

  const activeLabel =
    [...WORKSPACE_ITEMS, ...MANAGEMENT_ITEMS].find(
      (item) => item.route === activeRoute
    )?.label ?? 'Library';

  return (
    <View style={[styles.shell, !desktop && styles.mobileShell]}>
      {desktop ? (
        <View style={styles.desktopSidebar}>
          <SidebarContent activeRoute={activeRoute} onNavigate={() => undefined} />
        </View>
      ) : (
        <SafeAreaView style={styles.mobileHeader} edges={['top']}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open navigation menu"
            onPress={() => setDrawerOpen(true)}
            style={styles.menuButton}
          >
            <Ionicons name="menu-outline" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text numberOfLines={1} style={styles.mobileTitle}>
            {activeLabel}
          </Text>
          <View style={styles.headerSpacer} />
        </SafeAreaView>
      )}

      <View style={styles.screen}>
        <SafeAreaInsetsContext.Provider
          value={{ ...insets, top: desktop ? insets.top : 0 }}
        >
          <Stack screenOptions={{ headerShown: false }} />
        </SafeAreaInsetsContext.Provider>
      </View>

      {!desktop && !drawerOpen && (
        <View
          {...edgeSwipeResponder.panHandlers}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.edgeSwipeZone}
        />
      )}

      <Modal
        visible={drawerOpen && !desktop}
        transparent
        animationType="none"
        onRequestClose={() => setDrawerOpen(false)}
      >
        <View style={styles.drawerOverlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close navigation menu"
            style={styles.drawerBackdrop}
            onPress={() => setDrawerOpen(false)}
          />
          <Animated.View
            style={[
              styles.drawerPanel,
              {
                width: drawerWidth,
                transform: [{ translateX: drawerTranslateX }],
              },
            ]}
          >
            <SidebarContent
              activeRoute={activeRoute}
              onNavigate={() => setDrawerOpen(false)}
            />
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.background,
  },
  mobileShell: {
    flexDirection: 'column',
  },
  desktopSidebar: {
    width: 252,
    flexShrink: 0,
    backgroundColor: Colors.surface,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  sidebar: {
    flex: 1,
    backgroundColor: Colors.surface,
    paddingHorizontal: 14,
  },
  brand: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: 18,
  },
  brandHeader: {
    width: '108%',
    height: 132,
  },
  navigation: {
    flex: 1,
  },
  navigationContent: {
    paddingBottom: 16,
  },
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginHorizontal: 9,
    marginBottom: 8,
  },
  managementLabel: {
    marginTop: 24,
  },
  navigationItem: {
    minHeight: 46,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 11,
    marginBottom: 4,
  },
  navigationItemActive: {
    backgroundColor: Colors.roseMist,
  },
  navigationItemPressed: {
    opacity: 0.75,
  },
  navigationLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  navigationLabelActive: {
    color: Colors.primaryDark,
    fontWeight: '800',
  },
  sidebarFooter: {
    minHeight: 54,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerStatus: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  footerText: {
    color: Colors.textSecondary,
    fontSize: 10,
  },
  screen: {
    flex: 1,
    minWidth: 0,
  },
  edgeSwipeZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 26,
    zIndex: 3,
  },
  mobileHeader: {
    minHeight: 44,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  menuButton: {
    width: 40,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  mobileTitle: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 40,
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(32, 20, 26, 0.38)',
  },
  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  drawerPanel: {
    maxWidth: '84%',
    height: '100%',
    backgroundColor: Colors.surface,
  },
});
