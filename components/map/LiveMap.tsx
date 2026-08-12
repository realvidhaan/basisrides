import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import MapView, {
  AnimatedRegion,
  Marker,
  MarkerAnimated,
  Polyline,
  type Region,
} from 'react-native-maps';
import Svg, { Ellipse, Path, Rect } from 'react-native-svg';
import type { GeoPoint, MapStop } from '@/types';
import { carColor } from '@/lib/carOptions';
import { useLiveDriverLocation } from '@/hooks/useLiveDriverLocation';
import { DEMO_MODE, DEMO_TICK_MS } from '@/lib/demoMode';
import { DEMO_ROUTE, DEMO_STOPS } from '@/lib/demoRoute';
import { useDemoDriverLocation } from '@/hooks/useDemoDriverLocation';

// Route line treatment, mirroring how navigation maps draw a route: a wide
// casing underneath so the line stays legible over any map tile, then the route
// itself on top, at the ~1.6 casing-to-line ratio shipping nav SDKs use.
// Note the colouring is INVERTED from turn-by-turn convention, where the driven
// part is greyed and the road ahead carries the accent. This is a tracking view
// — a parent watching a car — so the driven part is the story, and it reads as
// a progress bar. The remaining line is therefore kept deliberately quiet: two
// saturated colours on one path is what looks amateurish.
const ROUTE_CASING = 'rgba(17,24,39,0.30)';
const ROUTE_REMAINING = '#A9B2C0';
const ROUTE_TRAVELLED = '#DC143C';
// On arrival the whole driven path flips to the app's success green, so the
// finished trip reads as complete rather than as a ride still in progress.
const ROUTE_ARRIVED = '#16A34A';
const CASING_WIDTH = 11;
const ROUTE_WIDTH = 7;

export interface LiveMapProps {
  channel: string; // Supabase broadcast channel to subscribe to for live GPS
  stops: MapStop[]; // school + rider/driver homes to pin
  start: { lat: number; lng: number } | null; // initial car position
  carColorKey?: string | null; // driver's chosen color; defaults to brand crimson
  destinations?: { lat: number; lng: number }[]; // keep car + these drop-offs framed live
  // Runs the DEMO_MODE drive. Deliberately NOT the trip's status: the demo is
  // armed by pressing "Start ride", so re-opening a trip that is already under
  // way does not replay the animation on its own.
  demoRun?: boolean;
  onDemoArrived?: () => void; // fires once when the DEMO_MODE drive completes
}

// BISV-area fallback so the map always has somewhere to open (matches the old
// Leaflet default) when a trip has no pins yet.
const FALLBACK: GeoPoint = { lat: 37.3197, lng: -121.912 };

const STOP_EMOJI: Record<string, string> = {
  school: '🏫',
  driver: '🏠',
  rider: '🏡',
};

/** Drop points that land on the same spot (~1e-6 degrees is well under a metre). */
function distinctPoints(points: GeoPoint[]): GeoPoint[] {
  const out: GeoPoint[] = [];
  for (const p of points) {
    const dupe = out.some(
      (q) => Math.abs(q.lat - p.lat) < 1e-6 && Math.abs(q.lng - p.lng) < 1e-6,
    );
    if (!dupe) out.push(p);
  }
  return out;
}

/** Frame a set of points with comfortable padding into a Region. */
function regionFor(points: GeoPoint[]): Region {
  if (points.length === 0) {
    return {
      latitude: FALLBACK.lat,
      longitude: FALLBACK.lng,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  }
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  const latPad = Math.max((maxLat - minLat) * 0.4, 0.01);
  const lngPad = Math.max((maxLng - minLng) * 0.4, 0.01);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: maxLat - minLat + latPad * 2,
    longitudeDelta: maxLng - minLng + lngPad * 2,
  };
}

/** Compact top-down car badge in the driver's color (parity with the old marker). */
function CarBadge({ colorKey }: { colorKey?: string | null }) {
  const col = carColor(colorKey || 'crimson');
  return (
    <Svg width={34} height={34} viewBox="0 0 44 44">
      {/* Soft contact shadow, then a white ring — the same two tricks Apple and
          Google use to lift the vehicle off a dark route line. */}
      <Ellipse cx={22} cy={40} rx={13} ry={3} fill="#000000" opacity={0.16} />
      <Rect x={8.5} y={3.5} width={27} height={37} rx={10.5} fill="#FFFFFF" opacity={0.95} />
      <Rect x={10} y={5} width={24} height={34} rx={9} fill={col.base} />
      <Rect x={13} y={15} width={18} height={13} rx={5} fill={col.dark} />
      <Path d="M12 14 C16 10 28 10 32 14 L30 17 C26 14.5 18 14.5 14 17 Z" fill="#EAF2FF" />
      <Path d="M14 30 C18 32.5 26 32.5 30 30 L32 33 C28 36 16 36 12 33 Z" fill="#EAF2FF" />
      <Rect x={12} y={6.5} width={4} height={3} rx={1.5} fill="#FFF3B0" />
      <Rect x={28} y={6.5} width={4} height={3} rx={1.5} fill="#FFF3B0" />
    </Svg>
  );
}

