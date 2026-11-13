import {
    useCallback,
    useEffect,
    useState,
} from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    DashboardStats,
    RecentActivity,
    getDashboardStats,
    getRecentActivity
} from '../../services/dashboard';

import {
    Alert,
    Image,
    Pressable,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import {
    router,
    useFocusEffect,
} from 'expo-router';

import { Colors } from '../../constants/theme';
import { getMyProfile } from '../../services/account';
import { signOutLocal } from '../../lib/local-auth';
import { RefreshStatusBar } from '../../components/RefreshStatusBar';


export default function AdminDashboard() {
  const isDesktop = Platform.OS === 'web';

  const [recentActivity, setRecentActivity] =
  useState<RecentActivity[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadStats();
      loadRecentActivity();
    }, [])
  );


async function loadRecentActivity() {

  try {

    const result =
      await getRecentActivity();

    setRecentActivity(result);

  } catch (error) {

    console.log(
      'Recent activity error:',
      error
    );

  }

}


  const [stats, setStats] =
  useState<DashboardStats>({
    total_books: 0,
    available_books: 0,
    issued_books: 0,
    catalog_titles: 0,
    total_subscribers: 0,
    enabled_subscribers: 0,
    overdue_books: 0,
    total_admins: 0,
  });

async function loadStats() {

  try {

    const result =
      await getDashboardStats();

    setStats(result);

  } catch (error) {

    console.log(
      'Dashboard stats error:',
      error
    );

  }

}

