import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildMapHtml, type MapHtmlOptions } from '@/lib/mapHtml';

/**
 * Native live map: a Leaflet+OpenStreetMap page hosted in a WebView. The page
 * subscribes to the live-location broadcast itself, so we only need to render
 * the HTML once (no RN<->webview bridge for updates).
 */
export function LiveMap({ channel, stops, start }: MapHtmlOptions) {
  const html = useMemo(
    () => buildMapHtml({ channel, stops, start }),
    // Rebuild only when the trip identity/markers actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channel, JSON.stringify(stops), JSON.stringify(start)],
  );

  return (
    <View style={styles.container}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled
        style={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', backgroundColor: '#F7F8F9' },
  web: { flex: 1, backgroundColor: 'transparent' },
});
