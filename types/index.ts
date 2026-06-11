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
export type ScheduleStackParamList = {
  Schedule: undefined;
  EditSchedule: undefined;
  LiveTrip: { date: string }; // ISO 'YYYY-MM-DD' of the carpool day
  Notifications: undefined;
  Swaps: undefined;
};

// Stack inside the Messages tab.
export type MessagesStackParamList = {
  MessagesList: undefined;
  Conversation: { conversationId: string; title: string };
};

// Stack inside the Profile tab.
export type ProfileStackParamList = {
  Profile: undefined;
  EditProfile: undefined;
  Invite: undefined;
};

export type MainTabParamList = {
  ScheduleTab: NavigatorScreenParams<ScheduleStackParamList>;
  MessagesTab: NavigatorScreenParams<MessagesStackParamList>;
  ProfileTab: NavigatorScreenParams<ProfileStackParamList>;
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
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  car_color: string | null;
  car_type: string | null;
  car_model: string | null;
  license_plate: string | null;
  created_at: string;
  updated_at: string;
}

export interface SignupFormValues {
  fullName: string;
  childName: string;
  grade: Grade;
  neighborhood: string;
  address: string;
  carCapacity: string;
  carColor: string;
  carType: string;
  carModel: string;
  licensePlate: string;
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

// ---- Live trips, notifications, invites (Day 7) ----

export type TripStatus = 'on_my_way' | 'arrived' | 'completed' | 'cancelled';

export interface Trip {
  id: string;
  driver_id: string;
  ride_date: string;
  rider_ids: string[];
  status: TripStatus;
  started_at: string;
  updated_at: string;
}

export interface TripPickup {
  trip_id: string;
  rider_id: string;
  picked_up_at: string;
}

// A point on the map (driver home, rider home, or school).
export interface GeoPoint {
  lat: number;
  lng: number;
}

// A drop-off marker rendered on the live map.
export interface MapStop {
  id: string;
  name: string;
  point: GeoPoint;
  kind: 'school' | 'driver' | 'rider';
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: string; // 'message' | 'trip' | 'pickup' | 'invite' | ...
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export interface Invite {
  code: string;
  inviter_id: string;
  created_at: string;
  accepted_by: string | null;
  accepted_at: string | null;
}