function openDashboardMetric(label: string) {
  switch (label) {
    case 'Total Books':
    case 'Available':
      router.push('/(admin)/books');
      break;
    case 'Issued':
    case 'Overdue': {
      const filter = label.toLowerCase();
      router.push(`/(admin)/borrowings?filter=${filter}`);
      break;
    }
    case 'Titles':
      router.push('/catalog');
      break;
    case 'Subscribers':
      router.push('/(admin)/subscribers');
      break;
  }
}

  const [adminName, setAdminName] =
    useState('Admin');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState(false);


  useEffect(() => {
    loadAdmin();
  }, []);


  async function loadAdmin() {

    try {

      const profile = await getMyProfile();
      if (profile?.full_name || profile?.username) {
        setAdminName(profile.full_name || profile.username);
      }

    } catch (error) {

      console.log(
        'Admin profile error:',
        error
      );

    }

  }

  async function refreshDashboard() {
    if (refreshing) {
      return;
    }
    setRefreshing(true);
    setRefreshMessage(null);
    setRefreshError(false);
    try {
      await Promise.all([loadStats(), loadRecentActivity(), loadAdmin()]);
      setRefreshMessage('Dashboard data refreshed.');
    } catch (error) {
      setRefreshMessage(error instanceof Error ? error.message : 'Unable to refresh dashboard.');
      setRefreshError(true);
    } finally {
      setRefreshing(false);
    }
  }


  function logout() {

    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',

          onPress: async () => {

            await signOutLocal();

            router.replace(
              '/(auth)/login'
            );

          },
        },
      ]
    );

  }


  return (

    <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >


        {/* HEADER */}

        <View style={styles.header}>

          <View style={styles.brandArea}>

            <Image
              source={require(
                '../../assets/images/library-logo.png'
              )}
              style={styles.logo}
              resizeMode="contain"
            />


            <View style={styles.headerText}>

              <Text style={styles.headerTitle}>
                Admin Dashboard
              </Text>

              <Text style={styles.headerSubtitle}>
                Ashram Library Management
              </Text>

            </View>

          </View>

          {isDesktop && (
            <RefreshStatusBar
              onRefresh={() => void refreshDashboard()}
              refreshing={refreshing}
              message={refreshMessage}
              error={refreshError}
            />
          )}

          <Pressable
            onPress={logout}
            style={({ pressed }) => [
              styles.logoutButton,
              pressed &&
                styles.buttonPressed,
            ]}
          >

            <Ionicons
              name="log-out-outline"
              size={22}
              color={Colors.primaryDark}
            />

          </Pressable>

        </View>



        {/* WELCOME */}

        <View
          style={[
            styles.welcomeCard,
            !isDesktop && styles.mobileWelcomeCard,
          ]}
        >
            <View style={styles.welcomeContent}>
              <Text style={styles.welcomeLabel}>
                Welcome back,
              </Text>
              <Text
                style={[
                  styles.adminName,
                  !isDesktop && styles.mobileAdminName,
                ]}
                numberOfLines={1}
              >
                {adminName} 👋
              </Text>
              <Text
                style={[
                  styles.welcomeDescription,
                  !isDesktop && styles.mobileWelcomeDescription,
                ]}
              >
                Manage books, subscribers and library activity from one place.
              </Text>
            </View>

            <View
              style={[
                styles.templeArea,
                !isDesktop && styles.mobileTempleArea,
              ]}
            >
              <Image
                source={require('../../assets/images/welcome-temple.png')}
                style={[
                  styles.templeImage,
                  !isDesktop && styles.mobileTempleImage,
                ]}
                resizeMode="contain"
              />
            </View>
        </View>

        {/* LIBRARY OVERVIEW */}

<Text style={styles.sectionTitle}>
  Ashram Library Overview
</Text>

{isDesktop ? (
  <View style={styles.statsGrid}>
    <DashboardMetric icon="library-outline" value={stats.total_books} label="Total Books" onPress={openDashboardMetric} />
    <DashboardMetric icon="bookmark-outline" value={stats.available_books} label="Available" onPress={openDashboardMetric} />
    <DashboardMetric icon="time-outline" value={stats.issued_books} label="Issued" onPress={openDashboardMetric} />
    <DashboardMetric icon="book-outline" value={stats.catalog_titles} label="Titles" onPress={openDashboardMetric} />
    <DashboardMetric icon="people-outline" value={stats.total_subscribers} label="Subscribers" onPress={openDashboardMetric} />
    <DashboardMetric
      icon="warning-outline"
      value={stats.overdue_books}
      label="Overdue"
      danger={stats.overdue_books > 0}
      onPress={openDashboardMetric}
    />
  </View>
) : (
  <>
    <View style={styles.statsRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Total Books: ${stats.total_books}`}
        accessibilityHint="Opens book management"
        onPress={() => openDashboardMetric('Total Books')}
        style={({ pressed }) => [styles.statBox, pressed && styles.cardPressed]}
      >
        <Text style={styles.statValue}>{stats.total_books}</Text>
        <Text style={styles.statLabel} numberOfLines={2}>
          Total Books
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Available: ${stats.available_books}`}
        accessibilityHint="Opens book management"
        onPress={() => openDashboardMetric('Available')}
        style={({ pressed }) => [styles.statBox, pressed && styles.cardPressed]}
      >
        <Text style={styles.statValue}>{stats.available_books}</Text>
        <Text style={styles.statLabel}>Available</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Issued: ${stats.issued_books}`}
        accessibilityHint="Opens borrowing history"
        onPress={() => openDashboardMetric('Issued')}
        style={({ pressed }) => [styles.statBox, pressed && styles.cardPressed]}
      >
        <Text style={styles.statValue}>{stats.issued_books}</Text>
        <Text style={styles.statLabel}>Issued</Text>
      </Pressable>
    </View>
    <View style={styles.statsRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Titles: ${stats.catalog_titles}`}
        accessibilityHint="Opens the library catalog"
        onPress={() => openDashboardMetric('Titles')}
        style={({ pressed }) => [styles.statBox, pressed && styles.cardPressed]}
      >
        <Text style={styles.statValue}>{stats.catalog_titles}</Text>
        <Text style={styles.statLabel}>Titles</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Subscribers: ${stats.total_subscribers}`}
        accessibilityHint="Opens subscriber management"
        onPress={() => openDashboardMetric('Subscribers')}
        style={({ pressed }) => [styles.statBox, pressed && styles.cardPressed]}
      >
        <Text style={styles.statValue}>{stats.total_subscribers}</Text>
        <Text style={styles.statLabel}>Subscribers</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Overdue: ${stats.overdue_books}`}
        accessibilityHint="Opens borrowing history"
        onPress={() => openDashboardMetric('Overdue')}
        style={({ pressed }) => [styles.statBox, pressed && styles.cardPressed]}
      >
        <Text
          style={[
            styles.statValue,
            stats.overdue_books > 0 && { color: Colors.danger },
          ]}
        >
          {stats.overdue_books}
        </Text>
        <Text style={styles.statLabel}>Overdue</Text>
      </Pressable>
    </View>
  </>
)}



        {/* CATALOG */}

        <Pressable
          onPress={() =>
            router.push('/catalog')
          }
          style={({ pressed }) => [
            styles.catalogCard,
            pressed &&
              styles.cardPressed,
          ]}
        >

          <View style={styles.catalogIcon}>

            <Ionicons
              name="library-outline"
              size={27}
              color={Colors.primaryDark}
            />

          </View>


          <View style={styles.catalogContent}>

            <Text style={styles.catalogTitle}>
              Library Catalog
            </Text>

            <Text style={styles.catalogSubtitle}>
              Browse the complete collection
            </Text>

          </View>


          <Ionicons
            name="chevron-forward"
            size={21}
            color={isDesktop ? Colors.surface : Colors.primary}
            style={isDesktop ? styles.catalogArrow : undefined}
          />

        </Pressable>



        {/* MANAGEMENT */}

        <Text style={styles.sectionTitle}>
          Book Management
        </Text>


        <View style={styles.row}>

          <DashboardCard
            icon="add-circle-outline"
            title="Add Book"
            subtitle="New entry"
            onPress={() =>
              router.push(
                '/(admin)/add-book'
              )
            }
          />

          <DashboardCard
            icon="create-outline"
            title="Books"
            subtitle="Search & edit"
            onPress={() =>
              router.push(
                '/(admin)/books'
              )
            }
          />

        </View>



        {/* CIRCULATION */}

        <Text style={styles.sectionTitle}>
          Circulation
        </Text>


        <View style={styles.row}>

          <DashboardCard
            icon="arrow-up-circle-outline"
            title="Issue Book"
            subtitle="Lend a book"
            onPress={() =>
              router.push(
                '/(admin)/issue-book'
              )
            }
          />

          <DashboardCard
            icon="arrow-down-circle-outline"
            title="Receive"
            subtitle="Return a book"
            onPress={() =>
              router.push(
                '/(admin)/receive-book'
              )
            }
          />

        </View>



        {/* PEOPLE & RECORDS */}

        <Text style={styles.sectionTitle}>
          People & Records
        </Text>


        <View style={styles.row}>

          <DashboardCard
            icon="people-outline"
            title="Subscribers"
            subtitle="Manage users"
            onPress={() =>
              router.push(
                '/(admin)/subscribers'
              )
            }
          />

          <DashboardCard
            icon="time-outline"
            title="History"
            subtitle="Borrowing records"
            onPress={() =>
              router.push(
                '/(admin)/borrowings'
              )
            }
          />

        </View>

        {/* RECENT ACTIVITY */}

