const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/**
 * Encode latitude/longitude into a geohash string.
 * Used to bucket nearby coordinates for ETA cache keys.
 *
 * @param lat       Latitude in decimal degrees.
 * @param lng       Longitude in decimal degrees.
 * @param precision Number of geohash characters (default 7 ≈ 150 m).
 */
export function encodeGeohash(lat: number, lng: number, precision = 7): string {
  let minLat = -90;
  let maxLat = 90;
  let minLng = -180;
  let maxLng = 180;

  let hash = '';
  let bit = 0;
  let ch = 0;
  let isLng = true;

  while (hash.length < precision) {
    if (isLng) {
      const mid = (minLng + maxLng) / 2;
      if (lng >= mid) {
        ch = ch | (1 << (4 - bit));
        minLng = mid;
      } else {
        maxLng = mid;
      }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat >= mid) {
        ch = ch | (1 << (4 - bit));
        minLat = mid;
      } else {
        maxLat = mid;
      }
    }

    isLng = !isLng;
    bit += 1;

    if (bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }

  return hash;
}
