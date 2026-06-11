import './global.css';

import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { getRecovering, subscribeRecovering } from '@/lib/authFlow';
import { WelcomeScreen } from '@/screens/auth/WelcomeScreen';
import { LoginScreen } from '@/screens/auth/LoginScreen';
import { SignupScreen } from '@/screens/auth/SignupScreen';
import { ForgotPasswordScreen } from '@/screens/auth/ForgotPasswordScreen';
import { OTPVerificationScreen } from '@/screens/auth/OTPVerificationScreen';
import { ResetPasswordScreen } from '@/screens/auth/ResetPasswordScreen';
import { PasswordChangedScreen } from '@/screens/auth/PasswordChangedScreen';
import { ScheduleScreen } from '@/screens/ScheduleScreen';
import { EditScheduleScreen } from '@/screens/EditScheduleScreen';
import { LiveTripScreen } from '@/screens/LiveTripScreen';
import { NotificationsScreen } from '@/screens/NotificationsScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { InviteScreen } from '@/screens/profile/InviteScreen';
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
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <AuthStack.Screen name="OTPVerification" component={OTPVerificationScreen} />
      <AuthStack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      <AuthStack.Screen name="PasswordChanged" component={PasswordChangedScreen} />
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
    </ScheduleStack.Navigator>
  );
}

function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="Profile" component={ProfileScreen} />
      <ProfileStack.Screen name="Invite" component={InviteScreen} />
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

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [recovering, setRecovering] = useState(getRecovering());

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setInitializing(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    const unsubscribeRecovering = subscribeRecovering(setRecovering);

    return () => {
      subscription.unsubscribe();
      unsubscribeRecovering();
    };
  }, []);

  if (initializing) return null;

  // During a password-recovery flow a session exists, but we must stay in the
  // auth stack so the user can finish resetting their password.
  const showMain = session !== null && !recovering;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <NavigationContainer>
          {showMain ? <MainNavigator /> : <AuthNavigator />}
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