<View style={styles.activityHeader}>

  <Text style={styles.sectionTitle}>
    Recent Activity
  </Text>

  <Pressable
    onPress={() =>
      router.push('/(admin)/borrowings')
    }
  >
    <Text style={styles.viewAllText}>
      View All
    </Text>
  </Pressable>

</View>


<View style={styles.activityCard}>

  {recentActivity.length === 0 ? (

    <Text style={styles.noActivityText}>
      No recent activity yet.
    </Text>

  ) : (

    recentActivity.map(
      (item, index) => (

        <View
          key={`${item.action_type}-${item.action_at}-${index}`}
          style={[
            styles.activityRow,

            index ===
              recentActivity.length - 1 &&
              styles.lastActivityRow,
          ]}
        >

          <View
            style={[
              styles.activityIcon,

              item.action_type === 'returned'
                ? styles.returnedActivityIcon
                : styles.issuedActivityIcon,
            ]}
          >

            <Ionicons
              name={
                item.action_type === 'returned'
                  ? 'arrow-down-outline'
                  : 'arrow-up-outline'
              }
              size={16}
              color={
                item.action_type === 'returned'
                  ? Colors.success
                  : Colors.primaryDark
              }
            />

          </View>


          <View style={styles.activityContent}>

            <Text
              style={styles.activityTitle}
              numberOfLines={1}
            >
              {item.title}
            </Text>

            <Text style={styles.activityDescription}>
              {item.action_type === 'returned'
                ? 'Returned by'
                : 'Issued to'}{' '}
              {item.subscriber_name || 'Subscriber'}
            </Text>

            <Text style={styles.activitySerial}>
              #{item.serial_number}
            </Text>

          </View>


          <Text style={styles.activityDate}>
            {new Date(
              item.action_at
            ).toLocaleDateString(
              'en-IN',
              {
                day: '2-digit',
                month: 'short',
              }
            )}
          </Text>

        </View>

      )
    )

  )}

