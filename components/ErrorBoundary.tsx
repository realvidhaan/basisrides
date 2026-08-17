import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { colors } from '@/constants/theme/colors';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time crashes anywhere below it and shows a readable fallback
 * instead of a blank white screen, so a single bad screen can never silently
 * kill the whole app. "Try again" clears the error and re-renders.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  // Render-time crashes caught here are NOT "uncaught" errors, so Sentry's global
  // handler never sees them — report explicitly or we'd be blind to the exact
  // crashes this boundary exists to catch.
  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>🚧</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            The app hit an unexpected error. You can try again — your account and
            schedule are safe.
          </Text>
          <TouchableOpacity style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceWhite,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emoji: { fontSize: 44, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  message: {
    fontSize: 14,
    color: colors.inkSecondary,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: colors.brandTeal,
    borderRadius: 10,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  buttonText: { color: colors.surfaceWhite, fontSize: 15, fontWeight: '700' },
});
