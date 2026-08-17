import './global.css';

import * as Sentry from '@sentry/react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';
import { useFonts } from 'expo-font';
import { Sora_600SemiBold, Sora_700Bold, Sora_800ExtraBold } from '@expo-google-fonts/sora';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

import { supabase } from '@/lib/supabase';
import { navigationRef } from '@/lib/navigation';
import { usePushRegistration } from '@/hooks/usePushRegistration';
import '@/lib/locationTask'; // registers the background location task at launch
import '@/lib/geofenceTask'; // registers the trip geofencing task at launch
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Logo } from '@/components/brand/Logo';
import { colors } from '@/constants/theme/colors';
import { WelcomeScreen } from '@/screens/auth/WelcomeScreen';
import { LoginScreen } from '@/screens/auth/LoginScreen';
import { SignupScreen } from '@/screens/auth/SignupScreen';
import { ScheduleScreen } from '@/screens/ScheduleScreen';
import { EditScheduleScreen } from '@/screens/EditScheduleScreen';
import { LiveTripScreen } from '@/screens/LiveTripScreen';
import { NotificationsScreen } from '@/screens/NotificationsScreen';
import { SwapsScreen } from '@/screens/SwapsScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { EditProfileScreen } from '@/screens/profile/EditProfileScreen';
import { MessagesListScreen } from '@/screens/messages/MessagesListScreen';
import { ConversationScreen } from '@/screens/messages/ConversationScreen';
import type {
  AuthStackParamList,
  ScheduleStackParamList,
  MessagesStackParamList,
  ProfileStackParamList,
  MainTabParamList,
} from '@/types';

const AuthStack = createStackNavigator<AuthStackParamList>();
const ScheduleStack = createStackNavigator<ScheduleStackParamList>();
const MessagesStack = createStackNavigator<MessagesStackParamList>();
const ProfileStack = createStackNavigator<ProfileStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator
      initialRouteName="Welcome"
      screenOptions={{ headerShown: false }}
    >
      <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
    </AuthStack.Navigator>
  );
}

function ScheduleStackNavigator() {
  return (
    <ScheduleStack.Navigator screenOptions={{ headerShown: false }}>
      <ScheduleStack.Screen name="Schedule" component={ScheduleScreen} />
      <ScheduleStack.Screen name="EditSchedule" component={EditScheduleScreen} />
      <ScheduleStack.Screen name="LiveTrip" component={LiveTripScreen} />
      <ScheduleStack.Screen name="Notifications" component={NotificationsScreen} />
      <ScheduleStack.Screen name="Swaps" component={SwapsScreen} />
    </ScheduleStack.Navigator>
  );
}

function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="Profile" component={ProfileScreen} />
      <ProfileStack.Screen name="EditProfile" component={EditProfileScreen} />
    </ProfileStack.Navigator>
  );
}

function MessagesStackNavigator() {
  return (
    <MessagesStack.Navigator screenOptions={{ headerShown: false }}>
      <MessagesStack.Screen name="MessagesList" component={MessagesListScreen} />
      <MessagesStack.Screen name="Conversation" component={ConversationScreen} />
    </MessagesStack.Navigator>
  );
}

function MainNavigator() {
  return (
    <MainTab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.brandTeal,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIcon: ({ focused, color, size }) => {
          let name: keyof typeof Ionicons.glyphMap;
          if (route.name === 'ScheduleTab') {
            name = focused ? 'calendar' : 'calendar-outline';
          } else if (route.name === 'MessagesTab') {
            name = focused ? 'chatbubble' : 'chatbubble-outline';
          } else {
            name = focused ? 'person' : 'person-outline';
          }
          return <Ionicons name={name} size={size} color={color} />;
        },
      })}
    >
      <MainTab.Screen
        name="ScheduleTab"
        component={ScheduleStackNavigator}
        options={{ title: 'Schedule' }}
      />
      <MainTab.Screen
        name="MessagesTab"
        component={MessagesStackNavigator}
        options={{ title: 'Messages' }}
      />
      <MainTab.Screen
        name="ProfileTab"
        component={ProfileStackNavigator}
        options={{ title: 'Profile' }}
      />
    </MainTab.Navigator>
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [fontsLoaded, fontError] = useFonts({
    Sora_600SemiBold,
    Sora_700Bold,
    Sora_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => {
        setSession(s);
        setInitializing(false);
      })
      .catch((e) => {
        Sentry.captureException(e);
        setInitializing(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const showMain = session !== null;
  // Font load failure falls back to the system font rather than blocking the
  // app — nothing here may strand the user on the splash screen.
  const stillLoading = initializing || (!fontsLoaded && !fontError);

  // Register push + tap-to-navigate only once the user is in the main app.
  usePushRegistration(showMain ? (session?.user.id ?? null) : null);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ErrorBoundary>
          {stillLoading ? (
            // Reading the persisted session off storage is async, and fonts load
            // async too, so this is the literal first frame of every launch. It
            // is WelcomeScreen with the buttons not yet arrived: same safe area,
            // same 27pt gutter, same lockup at the same size and the same 56pt
            // gap beneath it, so the logo does not move when the real screen
            // mounts — the app resolves into place instead of cutting to it.
            // Purely declarative and JS-only: nothing here gates or delays the
            // transition, and expo-splash-screen would have meant a native
            // rebuild.
            <SafeAreaView style={styles.splash}>
              <StatusBar style="dark" />
              <View style={styles.splashLogo}>
                <Logo size="welcome" />
              </View>
              <View style={styles.splashSlot}>
                <ActivityIndicator
                  color={colors.brandTeal}
                  size="small"
                  accessibilityLabel="Restoring your session"
                />
              </View>
            </SafeAreaView>
          ) : (
            <NavigationContainer ref={navigationRef}>
              {showMain ? <MainNavigator /> : <AuthNavigator />}
            </NavigationContainer>
          )}
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 27,
    backgroundColor: colors.surfaceWhite,
  },
  splashLogo: { marginBottom: 56 },
  // Exactly the height of WelcomeScreen's two 52pt buttons plus the 16pt gap
  // between them. The spinner waits in the slot the buttons are about to take,
  // which is what keeps the lockup from shifting on the handoff.
  splashSlot: { height: 120, justifyContent: 'center' },
});

// Sentry.wrap enables automatic performance tracing and touch/profiling hooks
// on the root component.
export default Sentry.wrap(App);
