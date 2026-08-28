import axios from 'axios';
import CircuitBreaker from 'opossum';
import env from '../config/env';
import logger from '../config/logger';
import { createCircuitBreaker } from '../utils/circuitBreaker';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface RouteInfo {
  distance: number;
  duration: number;
  distanceText: string;
  durationText: string;
}

export interface ETARequest {
  pickup: Coordinates;
  dropoff: Coordinates;
  travelMode?: 'driving' | 'walking' | 'bicycling' | 'transit';
}

export interface ETAResponse {
  estimatedTime: number;
  distance: number;
  durationText: string;
  distanceText: string;
  route: RouteInfo;
  /** True when the response was produced by the Haversine fallback rather
   *  than the live Google Maps API (circuit open or API key absent). */
  isFallback: boolean;
}

/**
 * RoutingService wraps the Google Maps Directions API behind a circuit
 * breaker.
 *
 * Circuit-breaker behaviour:
 *   - CLOSED  (normal)   — calls go straight to the Google Maps API.
 *   - OPEN    (degraded) — calls are short-circuited; the Haversine fallback
 *                          is returned immediately without hitting the API.
 *   - HALF-OPEN (probing) — one test call is allowed through to check recovery.
 *
 * The Haversine fallback is also used when GOOGLE_MAPS_API_KEY is not set,
 * preserving the existing silent-degradation behaviour.
 */
class RoutingService {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly breaker: CircuitBreaker<[ETARequest], ETAResponse>;

  constructor() {
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY ?? '';
    this.baseUrl = 'https://maps.googleapis.com/maps/api/directions/json';

    if (!this.apiKey) {
      logger.warn(
        '[RoutingService] GOOGLE_MAPS_API_KEY not configured — Haversine fallback will be used.',
      );
    }

    // Build the circuit breaker.  The fallback function receives the same
    // ETARequest that was passed to fire(), so we can produce a meaningful
    // degraded response from it.
    this.breaker = createCircuitBreaker<[ETARequest], ETAResponse>(
      {
        name: 'google-maps',
        errorThresholdPercentage: env.CB_GOOGLE_MAPS_ERROR_THRESHOLD_PERCENTAGE,
        rollingWindowMs: env.CB_GOOGLE_MAPS_ROLLING_WINDOW_MS,
        resetTimeoutMs: env.CB_GOOGLE_MAPS_RESET_TIMEOUT_MS,
        volumeThreshold: env.CB_GOOGLE_MAPS_VOLUME_THRESHOLD,
        timeoutMs: env.CB_GOOGLE_MAPS_TIMEOUT_MS,
      },
      // Fallback: invoked when the circuit is OPEN or the API call fails.
      // Returns a Haversine estimate so callers always receive a usable result.
      (request: ETARequest): ETAResponse => {
        logger.warn(
          '[RoutingService] Google Maps circuit open — serving Haversine fallback estimate.',
        );
        return { ...this.calculateWithHaversine(request), isFallback: true };
      },
    );

    // Bind the actual Google Maps HTTP call as the breaker's protected action.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.breaker as any).action = (request: ETARequest) =>
      this.callGoogleMapsApi(request);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Calculate the estimated travel time and distance between two coordinates.
   *
   * When `GOOGLE_MAPS_API_KEY` is present the call is routed through the
   * circuit breaker:
   *   • Successful → live Google Maps result (`isFallback: false`)
   *   • Circuit OPEN or API error → Haversine estimate (`isFallback: true`)
   *
   * When the key is absent the Haversine path is taken directly.
   *
   * @throws {Error} Only when both the API call and the fallback throw — in
   *   practice the fallback is pure computation and should never throw.
   */
  async calculateETA(request: ETARequest): Promise<ETAResponse> {
    if (!this.apiKey) {
      // No API key — skip the circuit breaker entirely.
      return { ...this.calculateWithHaversine(request), isFallback: true };
    }

    try {
      return await this.breaker.fire(request);
    } catch (error) {
      // If even the fallback threw (shouldn't happen), surface it clearly.
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[RoutingService] ETA calculation failed entirely: ${message}`);
      throw new Error('Failed to calculate delivery ETA');
    }
  }

  // ── Protected action (runs inside the circuit breaker) ──────────────────────

  /**
   * Make the live Google Maps Directions API request.
   * Any thrown error is recorded by opossum as a circuit-breaker failure.
   */
  private async callGoogleMapsApi(request: ETARequest): Promise<ETAResponse> {
    const { pickup, dropoff, travelMode = 'driving' } = request;

    const response = await axios.get<GoogleMapsDirectionsResponse>(this.baseUrl, {
      params: {
        origin: `${pickup.lat},${pickup.lng}`,
        destination: `${dropoff.lat},${dropoff.lng}`,
        mode: travelMode,
        key: this.apiKey,
        units: 'metric',
      },
      // Honour the circuit-breaker timeout at the HTTP layer as well so the
      // breaker's own timeout and axios's don't fight each other.
      timeout: env.CB_GOOGLE_MAPS_TIMEOUT_MS,
    });

    if (response.data.status !== 'OK') {
      throw new Error(`Google Maps API error: ${response.data.status}`);
    }

    const leg = response.data.routes[0].legs[0];

    return {
      estimatedTime: Math.ceil(leg.duration.value / 60),
      distance: leg.distance.value / 1000,
      durationText: leg.duration.text,
      distanceText: leg.distance.text,
      isFallback: false,
      route: {
        distance: leg.distance.value,
        duration: leg.duration.value,
        distanceText: leg.distance.text,
        durationText: leg.duration.text,
      },
    };
  }

  // ── Haversine fallback (pure, no network calls) ─────────────────────────────

  private calculateWithHaversine(request: ETARequest): Omit<ETAResponse, 'isFallback'> {
    const { pickup, dropoff, travelMode = 'driving' } = request;

    const distance = this.haversineDistanceMeters(pickup, dropoff);
    const distanceKm = distance / 1000;

    const speeds: Record<string, number> = {
      driving: 40,
      walking: 5,
      bicycling: 15,
      transit: 25,
    };

    const speed = speeds[travelMode] ?? 40;
    const durationMinutes = (distanceKm / speed) * 60;

    return {
      estimatedTime: Math.ceil(durationMinutes),
      distance: Math.round(distanceKm * 100) / 100,
      durationText: `${Math.ceil(durationMinutes)} mins`,
      distanceText: `${Math.round(distanceKm * 100) / 100} km`,
      route: {
        distance,
        duration: durationMinutes * 60,
        distanceText: `${Math.round(distanceKm * 100) / 100} km`,
        durationText: `${Math.ceil(durationMinutes)} mins`,
      },
    };
  }

  private haversineDistanceMeters(a: Coordinates, b: Coordinates): number {
    const R = 6_371_000;
    const dLat = toRadians(b.lat - a.lat);
    const dLng = toRadians(b.lng - a.lng);
    const sinDlat = Math.sin(dLat / 2);
    const sinDlng = Math.sin(dLng / 2);
    const chord =
      sinDlat * sinDlat +
      Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * sinDlng * sinDlng;
    return R * 2 * Math.atan2(Math.sqrt(chord), Math.sqrt(1 - chord));
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

// ── Google Maps API response shape (minimal, only what we consume) ─────────────

interface GoogleMapsDirectionsResponse {
  status: string;
  routes: Array<{
    legs: Array<{
      duration: { value: number; text: string };
      distance: { value: number; text: string };
    }>;
  }>;
}

export const routingService = new RoutingService();
