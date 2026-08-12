import { useEffect, useRef, useState } from 'react';
import type { LocPayload } from '@/lib/liveTrip';
import { DEMO_TICK_MS, DEMO_TRIP_MS } from '@/lib/demoMode';
import { positionAt } from '@/lib/demoRoute';

export interface DemoDrive {
  payload: LocPayload | null;
  progress: number; // 0…1 along the route
  index: number; // last route vertex passed — where the travelled polyline ends
  arrived: boolean;
}

const IDLE: DemoDrive = { payload: null, progress: 0, index: 0, arrived: false };

/**
 * Synthetic driver for DEMO_MODE (see lib/demoMode): walks the hardcoded route
 * at a constant speed and emits fixes in the same shape the real broadcast
 * delivers, so the map renders the production code path with a different source
 * of positions.
 *
 * Inert unless enabled — with `enabled` false no timer is ever created, so a
 * normal build pays nothing for this hook existing.
 */
export function useDemoDriverLocation(enabled: boolean): DemoDrive {
  const [drive, setDrive] = useState<DemoDrive>(IDLE);
  const startedAt = useRef(0);
  // Mirrors `drive` so the effect can read the latest value without taking it
  // as a dependency — which would tear down and restart the interval on every
  // single tick.
  const driveRef = useRef(drive);
  driveRef.current = drive;

  /** The finished frame: car parked at the destination, whole route driven. */
  const finished = (): DemoDrive => {
    const end = positionAt(1);
    return {
      payload: { lat: end.point.lat, lng: end.point.lng, heading: end.heading },
      progress: 1,
      index: end.index,
      arrived: true,
    };
  };

  useEffect(() => {
    if (!enabled) {
      // Disabled after the drive began — e.g. the driver ended the ride. Freeze
      // on the completed picture instead of resetting, so the map reads as a
      // finished trip rather than blanking out. If it never ran, stay idle.
      setDrive((d) => (d.payload === null ? IDLE : finished()));
      return;
    }

    // Already finished: hold the final frame. Without this, anything that
    // re-runs the effect replays the whole drive from the school.
    if (driveRef.current.arrived) return;

    // Progress is derived from the CLOCK, not from a tick counter. A dropped or
    // late tick then costs a frame of smoothness rather than stretching the
    // whole drive — the run always takes exactly DEMO_TRIP_MS.
    startedAt.current = Date.now();

    const emit = (): boolean => {
      const elapsed = Date.now() - startedAt.current;
      const progress = Math.min(elapsed / DEMO_TRIP_MS, 1);
      const pos = positionAt(progress);
      setDrive({
        payload: { lat: pos.point.lat, lng: pos.point.lng, heading: pos.heading },
        progress,
        index: pos.index,
        arrived: progress >= 1,
      });
      return progress >= 1;
    };

    emit(); // place the car at the start immediately, don't wait a tick
    const timer = setInterval(() => {
      // Stop the timer on arrival and hold the final frame. Looping would
      // teleport the car back to school mid-demo, which reads as a bug.
      if (emit()) clearInterval(timer);
    }, DEMO_TICK_MS);

    return () => clearInterval(timer);
  }, [enabled]);

  return drive;
}
