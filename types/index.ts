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
  DayDetail: { date: string };
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

// A row from the `rides` table enriched with the joined driver/rider info the
// schedule UI renders. driverName/driverCapacity describe the day's driver;
// riderName is the passenger on this specific row (used by the riders list);
// driverNeighborhood is shown on the day-detail driver card.
export interface RideWithDriver {
  id: string;
  driver_id: string;
  rider_id: string;
  date: string;
  status: string;
  created_at: string;
  driverName: string;
  driverCapacity: number;
  driverNeighborhood: string;
  riderName: string;
}

// Everything the schedule needs for a single weekday, keyed by ISO date.
export interface DayData {
  date: string;
  driver: RideWithDriver | null; // the self-row (driver_id === rider_id), enriched
  riders: RideWithDriver[]; // rows where rider_id !== driver_id
  seatsAvailable: number;
}
