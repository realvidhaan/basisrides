import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
  OTPVerification: { email: string; flow: 'reset' | 'signup' };
  ResetPassword: { email: string };
  PasswordChanged: undefined;
};

// Main app navigation (after authentication).
// Schedule tab is a nested stack; Profile tab is standalone.
export type ScheduleStackParamList = {
  Schedule: undefined;
  EditSchedule: undefined;
};

// Stack inside the Messages tab.
export type MessagesStackParamList = {
  MessagesList: undefined;
  Conversation: { conversationId: string; title: string };
};

export type MainTabParamList = {
  ScheduleTab: NavigatorScreenParams<ScheduleStackParamList>;
  MessagesTab: NavigatorScreenParams<MessagesStackParamList>;
  ProfileTab: undefined;
};

export type Grade =
  | '6th'
  | '7th'
  | '8th'
  | '9th'
  | '10th'
  | '11th'
  | '12th';

export const GRADES: Grade[] = [
  '6th',
  '7th',
  '8th',
  '9th',
  '10th',
  '11th',
  '12th',
];

// Silicon Valley cities served by the BISV carpool community.
export const NEIGHBORHOODS: string[] = [
  'San Jose',
  'Santa Clara',
  'Sunnyvale',
  'Cupertino',
  'Mountain View',
  'Palo Alto',
  'Los Altos',
  'Los Gatos',
  'Saratoga',
  'Campbell',
  'Milpitas',
  'Fremont',
  'Newark',
  'Union City',
  'Morgan Hill',
  'Menlo Park',
];

export interface UserProfile {
  id: string;
  full_name: string;
  child_name: string;
  grade: Grade;
  neighborhood: string;
  car_capacity: number;
  email: string;
  created_at: string;
  updated_at: string;
}

export interface SignupFormValues {
  fullName: string;
  childName: string;
  grade: Grade;
  neighborhood: string;
  carCapacity: string;
  email: string;
  password: string;
  confirmPassword: string;
}

// The five carpool weekdays.
export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri';

// A single day of the signed-in parent's recurring weekly schedule. Parents
// only choose whether they participate + their pickup time; the system decides
// drive vs ride by fair rotation.
export interface MyScheduleDay {
  day: WeekdayKey;
  participating: boolean;
  dismissalTime: string | null; // 'HH:MM' (local clock time), or null when Off
  canDrive: boolean; // willing to drive this weekday (only the rotation decides who actually drives)
}

// What a single calendar cell should display.
export interface DayWidget {
  kind: 'drive' | 'ride' | 'unmatched' | 'off' | 'blocked';
  time: string | null; // 'HH:MM' for drive/ride
  label: string | null; // e.g. "Winter Break", "Summer", "Early dismissal"
}

// ---- Messaging (Day 6) ----

export interface Conversation {
  id: string;
  type: 'dm' | 'group';
  ride_date: string | null;
  title: string | null;
  created_at: string;
}

export interface ConversationParticipant {
  conversation_id: string;
  user_id: string;
  last_read_at: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

// A conversation row decorated for the list screen.
export interface ConversationPreview {
  conversation: Conversation;
  participants: { id: string; name: string }[];
  lastMessage: Message | null;
  unreadCount: number;
}
