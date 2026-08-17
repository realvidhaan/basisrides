interface SpacingTokens {
  space1: number;
  space2: number;
  space3: number;
  space4: number;
  space5: number;
  space6: number;
  space7: number;
  space8: number;
  canvasWidth: number;
  canvasHeight: number;
  padScreen: number;
  gapField: number;
  gapSection: number;
  radiusInput: number;
  radiusButton: number;
  radiusChip: number;
  radiusBanner: number;
  radiusCard: number;
  transitionFast: number;
}

export const spacing: SpacingTokens = require('./spacing.js');
export type SpacingToken = keyof SpacingTokens;
