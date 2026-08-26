import React, {
    useEffect,
    useRef,
} from 'react';

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

      /*
        Keep splash visible long enough
        for the animation to finish.
      */

      const minimumSplashTime =
        new Promise<void>((resolve) => {

          setTimeout(
            () => resolve(),
            2800
          );

        });



      /*
        Check existing login session.
      */

      const {
        data: {
          session,
        },
        error: sessionError,
      } =
        await supabase.auth.getSession();


      if (sessionError) {

        console.log(
          'Session error:',
          sessionError
        );

        await minimumSplashTime;

        router.replace(
          '/(auth)/login'
        );

        return;
      }



      /*
        User is not logged in.
      */

      if (!session?.user) {

        await minimumSplashTime;

        router.replace(
          '/(auth)/login'
        );

        return;
      }



      /*
        User is logged in.
        Get their role.
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


      if (
        profileError ||
        !profile
      ) {

        console.log(
          'Profile error:',
          profileError
        );

        await supabase.auth.signOut();

        await minimumSplashTime;

        router.replace(
          '/(auth)/login'
        );

        return;
      }



      /*
        Disabled accounts cannot
        continue using the app.
      */

      if (
        profile.is_enabled === false
      ) {

        await supabase.auth.signOut();

        await minimumSplashTime;

        router.replace(
          '/(auth)/login'
        );

        return;
      }



      const role =
        profile.role
          ?.trim()
          .toLowerCase();



      /*
        Allow animation to finish before
        navigating away.
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



      /*
        Unknown role.
      */

      await supabase.auth.signOut();

      router.replace(
        '/(auth)/login'
      );


    } catch (error) {

      console.log(
        'Splash routing error:',
        error
      );

      router.replace(
        '/(auth)/login'
      );

    }

  }



  return (

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

  );

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