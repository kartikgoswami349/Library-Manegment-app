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
import { supabase } from '../../lib/supabase';


export default function AdminDashboard() {

  const [recentActivity, setRecentActivity] =
  useState<RecentActivity[]>([]);

  useFocusEffect(
  useCallback(() => {

    loadStats();
    loadRecentActivity();

  }, [])
);

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

const [statsLoading, setStatsLoading] =
  useState(true);

  useEffect(() => {
  loadStats();
}, []);


async function loadStats() {

  try {

    setStatsLoading(true);

    const result =
      await getDashboardStats();

    setStats(result);

  } catch (error) {

    console.log(
      'Dashboard stats error:',
      error
    );

  } finally {

    setStatsLoading(false);

  }

}

  const [adminName, setAdminName] =
    useState('Admin');


  useEffect(() => {
    loadAdmin();
  }, []);


  async function loadAdmin() {

    try {

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      if (data?.full_name) {
        setAdminName(data.full_name);
      }

    } catch (error) {

      console.log(
        'Admin profile error:',
        error
      );

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

            await supabase.auth.signOut();

            router.replace(
              '/(auth)/login'
            );

          },
        },
      ]
    );

  }


  return (

    <SafeAreaView style={styles.safeArea}>

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

        <View style={styles.welcomeSection}>

          <Text style={styles.welcomeLabel}>
            Welcome back,
          </Text>

          <Text
            style={styles.adminName}
            numberOfLines={1}
          >
            {adminName}
          </Text>

          <Text style={styles.welcomeDescription}>
            Manage books, subscribers and
            library activity from one place.
          </Text>

        </View>

        {/* LIBRARY OVERVIEW */}

<Text style={styles.sectionTitle}>
  Ashram Library Overview
</Text>

<View style={styles.statsRow}>

  <View style={styles.statBox}>
    <Text style={styles.statValue}>
      {stats.total_books}
    </Text>

    <Text style={styles.statLabel}>
      Total Books
    </Text>
  </View>


  <View style={styles.statBox}>
    <Text style={styles.statValue}>
      {stats.available_books}
    </Text>

    <Text style={styles.statLabel}>
      Available
    </Text>
  </View>


  <View style={styles.statBox}>
    <Text style={styles.statValue}>
      {stats.issued_books}
    </Text>

    <Text style={styles.statLabel}>
      Issued
    </Text>
  </View>

</View>


<View style={styles.statsRow}>

  <View style={styles.statBox}>
    <Text style={styles.statValue}>
      {stats.catalog_titles}
    </Text>

    <Text style={styles.statLabel}>
      Titles
    </Text>
  </View>


  <View style={styles.statBox}>
    <Text style={styles.statValue}>
      {stats.total_subscribers}
    </Text>

    <Text style={styles.statLabel}>
      Subscribers
    </Text>
  </View>


  <View style={styles.statBox}>
    <Text
      style={[
        styles.statValue,
        stats.overdue_books > 0 && {
          color: Colors.danger,
        },
      ]}
    >
      {stats.overdue_books}
    </Text>

    <Text style={styles.statLabel}>
      Overdue
    </Text>
  </View>

</View>



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
            color={Colors.primary}
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



const styles = StyleSheet.create({

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

statValue: {
  color: Colors.primaryDark,

  fontSize: 20,
  fontWeight: '800',
},

statLabel: {
  color: Colors.textSecondary,

  fontSize: 8,
  fontWeight: '700',

  marginTop: 3,
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


  welcomeLabel: {
    color: Colors.textSecondary,

    fontSize: 12,
  },


  adminName: {
    color: Colors.textPrimary,

    fontSize: 27,
    fontWeight: '800',

    marginTop: 2,
  },


  welcomeDescription: {
    color: Colors.textSecondary,

    fontSize: 12,
    lineHeight: 17,

    marginTop: 6,

    maxWidth: 310,
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
