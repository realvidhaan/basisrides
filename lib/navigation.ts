import { createNavigationContainerRef } from '@react-navigation/native';
import type { MainTabParamList } from '@/types';

/**
 * App-wide navigation ref so non-React code (e.g. a push-notification tap
 * handler) can navigate without prop-drilling a navigation object.
 */
export const navigationRef = createNavigationContainerRef<MainTabParamList>();
