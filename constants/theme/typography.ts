interface TypographyTokens {
  fontHeading: string;
  fontHeadingSemibold: string;
  fontHeadingExtrabold: string;
  fontBody: string;
  fontBodyMedium: string;
  fontBodySemibold: string;
  fontBodyBold: string;
  fsDisplay: number;
  fsHeadingXl: number;
  fsHeadingLg: number;
  fsBody: number;
  fsBodySm: number;
  fsCaption: number;
  fsButton: number;
  lhHeading: number;
  lhBody: number;
  lsHeading: number;
}

export const typography: TypographyTokens = require('./typography.js');
export type TypographyToken = keyof TypographyTokens;
