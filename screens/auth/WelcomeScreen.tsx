import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { AuthStackParamList } from '@/types';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/brand/Logo';
import { colors } from '@/constants/theme/colors';

type WelcomeNavigationProp = StackNavigationProp<AuthStackParamList, 'Welcome'>;

interface Props {
  navigation: WelcomeNavigationProp;
}

export function WelcomeScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.inner}>
        <View style={styles.logo}>
          <Logo size="welcome" />
        </View>
        <View style={styles.buttons}>
          <Button title="Login" onPress={() => navigation.navigate('Login')} />
          <Button
            title="Register"
            variant="outline"
            onPress={() => navigation.navigate('Signup')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceWhite,
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 27,
  },
  logo: {
    marginBottom: 56,
  },
  buttons: {
    width: '100%',
    gap: 16,
  },
});