</View>



        {/* ADMIN MANAGEMENT */}

        <Pressable
          onPress={() =>
            router.push(
              '/(admin)/admins'
            )
          }
          style={({ pressed }) => [
            styles.adminCard,
            pressed &&
              styles.cardPressed,
          ]}
        >

          <View style={styles.adminIcon}>

            <Ionicons
              name="shield-checkmark-outline"
              size={24}
              color={Colors.primaryDark}
            />

          </View>


          <View style={styles.adminContent}>

            <Text style={styles.adminCardTitle}>
              Admin Management
            </Text>

            <Text style={styles.adminCardSubtitle}>
              Manage administrator accounts
            </Text>

          </View>


          <Ionicons
            name="chevron-forward"
            size={20}
            color={Colors.primary}
          />

        </Pressable>



        <Text style={styles.footer}>
          Digital Library Management System
        </Text>

        {isDesktop ? (
          <>
            <Text style={styles.sectionTitle}>
              Device Sync
            </Text>
            <View style={styles.row}>
              <DashboardCard
                icon="sync-outline"
                title="LAN Sync"
                subtitle="Sync offline changes"
                onPress={() => router.push('/(admin)/sync')}
              />
            </View>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/(admin)/sync')}
            style={({ pressed }) => [
              styles.mobileSyncShortcut,
              pressed && styles.cardPressed,
            ]}
          >
            <View style={styles.mobileSyncIcon}>
              <Ionicons
                name="sync-outline"
                size={24}
                color={Colors.primaryDark}
              />
            </View>
            <View style={styles.mobileSyncText}>
              <Text style={styles.mobileSyncTitle}>LAN Sync</Text>
              <Text style={styles.mobileSyncSubtitle}>
                Sync this library with nearby devices
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={Colors.primaryDark}
            />
          </Pressable>
        )}

      </ScrollView>

    </SafeAreaView>

  );

}



function DashboardCard({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {

  return (

    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.dashboardCard,
        pressed &&
          styles.cardPressed,
      ]}
    >

      <View style={styles.cardIcon}>

        <Ionicons
          name={icon}
          size={25}
          color={Colors.primaryDark}
        />

      </View>


      <Text
        style={styles.cardTitle}
        numberOfLines={1}
      >
        {title}
      </Text>

      <Text
        style={styles.cardSubtitle}
        numberOfLines={2}
      >
        {subtitle}
      </Text>


      <View style={styles.smallArrow}>

        <Ionicons
          name="arrow-forward"
          size={15}
          color={Colors.primary}
        />

      </View>

    </Pressable>

    

  );

}

function DashboardMetric({
  icon,
  value,
  label,
  danger = false,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  label: string;
  danger?: boolean;
  onPress: (label: string) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityHint={`Opens ${label === 'Titles' ? 'the library catalog' : label === 'Subscribers' ? 'subscriber management' : label === 'Issued' || label === 'Overdue' ? 'borrowing history' : 'book management'}`}
      onPress={() => onPress(label)}
      style={({ pressed }) => [styles.statBox, pressed && styles.cardPressed]}
    >
      <View style={styles.statIcon}>
        <Ionicons name={icon} size={23} color={danger ? Colors.danger : Colors.primaryDark} />
      </View>
      <View style={styles.statText}>
        <Text style={[styles.statValue, danger && styles.dangerValue]}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Ionicons
        name="ellipsis-vertical"
        size={18}
        color={Colors.secondary}
        style={styles.statDots}
      />
    </Pressable>
  );
}


