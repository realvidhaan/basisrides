export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
};

export type MainStackParamList = {
  Home: undefined;
};

export type Grade =
  | '5th'
  | '6th'
  | '7th'
  | '8th'
  | '9th'
  | '10th'
  | '11th'
  | '12th';

export const GRADES: Grade[] = [
  '5th',
  '6th',
  '7th',
  '8th',
  '9th',
  '10th',
  '11th',
  '12th',
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
