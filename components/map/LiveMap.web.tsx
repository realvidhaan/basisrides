import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { buildMapHtml, type MapHtmlOptions } from '@/lib/mapHtml';

/**
 * Web live map: the same Leaflet HTML rendered in a plain <iframe> (react-native
 * -web renders into the DOM, so a real iframe works and needs no extra deps).
 * The iframe page subscribes to the live-location broadcast on its own.
 */
export function LiveMap({ channel, stops, start, carColorKey }: MapHtmlOptions) {
  const html = useMemo(
    () => buildMapHtml({ channel, stops, start, carColorKey }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channel, JSON.stringify(stops), JSON.stringify(start), carColorKey],
  );

  return (
    <View style={styles.container}>
      <iframe
        title="Live carpool map"
        srcDoc={html}
        style={{ border: 'none', width: '100%', height: '100%' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', backgroundColor: '#F7F8F9' },
});