/**
 * Native live map: Apple Maps (iOS) / Google Maps (Android) via `react-native
 * -maps`, replacing the old Leaflet-in-WebView map. The car marker is driven by
 * `useLiveDriverLocation`, which subscribes to the same Supabase broadcast the
 * webview used to consume — identical behaviour, fully native rendering.
 */
export function LiveMap({
  channel,
  stops,
  start,
  carColorKey,
  destinations,
  demoRun,
  onDemoArrived,
}: LiveMapProps) {
  const mapRef = useRef<MapView | null>(null);

  const realLive = useLiveDriverLocation(channel);
  // Synthetic drive for demos. Both hooks are called unconditionally so hook
  // order never differs between builds; with DEMO_MODE folded to a literal
  // `false` at bundle time the demo hook creates no timer and returns idle.
  const demo = useDemoDriverLocation(DEMO_MODE && (demoRun ?? false));
  const live = DEMO_MODE ? (demo.payload ?? realLive) : realLive;
  const demoDriving = DEMO_MODE && demo.payload !== null;

  // In demo mode the pins come from the hardcoded route, not from the seeded
  // data — the test rows put the driver and rider at the same address, which
  // would stack every pin on one house.
  const pins = useMemo(
    () =>
      demoDriving
        ? DEMO_STOPS.map((s) => ({
            id: `demo-${s.index}`,
            name: s.name,
            kind: s.kind,
            point: DEMO_ROUTE[s.index],
          }))
        : stops,
    [demoDriving, stops],
  );

  const startPoint: GeoPoint = start ?? pins[0]?.point ?? FALLBACK;

  // Animated coordinate for the car, seeded at the driver's start position.
  const carCoord = useRef(
    new AnimatedRegion({
      latitude: startPoint.lat,
      longitude: startPoint.lng,
      latitudeDelta: 0,
      longitudeDelta: 0,
    }),
  ).current;

  const initialRegion = useMemo(
    () => regionFor(DEMO_MODE ? DEMO_ROUTE : [...pins.map((s) => s.point), startPoint]),
    // Only the trip's pins/start define the opening frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(pins), JSON.stringify(startPoint)],
  );

  // Frame school + homes (+ the driver's start) before any live fix arrives, so
  // a waiting rider sees the whole route — parity with the old Leaflet fitBounds.
  const fitStops = useCallback(() => {
    if (DEMO_MODE) {
      // Frame the whole drive and hold it. A follow-camera on a 10-second run
      // would be a blur; keeping the route in frame lets the line fill in.
      mapRef.current?.fitToCoordinates(
        DEMO_ROUTE.map((p) => ({ latitude: p.lat, longitude: p.lng })),
        { edgePadding: { top: 56, right: 56, bottom: 56, left: 56 }, animated: false },
      );
      return;
    }
    // Deduplicate FIRST. Before the members load, `stops` is just the school and
    // `startPoint` falls back to that same school pin — two identical points,
    // which slips past a naive length check and makes fitToCoordinates frame a
    // zero-area box, slamming the map to maximum zoom on one rooftop.
    const pts = distinctPoints([...pins.map((s) => s.point), startPoint]);
    if (pts.length === 0) return;
    if (pts.length === 1) {
      // regionFor already floors the padding, so this opens at a sane
      // neighbourhood zoom instead of street level.
      mapRef.current?.animateToRegion(regionFor(pts), 0);
      return;
    }
    mapRef.current?.fitToCoordinates(
      pts.map((p) => ({ latitude: p.lat, longitude: p.lng })),
      { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: false },
    );
  }, [pins, startPoint]);

  useEffect(() => {
    if (!live) fitStops();
  }, [fitStops, live]);

  // The driver's home arrives asynchronously, well after this component mounts,
  // but carCoord is seeded once via useRef — so without this the car sits on
  // whatever the fallback was (usually the school) for the rest of the trip.
  // Re-seed until a real fix lands; after that the live glide owns the marker.
  const hasLiveFixRef = useRef(false);
  useEffect(() => {
    if (live) hasLiveFixRef.current = true;
  }, [live]);
  useEffect(() => {
    if (hasLiveFixRef.current) return;
    carCoord.setValue({
      latitude: startPoint.lat,
      longitude: startPoint.lng,
      latitudeDelta: 0,
      longitudeDelta: 0,
    });
    // Scalars, not the object: `startPoint` is rebuilt on every render.
  }, [carCoord, startPoint.lat, startPoint.lng]);

  // A car badge with no known position is worse than no badge — before a fix or
  // a known start it would imply the driver is parked at the school.
  const showCar = live !== null || start !== null;

  // Glide the car to each new fix (parity with the old 1400ms ease) and keep the
  // car + drop-off destinations framed as the trip progresses.
  useEffect(() => {
    if (!live) return;
    const next = { latitude: live.lat, longitude: live.lng };
    // react-native-maps' AnimatedRegion.timing config type spuriously requires
    // `toValue`/deltas; the cast keeps the real (documented) call shape.
    carCoord
      .timing({
        latitude: live.lat,
        longitude: live.lng,
        latitudeDelta: 0,
        longitudeDelta: 0,
        // Exactly one tick's worth, so each glide finishes as the next fix
        // lands and the motion never stalls or lurches. Real fixes arrive far
        // apart, hence the long ease there.
        duration: demoDriving ? DEMO_TICK_MS : 1400,
        // LINEAR, deliberately. Animated.timing defaults to inOut(ease), which
        // at a 100ms tick is an accelerate-decelerate cycle ten times a second
        // — the car visibly shimmers even though its speed is constant. Real
        // navigation apps interpolate linearly between fixes.
        easing: demoDriving ? Easing.linear : Easing.inOut(Easing.ease),
        // Must stay false: AnimatedRegion is a composite bound to a
        // non-whitelisted object prop, and the native driver crashes on it.
        useNativeDriver: false,
      } as unknown as Parameters<AnimatedRegion['timing']>[0])
      .start();

    // The demo holds the whole route in frame; moving the camera at 10 fps
    // would fight the marker animation and read as juddering.
    if (demoDriving) return;

    const dests = destinations ?? [];
    if (dests.length > 0) {
      const frame = [{ lat: live.lat, lng: live.lng }, ...dests];
      mapRef.current?.fitToCoordinates(
        frame.map((p) => ({ latitude: p.lat, longitude: p.lng })),
        { edgePadding: { top: 70, right: 70, bottom: 70, left: 70 }, animated: true },
      );
    } else {
      mapRef.current?.animateCamera({ center: next }, { duration: 600 });
    }
    // Depend on destinations by VALUE, not identity: the parent recreates the
    // array each render, and keying on the array object would restart the 1400ms
    // car animation mid-glide on every unrelated re-render during a live trip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, carCoord, demoDriving, JSON.stringify(destinations ?? [])]);

  const routeLine = useMemo(
    () => DEMO_ROUTE.map((p) => ({ latitude: p.lat, longitude: p.lng })),
    [],
  );

  /**
   * The driven line is built from FIXED chunks, not from a growing slice.
   *
   * A single polyline that gains a point every tick hands react-native-maps a
   * new coordinates array 10x a second, and each one tears down and recreates
   * the native overlay — which is visible as a flicker. These chunks never
   * change, so revealing one more just mounts a new overlay and leaves every
   * existing one untouched. Throttling would only slow the flicker down; this
   * removes the cause.
   */
  const chunks = useMemo(() => {
    const SPAN = 8; // vertices per chunk — comfortably over iOS's 3-point floor
    const out: { coords: typeof routeLine; from: number; end: number }[] = [];
    for (let i = 0; i + 2 < routeLine.length; i += SPAN) {
      // +1 so each chunk shares a vertex with the next and the seams close up.
      const slice = routeLine.slice(i, Math.min(i + SPAN + 1, routeLine.length));
      out.push({ coords: slice, from: i, end: i + slice.length - 1 });
    }
    return out;
  }, [routeLine]);

  // "You have arrived": a ring that expands and fades out of the destination
  // pin, the same read as the pulse Maps apps use to call out a location.
  const pulse = useRef(new Animated.Value(0)).current;
  const [pulsing, setPulsing] = useState(false);
  // Held in a ref so the effect below does NOT depend on it. The parent passes
  // an inline arrow, so its identity changes every render — as a dependency it
  // would re-run the whole arrival effect on each one, re-firing the haptic and
  // restarting the rings for as long as the screen stayed open.
  const onArrivedRef = useRef(onDemoArrived);
  // Synced in an effect, and declared before the arrival effect so it commits
  // first — never written during render.
  useEffect(() => {
    onArrivedRef.current = onDemoArrived;
  }, [onDemoArrived]);

  useEffect(() => {
    if (!demo.arrived) return;
    setPulsing(true);
    onArrivedRef.current?.();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // Three rings, then stop. A permanent pulse reads as "loading", not
    // "arrived" — and it would keep the marker snapshotting forever.
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      { iterations: 3 },
    );
    loop.start(() => setPulsing(false));
    return () => {
      loop.stop();
      pulse.setValue(0);
      setPulsing(false);
    };
  }, [demo.arrived, pulse]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        onMapReady={fitStops}
        showsCompass={false}
        toolbarEnabled={false}
        loadingEnabled
      >
        {/* On Apple Maps overlays draw in JSX order — `zIndex` is Google-only,
            so this ordering IS the layering: casing, then the untravelled
            route, then the driven part on top. */}
        {demoDriving ? (
          <>
            <Polyline
              coordinates={routeLine}
              strokeColor={ROUTE_CASING}
              strokeWidth={CASING_WIDTH}
              lineCap="round"
              lineJoin="round"
            />
            <Polyline
              coordinates={routeLine}
              strokeColor={ROUTE_REMAINING}
              strokeWidth={ROUTE_WIDTH}
              lineCap="round"
              lineJoin="round"
            />
            {/* Each driven chunk is a stable overlay: constant coordinates, and
                the only thing that ever changes is the colour, once, on
                arrival. Chunks past the car simply are not mounted. */}
            {chunks.map((c) =>
              // Reveal on the chunk's LAST vertex, not its first: keyed on
              // `from` the line would turn red up to a chunk ahead of the car,
              // which reads as broken. Trailing slightly reads as natural.
              c.end <= demo.index ? (
                <Polyline
                  key={c.from}
                  coordinates={c.coords}
                  strokeColor={demo.arrived ? ROUTE_ARRIVED : ROUTE_TRAVELLED}
                  strokeWidth={ROUTE_WIDTH}
                  lineCap="round"
                  lineJoin="round"
                />
              ) : null,
            )}
          </>
        ) : null}

        {demo.arrived ? (
          <Marker
            coordinate={{
              latitude: DEMO_ROUTE[DEMO_ROUTE.length - 1].lat,
              longitude: DEMO_ROUTE[DEMO_ROUTE.length - 1].lng,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
            centerOffset={{ x: 0, y: 0 }}
            // Snapshotting only while it actually animates; left on, this would
            // re-rasterise the marker every frame forever.
            tracksViewChanges={pulsing}
            zIndex={900}
          >
            <View style={styles.pulseWrap} pointerEvents="none">
              <Animated.View
                style={[
                  styles.pulseRing,
                  {
                    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
                    transform: [
                      { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
                    ],
                  },
                ]}
              />
            </View>
          </Marker>
        ) : null}

        {pins.map((s) => (
          <Marker
            key={s.id}
            coordinate={{ latitude: s.point.lat, longitude: s.point.lng }}
            title={s.name}
            // Lift the pin clear of the route line instead of sitting on it —
            // centred, the glyph and the 11pt casing overlap and both get hard
            // to read. centerOffset is the iOS lever; anchor is Google's.
            anchor={{ x: 0.5, y: 0.68 }}
            centerOffset={{ x: 0, y: -4 }}
            tracksViewChanges={false}
            zIndex={500}
          >
            <View style={styles.emojiWrap}>
              <Text style={styles.emoji}>{STOP_EMOJI[s.kind] ?? '📍'}</Text>
            </View>
          </Marker>
        ))}

        {showCar ? (
          <MarkerAnimated
            coordinate={carCoord as unknown as { latitude: number; longitude: number }}
            anchor={{ x: 0.5, y: 0.5 }}
            centerOffset={{ x: 0, y: 0 }}
            rotation={live?.heading ?? 0}
            flat
            // The coordinate tween runs on the JS thread, so re-snapshotting
            // this marker every frame is the fastest way to drop the framerate.
            tracksViewChanges={false}
            zIndex={1000}
          >
            <CarBadge colorKey={carColorKey} />
          </MarkerAnimated>
        ) : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', backgroundColor: '#F7F8F9' },
  map: { flex: 1 },
  pulseWrap: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  pulseRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#16A34A',
    backgroundColor: 'rgba(22,163,74,0.12)',
  },
  emojiWrap: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 22 },
});
