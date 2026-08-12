import './global.css';

import * as Sentry from '@sentry/react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { navigationRef } from '@/lib/navigation';
import { usePushRegistration } from '@/hooks/usePushRegistration';
import '@/lib/locationTask'; // registers the background location task at launch
import '@/lib/geofenceTask'; // registers the trip geofencing task at launch
import { ErrorBoundary } from '@/components/ErrorBoundary';
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
        tabBarActiveTintColor: '#DC143C',
        tabBarInactiveTintColor: '#8391A1',
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

  // Register push + tap-to-navigate only once the user is in the main app.
  usePushRegistration(showMain ? (session?.user.id ?? null) : null);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ErrorBoundary>
          {initializing ? (
            // Reading the persisted session off storage is async. Render the
            // app's own background + brand spinner instead of nothing, so cold
            // start doesn't show a bare white frame. Deliberately JS-only —
            // expo-splash-screen would mean a native rebuild.
            <View style={styles.splash}>
              <ActivityIndicator color="#DC143C" size="large" />
            </View>
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
    backgroundColor: '#FFFFFF',
  },
});

// Sentry.wrap enables automatic performance tracing and touch/profiling hooks
// on the root component.
export default Sentry.wrap(App);
