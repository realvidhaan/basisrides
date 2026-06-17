import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import { LOC_EVENT } from '@/lib/liveTrip';
import { carColor } from '@/lib/carOptions';
import type { MapStop } from '@/types';

export interface MapHtmlOptions {
  channel: string; // Supabase broadcast channel to subscribe to for live GPS
  stops: MapStop[]; // school + rider/driver homes to pin
  start: { lat: number; lng: number } | null; // initial car position
  carColorKey?: string | null; // driver's chosen color; defaults to brand crimson
  destination?: { lat: number; lng: number } | null; // keep car + this point framed live
}

/**
 * Builds a self-contained HTML document with a free Leaflet + OpenStreetMap map
 * (no API key, no billing). The page runs its OWN supabase-js (from CDN) and
 * subscribes directly to the live-location broadcast channel, so the car moves
 * in real time without any bridge between React Native and the webview/iframe.
 *
 * Only the config object is interpolated; the rest is static so there are no
 * accidental template collisions. Everything inside <script> uses plain strings.
 */
export function buildMapHtml(opts: MapHtmlOptions): string {
  const col = carColor(opts.carColorKey || 'crimson');
  const config = {
    url: SUPABASE_URL,
    key: SUPABASE_ANON_KEY,
    channel: opts.channel,
    event: LOC_EVENT,
    stops: opts.stops,
    start: opts.start,
    destination: opts.destination ?? null,
    carBase: col.base,
    carDark: col.dark,
  };
  const configJson = JSON.stringify(config).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; background: #F7F8F9; }
    .pin { font-size: 20px; line-height: 20px; text-align: center; }
    .car-wrap { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; }
    .car-svg {
      width: 30px; height: 30px;
      filter: drop-shadow(0 1px 2px rgba(0,0,0,0.35));
      transition: transform 0.25s linear;
    }
    .leaflet-control-attribution { font-size: 9px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script>
    var CONFIG = ${configJson};

    var map = L.map('map', { zoomControl: true, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    function emojiIcon(emoji) {
      return L.divIcon({ className: '', html: '<div class="pin">' + emoji + '</div>', iconSize: [26, 26], iconAnchor: [13, 13] });
    }

    // Stop names carry user-controlled text (a parent's full name + child name),
    // and Leaflet's bindPopup renders its string argument as HTML. Escape it so a
    // crafted name can't inject markup/script into other members' map popups.
    function escapeHtml(t) {
      return String(t).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    var bounds = [];
    for (var i = 0; i < CONFIG.stops.length; i++) {
      var s = CONFIG.stops[i];
      var emoji = s.kind === 'school' ? '\u{1F3EB}' : (s.kind === 'driver' ? '\u{1F3E0}' : '\u{1F3E1}');
      L.marker([s.point.lat, s.point.lng], { icon: emojiIcon(emoji) })
        .addTo(map)
        .bindPopup(escapeHtml(s.name));
      bounds.push([s.point.lat, s.point.lng]);
    }

    // The live car marker — a clean top-down car (nose points north at 0deg, so
    // rotating by the GPS heading orients it along travel). Painted in the
    // driver's chosen color so it matches their car card.
    var carSvg =
      '<svg width="30" height="30" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">'
      + '<rect x="10" y="5" width="24" height="34" rx="9" fill="' + CONFIG.carBase + '"/>'
      + '<rect x="13" y="15" width="18" height="13" rx="5" fill="' + CONFIG.carDark + '"/>'
      + '<path d="M12 14 C16 10 28 10 32 14 L30 17 C26 14.5 18 14.5 14 17 Z" fill="#EAF2FF"/>'
      + '<path d="M14 30 C18 32.5 26 32.5 30 30 L32 33 C28 36 16 36 12 33 Z" fill="#EAF2FF"/>'
      + '<rect x="12" y="6.5" width="4" height="3" rx="1.5" fill="#FFF3B0"/>'
      + '<rect x="28" y="6.5" width="4" height="3" rx="1.5" fill="#FFF3B0"/>'
      + '</svg>';
    var carEl = L.divIcon({
      className: '',
      html: '<div class="car-wrap"><div class="car-svg" id="carBadge">' + carSvg + '</div></div>',
      iconSize: [30, 30], iconAnchor: [15, 15]
    });
    var startPos = CONFIG.start || (CONFIG.stops.length ? CONFIG.stops[0].point : { lat: 37.3197, lng: -121.912 });
    var car = L.marker([startPos.lat, startPos.lng], { icon: carEl, zIndexOffset: 1000 }).addTo(map);
    bounds.push([startPos.lat, startPos.lng]);

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    } else {
      map.setView([startPos.lat, startPos.lng], 14);
    }

    // Smoothly animate the car from its current spot to a new one.
    var anim = null;
    function moveCar(lat, lng, heading) {
      var from = car.getLatLng();
      var to = L.latLng(lat, lng);
      var t0 = Date.now();
      var dur = 1400;
      if (anim) cancelAnimationFrame(anim);
      function step() {
        var p = Math.min(1, (Date.now() - t0) / dur);
        var clat = from.lat + (to.lat - from.lat) * p;
        var clng = from.lng + (to.lng - from.lng) * p;
        car.setLatLng([clat, clng]);
        if (p < 1) { anim = requestAnimationFrame(step); }
      }
      step();
      if (heading !== null && heading !== undefined) {
        var badge = document.getElementById('carBadge');
        if (badge) { badge.style.transform = 'rotate(' + heading + 'deg)'; }
      }
    }

    try {
      var sb = window.supabase.createClient(CONFIG.url, CONFIG.key);
      var ch = sb.channel(CONFIG.channel);
      ch.on('broadcast', { event: CONFIG.event }, function (msg) {
        var p = msg.payload || {};
        if (typeof p.lat === 'number' && typeof p.lng === 'number') {
          moveCar(p.lat, p.lng, p.heading);
          // Keep the car AND the destination in frame as the trip progresses;
          // fall back to following just the car if no destination is set.
          if (CONFIG.destination) {
            map.fitBounds(
              [[p.lat, p.lng], [CONFIG.destination.lat, CONFIG.destination.lng]],
              { padding: [55, 55], maxZoom: 16, animate: true }
            );
          } else {
            map.panTo([p.lat, p.lng], { animate: true, duration: 1 });
          }
        }
      }).subscribe();
    } catch (e) {
      // If realtime fails the static pins still render — map degrades gracefully.
    }
  </script>
</body>
</html>`;
}
