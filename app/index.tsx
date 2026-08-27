import React, {
    useEffect,
    useRef,
} from 'react';
import {
    clearUserAccess,
    getUserAccess,
    saveUserAccess,
} from '../lib/user-cache';

import {
    Animated,
    Easing,
    StyleSheet,
    View
} from 'react-native';

import { router } from 'expo-router';

import { supabase } from '../lib/supabase';


export default function SplashScreen() {

  const logoOpacity =
    useRef(new Animated.Value(0)).current;

  const logoScale =
    useRef(new Animated.Value(0.9)).current;

  const textOpacity =
    useRef(new Animated.Value(0)).current;

  const textTranslateY =
    useRef(new Animated.Value(12)).current;


  useEffect(() => {

    startAnimation();

    checkSession();

  }, []);



  function startAnimation() {

    Animated.sequence([

      Animated.parallel([

        Animated.timing(
          logoOpacity,
          {
            toValue: 1,
            duration: 1200,

            easing:
              Easing.out(Easing.ease),

            useNativeDriver: true,
          }
        ),

        Animated.timing(
          logoScale,
          {
            toValue: 1,
            duration: 1200,

            easing:
              Easing.out(Easing.ease),

            useNativeDriver: true,
          }
        ),

      ]),


      Animated.parallel([

        Animated.timing(
          textOpacity,
          {
            toValue: 1,
            duration: 1000,

            easing:
              Easing.out(Easing.ease),

            useNativeDriver: true,
          }
        ),

        Animated.timing(
          textTranslateY,
          {
            toValue: 0,
            duration: 1000,

            easing:
              Easing.out(Easing.ease),

            useNativeDriver: true,
          }
        ),

      ]),

    ]).start();

  }


async function checkSession() {
  try {

    const minimumSplashTime =
      new Promise<void>((resolve) => {
        setTimeout(resolve, 2800);
      });


    /*
      Get the locally persisted Supabase session.
      This can still work when the phone is offline.
    */

    const {
      data: { session },
      error: sessionError,
    } =
      await supabase.auth.getSession();


    /*
      No saved login session at all.
    */

    if (
      sessionError ||
      !session?.user
    ) {

      await minimumSplashTime;

      router.replace(
        '/(auth)/login'
      );

      return;
    }


    let role:
      | 'admin'
      | 'subscriber'
      | null = null;

    let isEnabled = true;


    /*
      First try to get fresh account information
      from Supabase.
    */

    const {
      data: profile,
      error: profileError,
    } =
      await supabase
        .from('profiles')
        .select(
          'role, is_enabled'
        )
        .eq(
          'id',
          session.user.id
        )
        .single();


    /*
      ONLINE:
      We successfully received the profile.
    */

    if (
      !profileError &&
      profile
    ) {

      const freshRole =
        profile.role
          ?.trim()
          .toLowerCase();


      if (
        freshRole === 'admin' ||
        freshRole === 'subscriber'
      ) {

        role = freshRole;

        isEnabled =
          profile.is_enabled !== false;


        /*
          Save successful account information
          so it can be used offline later.
        */

        saveUserAccess({
          role: freshRole,
          is_enabled: isEnabled,
        });

      }

    }


    /*
      OFFLINE:
      Profile request failed, so use the
      last successfully cached role.
    */

    else {

      console.log(
        'Profile unavailable. Using offline cache.',
        profileError
      );


      const cached =
        getUserAccess();


      if (cached) {

        role =
          cached.role;

        isEnabled =
          cached.is_enabled;

      }

    }


    /*
      No role online and nothing cached.
    */

    if (!role) {

      await minimumSplashTime;

      router.replace(
        '/(auth)/login'
      );

      return;
    }


    /*
      Disabled account.
    */

    if (!isEnabled) {

      clearUserAccess();

      await supabase.auth.signOut();

      await minimumSplashTime;

      router.replace(
        '/(auth)/login'
      );

      return;
    }


    /*
      Let splash animation finish.
    */

    await minimumSplashTime;


    /*
      ADMIN
    */

    if (role === 'admin') {

      router.replace(
        '/(admin)'
      );

      return;
    }


    /*
      SUBSCRIBER
    */

    if (role === 'subscriber') {

      router.replace(
        '/(user)'
      );

      return;
    }


  } catch (error) {

    console.log(
      'Splash routing error:',
      error
    );


    /*
      Last offline fallback if something
      unexpected happened.
    */

    const cached =
      getUserAccess();


    if (
      cached?.is_enabled &&
      cached.role === 'admin'
    ) {

      router.replace(
        '/(admin)'
      );

      return;
    }


    if (
      cached?.is_enabled &&
      cached.role === 'subscriber'
    ) {

      router.replace(
        '/(user)'
      );

      return;
    }


    router.replace(
      '/(auth)/login'
    );

  }
}

    <View style={styles.container}>


      <Animated.Image
        source={require(
          '../assets/images/library-logo.png'
        )}
        resizeMode="contain"

        style={[
          styles.logo,

          {
            opacity:
              logoOpacity,

            transform: [
              {
                scale:
                  logoScale,
              },
            ],
          },
        ]}
      />


      <Animated.Text
        style={[
          styles.tagline,

          {
            opacity:
              textOpacity,

            transform: [
              {
                translateY:
                  textTranslateY,
              },
            ],
          },
        ]}
      >

        ज्ञान • भक्ति • अध्यात्म

      </Animated.Text>


    </View>

}



const styles =
StyleSheet.create({

  container: {
    flex: 1,

    backgroundColor:
      '#FFF7FA',

    alignItems:
      'center',

    justifyContent:
      'center',

    paddingHorizontal: 24,
  },


  logo: {
    width: 170,
    height: 170,

    marginBottom: 22,
  },


  tagline: {
    color: '#8E244D',

    fontSize: 20,
    fontWeight: '700',

    textAlign: 'center',

    letterSpacing: 0.5,
  },

});