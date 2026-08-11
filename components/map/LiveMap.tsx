import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, {
  AnimatedRegion,
  Marker,
  MarkerAnimated,
  type Region,
} from 'react-native-maps';
import Svg, { Path, Rect } from 'react-native-svg';
import type { GeoPoint, MapStop } from '@/types';
import { carColor } from '@/lib/carOptions';
import { useLiveDriverLocation } from '@/hooks/useLiveDriverLocation';
import { DEMO_MODE } from '@/lib/demoMode';
import { buildDemoRoute } from '@/lib/demoRoute';

/** Stable identity so the demo route memo doesn't churn in normal builds. */
const EMPTY_ROUTE: GeoPoint[] = [];

export interface LiveMapProps {
  channel: string; // Supabase broadcast channel to subscribe to for live GPS
  stops: MapStop[]; // school + rider/driver homes to pin
  start: { lat: number; lng: number } | null; // initial car position
  carColorKey?: string | null; // driver's chosen color; defaults to brand crimson
  destinations?: { lat: number; lng: number }[]; // keep car + these drop-offs framed live
  tripActive?: boolean; // ride under way — only consulted by DEMO_MODE
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
    <Svg width={30} height={30} viewBox="0 0 44 44">
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
  tripActive,
}: LiveMapProps) {
  const mapRef = useRef<MapView | null>(null);

  // Synthetic drive for demos. buildDemoRoute is not even called in a normal
  // build — DEMO_MODE folds to a literal `false` at bundle time.
  const demoRoute = useMemo(
    () => (DEMO_MODE ? buildDemoRoute(stops, start) : EMPTY_ROUTE),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(stops), JSON.stringify(start)],
  );
  const live = useLiveDriverLocation(channel, {
    active: tripActive ?? false,
    route: demoRoute,
  });

  const startPoint: GeoPoint = start ?? stops[0]?.point ?? FALLBACK;

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
    () => regionFor([...stops.map((s) => s.point), startPoint]),
    // Only the trip's pins/start define the opening frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(stops), JSON.stringify(startPoint)],
  );

  // Frame school + homes (+ the driver's start) before any live fix arrives, so
  // a waiting rider sees the whole route — parity with the old Leaflet fitBounds.
  const fitStops = useCallback(() => {
    // Deduplicate FIRST. Before the members load, `stops` is just the school and
    // `startPoint` falls back to that same school pin — two identical points,
    // which slips past a naive length check and makes fitToCoordinates frame a
    // zero-area box, slamming the map to maximum zoom on one rooftop.
    const pts = distinctPoints([...stops.map((s) => s.point), startPoint]);
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
  }, [stops, startPoint]);

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
        duration: 1400,
        useNativeDriver: false,
      } as unknown as Parameters<AnimatedRegion['timing']>[0])
      .start();

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
  }, [live, carCoord, JSON.stringify(destinations ?? [])]);

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
        {stops.map((s) => (
          <Marker
            key={s.id}
            coordinate={{ latitude: s.point.lat, longitude: s.point.lng }}
            title={s.name}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
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
            rotation={live?.heading ?? 0}
            flat
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
  emojiWrap: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 22 },
});
