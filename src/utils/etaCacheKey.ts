import { Coordinates } from '../types/routing.types';
import { encodeGeohash } from './geohash';
import { TravelMode } from '../types/routing.types';

/**
 * Build a deterministic Redis cache key from pickup/dropoff coordinates
 * and travel mode. Nearby coordinates share a geohash bucket so repeated
 * ETA lookups for similar routes hit the cache instead of external APIs.
 */
export function buildEtaCacheKey(
  pickup: Coordinates,
  dropoff: Coordinates,
  travelMode: TravelMode,
  geohashPrecision: number,
): string {
  const pickupHash = encodeGeohash(pickup.lat, pickup.lng, geohashPrecision);
  const dropoffHash = encodeGeohash(dropoff.lat, dropoff.lng, geohashPrecision);
  return `eta:${pickupHash}:${dropoffHash}:${travelMode}`;
}
