import React from 'react';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import {
  CAR_GLASS,
  carColor,
  carType,
  type CarTypeKey,
} from '@/lib/carOptions';

interface Props {
  colorKey: string | null | undefined;
  type: string | null | undefined;
  /** Rendered width in px; height keeps the 200×116 aspect ratio. */
  size?: number;
}

// Per-body-type greenhouse (cabin) + glass + door-split, drawn on the shared
// lower body. Authored against the 200×116 viewBox; the car faces right.
const CABINS: Record<
  CarTypeKey,
  { cabin: string; glass: string; pillars: number[] }
> = {
  sedan: {
    cabin: 'M58,59 L78,40 Q81,37 87,37 L118,37 Q125,37 130,43 L150,59 Z',
    glass: 'M66,57 L82,44 L116,44 L128,57 Z',
    pillars: [98],
  },
  suv: {
    cabin: 'M54,59 L66,34 Q68,31 75,31 L140,31 Q150,31 152,40 L160,59 Z',
    glass: 'M62,57 L74,38 L140,38 L149,57 Z',
    pillars: [105],
  },
  minivan: {
    cabin: 'M50,59 L60,33 Q62,30 70,30 L162,30 Q170,30 170,41 L170,59 Z',
    glass: 'M58,57 L69,37 L161,37 L165,57 Z',
    pillars: [90, 128],
  },
};

/**
 * A clean, modern side-profile car. The body color comes from the shared
 * palette (with light/base/dark shades for a 3D sheen) and the silhouette
 * changes with the body type, so a "blue minivan" looks the same wherever it
 * appears. Purely presentational — no state, safe to render in lists.
 */
export function CarIllustration({ colorKey, type, size = 96 }: Props) {
  const c = carColor(colorKey);
  const t = carType(type);
  const { cabin, glass, pillars } = CABINS[t];
  const height = (size * 116) / 200;
  const gradId = `body-${c.key}-${t}`;

  return (
    <Svg width={size} height={height} viewBox="0 0 200 116">
      <Defs>
        <LinearGradient
          id={gradId}
          x1="0"
          y1="28"
          x2="0"
          y2="94"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor={c.light} />
          <Stop offset="0.5" stopColor={c.base} />
          <Stop offset="1" stopColor={c.dark} />
        </LinearGradient>
      </Defs>

      {/* Ground shadow */}
      <Ellipse cx="100" cy="104" rx="84" ry="7" fill="rgba(0,0,0,0.10)" />

      {/* Wheels (drawn first so the body tucks over their top halves) */}
      <Circle cx="54" cy="90" r="16" fill="#20242B" />
      <Circle cx="146" cy="90" r="16" fill="#20242B" />
      <Circle cx="54" cy="90" r="8" fill="#D7DBE0" />
      <Circle cx="146" cy="90" r="8" fill="#D7DBE0" />
      <Circle cx="54" cy="90" r="2.6" fill="#9AA0A8" />
      <Circle cx="146" cy="90" r="2.6" fill="#9AA0A8" />

      {/* Cabin (greenhouse) + lower body share the same gradient = one volume */}
      <Path d={cabin} fill={`url(#${gradId})`} />
      <Path
        d="M16,90 L16,72 Q16,60 30,59 L170,59 Q186,60 186,73 L186,90 Z"
        fill={`url(#${gradId})`}
      />

      {/* Glass */}
      <Path d={glass} fill={CAR_GLASS} />
      {pillars.map((x) => (
        <Rect key={x} x={x} y="38" width="3" height="20" fill={c.base} />
      ))}

      {/* Door seam + handle for a touch of detail */}
      <Line x1="100" y1="62" x2="100" y2="86" stroke={c.dark} strokeWidth="1" opacity="0.45" />
      <Rect x="106" y="69" width="9" height="2.4" rx="1.2" fill={c.dark} opacity="0.5" />

      {/* Lights (front faces right) */}
      <Rect x="178" y="66" width="6" height="6" rx="2" fill="#FFF4C2" />
      <Rect x="18" y="67" width="5" height="6" rx="2" fill="#C0303A" />
    </Svg>
  );
}