const styles = StyleSheet.create({

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },

  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },

  statBox: {
    flex: 1,
    minHeight: 67,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 15,
    paddingVertical: 9,
  },

statIcon: {
  alignItems: 'center',
  backgroundColor: '#FFE6EF',
  borderRadius: 25,
  height: 50,
  justifyContent: 'center',
  width: 50,
},

statText: {
  flex: 1,
  marginLeft: 12,
},

statValue: {
  color: Colors.primaryDark,
  fontSize: 21,
  fontWeight: '800',
},

dangerValue: {
  color: Colors.danger,
},

statLabel: {
  color: Colors.textSecondary,
  fontSize: 11,
  fontWeight: '700',
  marginTop: 3,
},

statDots: {
  color: Colors.secondary,
  position: 'absolute',
  right: 9,
  top: 8,
},

  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },


  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },


  /* HEADER */

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',

    marginBottom: 18,
  },


  brandArea: {
    flexDirection: 'row',
    alignItems: 'center',

    flex: 1,
  },


  logo: {
    width: 58,
    height: 58,

    marginRight: 9,
  },


  headerText: {
    flex: 1,
  },


  headerTitle: {
    color: Colors.primaryDark,

    fontSize: 21,
    fontWeight: '800',
  },


  headerSubtitle: {
    color: Colors.textSecondary,

    fontSize: 11,

    marginTop: 2,
  },


  logoutButton: {
    width: 42,
    height: 42,

    borderRadius: 21,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: Colors.surface,

    borderWidth: 1,
    borderColor: Colors.border,

    marginLeft: 8,
  },


  buttonPressed: {
    opacity: 0.7,
  },


  /* WELCOME */

  welcomeSection: {
    marginBottom: 19,
  },

  welcomeCard: {
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Colors.roseMist,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 18,
    overflow: 'hidden',
  },

  mobileWelcomeCard: {
    minHeight: 96,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.roseMist,
    borderColor: Colors.border,
  },

  mobileAdminName: {
    fontSize: 20,
  },

  mobileWelcomeDescription: {
    fontSize: 10,
    lineHeight: 14,
    marginTop: 3,
  },

  welcomeContent: {
    flex: 1,
    zIndex: 2,
  },


  welcomeLabel: {
    color: Colors.textSecondary,

    fontSize: 12,
  },

  nativeWelcomeLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
  },

  adminName: {
    color: Colors.textPrimary,

    fontSize: 24,
    fontWeight: '800',

    marginTop: 1,
  },

  nativeAdminName: {
    color: Colors.textPrimary,
    fontSize: 27,
    fontWeight: '800',
    marginTop: 2,
  },

  welcomeDescription: {
    color: Colors.textSecondary,

    fontSize: 11,
    lineHeight: 16,

    marginTop: 4,

    maxWidth: 310,
  },

  nativeWelcomeDescription: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  templeArea: {
    width: 275,
    height: 118,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },

  mobileTempleArea: {
    width: 132,
    height: 72,
    marginRight: -8,
  },

  templeImage: {
    width: 275,
    height: 118,
    opacity: 0.32,
  },

  mobileTempleImage: {
    width: 150,
    height: 72,
    opacity: 0.32,
  },

  /* CATALOG */

  catalogCard: {
    flexDirection: 'row',
    alignItems: 'center',

    backgroundColor: Colors.primary,

    paddingHorizontal: 14,
    paddingVertical: 14,

    borderRadius: 20,

    marginBottom: 22,

    elevation: 3,

    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },

  catalogArrow: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 8,
  },


  catalogIcon: {
    width: 49,
    height: 49,

    borderRadius: 16,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: '#FFFFFF',
  },


  catalogContent: {
    flex: 1,

    marginLeft: 13,
  },


  catalogTitle: {
    color: '#FFFFFF',

    fontSize: 16,
    fontWeight: '800',
  },


  catalogSubtitle: {
    color: '#FFEAF0',

    fontSize: 11,

    marginTop: 3,
  },


  /* SECTIONS */

  sectionTitle: {
    color: Colors.textPrimary,

    fontSize: 15,
    fontWeight: '800',

    marginBottom: 10,
  },


  row: {
    flexDirection: 'row',

    gap: 10,

    marginBottom: 20,
  },


  dashboardCard: {
    flex: 1,

    minHeight: 132,

    backgroundColor: Colors.surface,

    borderRadius: 19,

    padding: 13,

    borderWidth: 1,
    borderColor: Colors.border,

    position: 'relative',

    elevation: 1,

    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 7,
  },

  mobileSyncShortcut: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
    minHeight: 76,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  mobileSyncIcon: {
    alignItems: 'center',
    backgroundColor: Colors.roseMist,
    borderRadius: 13,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  mobileSyncText: {
    flex: 1,
    gap: 3,
  },
  mobileSyncTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  mobileSyncSubtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
  },

  cardPressed: {
    opacity: 0.82,

    transform: [
      {
        scale: 0.985,
      },
    ],
  },


  cardIcon: {
    width: 43,
    height: 43,

    borderRadius: 14,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: Colors.roseMist,

    marginBottom: 10,
  },


  cardTitle: {
    color: Colors.textPrimary,

    fontSize: 14,
    fontWeight: '800',
  },
  activityHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',

  marginTop: 2,
},

