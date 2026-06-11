import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import { LOC_EVENT } from '@/lib/liveTrip';
import type { MapStop } from '@/types';

export interface MapHtmlOptions {
  channel: string; // Supabase broadcast channel to subscribe to for live GPS
  stops: MapStop[]; // school + rider/driver homes to pin
  start: { lat: number; lng: number } | null; // initial car position
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
  const config = {
    url: SUPABASE_URL,
    key: SUPABASE_ANON_KEY,
    channel: opts.channel,
    event: LOC_EVENT,
    stops: opts.stops,
    start: opts.start,
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
    .pin { font-size: 22px; line-height: 22px; text-align: center; }
    .car-wrap { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; }
    .car-badge {
      width: 34px; height: 34px; border-radius: 17px; background: #DC143C;
      box-shadow: 0 2px 6px rgba(0,0,0,0.35); display: flex; align-items: center;
      justify-content: center; font-size: 18px; transition: transform 0.2s linear;
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

    var bounds = [];
    for (var i = 0; i < CONFIG.stops.length; i++) {
      var s = CONFIG.stops[i];
      var emoji = s.kind === 'school' ? '\u{1F3EB}' : (s.kind === 'driver' ? '\u{1F3E0}' : '\u{1F3E1}');
      L.marker([s.point.lat, s.point.lng], { icon: emojiIcon(emoji) })
        .addTo(map)
        .bindPopup(s.name);
      bounds.push([s.point.lat, s.point.lng]);
    }

    // The live car marker.
    var carEl = L.divIcon({
      className: '',
      html: '<div class="car-wrap"><div class="car-badge" id="carBadge">\u{1F697}</div></div>',
      iconSize: [40, 40], iconAnchor: [20, 20]
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
          map.panTo([p.lat, p.lng], { animate: true, duration: 1 });
        }
      }).subscribe();
    } catch (e) {
      // If realtime fails the static pins still render — map degrades gracefully.
    }
  </script>
</body>
</html>`;
}
