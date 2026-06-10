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

export type MainTabParamList = {
  ScheduleTab: undefined;
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

// The five carpool weekdays and the per-day role a parent can choose.
export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri';
export type DayRole = 'off' | 'ride' | 'drive';

// A single day of the signed-in parent's recurring weekly schedule.
export interface MyScheduleDay {
  day: WeekdayKey;
  role: DayRole;
  dismissalTime: string | null; // 'HH:MM' (local clock time), or null when Off
}

// One person within an automatically-formed carpool group.
export interface CarpoolMember {
  userId: string;
  name: string;
  time: string | null; // Postgres TIME string, e.g. '15:15:00'
}

// One driver + the riders auto-assigned to them for a weekday.
export interface CarpoolGroup {
  driver: CarpoolMember;
  riders: CarpoolMember[];
  zone: string | null;
}

// Everything the schedule view needs for a single weekday.
export interface DayCarpool {
  groups: CarpoolGroup[];
  unmatchedRiders: CarpoolMember[];
}
