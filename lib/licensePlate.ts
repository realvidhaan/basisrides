/**
 * Structural U.S. license-plate validation.
 *
 * Unlike the address flow (which checks a plate against an authoritative
 * geocoder), license plates have no machine-readable registry: every state has
 * many simultaneously-valid formats on the road — the current sequential series,
 * older legal series, and 1–N character vanity/personalized plates. So we do NOT
 * try to encode each state's sequential pattern (that would false-reject real
 * vanity and legacy plates). Instead we enforce STRUCTURAL bounds only:
 *   - characters: letters and numbers, with single spaces or hyphens as
 *     separators (e.g. "7ABC123", "MOM VAN", "K8-LYN")
 *   - length: 1 .. the state's max alphanumeric count
 * This catches typos and junk ("AB!@#$", a 12-char string) while letting any
 * genuine plate through.
 */

export interface USState {
  code: string;
  name: string;
}

/** All 50 states + D.C., used to populate the state picker. */
export const US_STATES: USState[] = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];

const STATE_BY_CODE: Record<string, USState> = Object.fromEntries(
  US_STATES.map((s) => [s.code, s]),
);

const PLATE_MIN = 1;
// Standard cap across virtually all U.S. passenger + vanity plates. A couple of
// states issue 8-character vanity plates; list those here to widen the bound for
// them (kept lenient on purpose — over-widening only lets a longer typo through,
// under-widening blocks a real plate).
const DEFAULT_MAX = 7;
const PLATE_MAX: Record<string, number> = {
  // none beyond the default today; override per state as needed, e.g. NV: 8
};

export function plateMaxFor(stateCode: string): number {
  return PLATE_MAX[stateCode] ?? DEFAULT_MAX;
}

/**
 * Normalize as the user types: uppercase and collapse internal whitespace.
 * Keeps a trailing space the user just typed from being eaten mid-entry by only
 * trimming the start.
 */
export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, ' ').replace(/^\s+/, '');
}

/** Count only the alphanumeric characters (separators don't count toward length). */
function alnumLength(value: string): number {
  return (value.toUpperCase().match(/[A-Z0-9]/g) ?? []).length;
}

export interface PlateCheck {
  ok: boolean;
  message?: string;
}

/**
 * Validate a plate against a state's structural rules. Returns ok=false with a
 * human-readable message describing the first failure, so the caller can show it
 * inline and in a banner.
 */
export function validatePlate(stateCode: string, plate: string): PlateCheck {
  const value = plate.trim();
  if (!stateCode || !STATE_BY_CODE[stateCode]) {
    return { ok: false, message: 'Select your plate’s state first.' };
  }
  if (!value) {
    return { ok: false, message: 'Add your plate so riders can confirm the right car.' };
  }
  // Must start and end alphanumeric, with single spaces/hyphens as separators.
  if (!/^[A-Z0-9]+(?:[ -][A-Z0-9]+)*$/.test(value.toUpperCase())) {
    return { ok: false, message: 'Letters and numbers only.' };
  }
  const len = alnumLength(value);
  const max = plateMaxFor(stateCode);
  if (len < PLATE_MIN || len > max) {
    return {
      ok: false,
      message: `${STATE_BY_CODE[stateCode].name} plates are ${PLATE_MIN}–${max} characters.`,
    };
  }
  return { ok: true };
}
