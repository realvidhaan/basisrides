import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { AuthStackParamList } from '@/types';
import { Button } from '@/components/ui/Button';

type WelcomeNavigationProp = StackNavigationProp<AuthStackParamList, 'Welcome'>;

interface Props {
  navigation: WelcomeNavigationProp;
}

export function WelcomeScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.inner}>
        <Image
          source={require('../../assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="BasisRides"
        />
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
    backgroundColor: '#FFFFFF',
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 27,
  },
  logo: {
    width: 240,
    height: 80,
    marginBottom: 56,
  },
  buttons: {
    width: '100%',
    gap: 16,
  },
});
