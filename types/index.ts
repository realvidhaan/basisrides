export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
  OTPVerification: { email: string; flow: 'reset' | 'signup' };
  ResetPassword: { email: string };
  PasswordChanged: undefined;
};

export type MainStackParamList = {
  Home: undefined;
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