viewAllText: {
  color: Colors.primary,
  fontSize: 10,
  fontWeight: '800',
},

activityCard: {
  backgroundColor: Colors.surface,

  borderRadius: 19,

  borderWidth: 1,
  borderColor: Colors.border,

  paddingHorizontal: 12,

  marginBottom: 20,
},

activityRow: {
  minHeight: 65,

  flexDirection: 'row',
  alignItems: 'center',

  borderBottomWidth: 1,
  borderBottomColor: Colors.border,
},

lastActivityRow: {
  borderBottomWidth: 0,
},

activityIcon: {
  width: 37,
  height: 37,

  borderRadius: 12,

  alignItems: 'center',
  justifyContent: 'center',
},

issuedActivityIcon: {
  backgroundColor: Colors.softAccent,
},

returnedActivityIcon: {
  backgroundColor: '#EAF6EF',
},

activityContent: {
  flex: 1,
  marginLeft: 10,
},

activityTitle: {
  color: Colors.textPrimary,
  fontSize: 11,
  fontWeight: '800',
},

activityDescription: {
  color: Colors.textSecondary,
  fontSize: 8,
  marginTop: 2,
},

activitySerial: {
  color: Colors.primaryDark,
  fontSize: 8,
  fontWeight: '700',
  marginTop: 2,
},

activityDate: {
  color: Colors.textSecondary,
  fontSize: 8,
  marginLeft: 8,
},

noActivityText: {
  color: Colors.textSecondary,
  fontSize: 10,
  textAlign: 'center',
  paddingVertical: 22,
},


  cardSubtitle: {
    color: Colors.textSecondary,

    fontSize: 10,
    lineHeight: 14,

    marginTop: 3,

    paddingRight: 18,
  },


  smallArrow: {
    position: 'absolute',

    right: 11,
    bottom: 11,

    width: 25,
    height: 25,

    borderRadius: 13,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: Colors.softAccent,
  },


  /* ADMIN MANAGEMENT */

  adminCard: {
    flexDirection: 'row',
    alignItems: 'center',

    backgroundColor: Colors.surface,

    padding: 13,

    borderRadius: 19,

    borderWidth: 1,
    borderColor: Colors.border,
  },


  adminIcon: {
    width: 45,
    height: 45,

    borderRadius: 14,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: Colors.softAccent,
  },


  adminContent: {
    flex: 1,

    marginLeft: 12,
  },


  adminCardTitle: {
    color: Colors.textPrimary,

    fontSize: 14,
    fontWeight: '800',
  },


  adminCardSubtitle: {
    color: Colors.textSecondary,

    fontSize: 10,

    marginTop: 3,
  },


  footer: {
    color: Colors.textSecondary,

    fontSize: 9,

    textAlign: 'center',

    marginTop: 24,
  },

  

});
