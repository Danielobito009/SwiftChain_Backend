import axios from 'axios';
import logger from '../config/logger';
import { etaCacheService } from './etaCacheService';
import {
  Coordinates,
  ETARequest,
  ETAResponse,
  TravelMode,
} from '../types/routing.types';

export type { Coordinates, ETARequest, ETAResponse, RouteInfo, TravelMode } from '../types/routing.types';

class RoutingService {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor() {
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
    this.baseUrl = 'https://maps.googleapis.com/maps/api/directions/json';

    if (!this.apiKey) {
      logger.warn('Google Maps API key not configured — using Haversine fallback for ETA');
    }
  }

  /**
   * Calculate delivery ETA, checking Redis cache before calling external APIs.
   */
  async calculateETA(request: ETARequest): Promise<ETAResponse> {
    const travelMode = request.travelMode ?? 'driving';

    try {
      const cached = await etaCacheService.get({
        pickup: request.pickup,
        dropoff: request.dropoff,
        travelMode,
      });

      if (cached) {
        return cached;
      }

      const result = await this.calculateFresh({ ...request, travelMode });
      await etaCacheService.set({ pickup: request.pickup, dropoff: request.dropoff, travelMode }, result);

      return result;
    } catch (error) {
      logger.error('Failed to calculate ETA:', error);
      throw new Error('Failed to calculate delivery ETA');
    }
  }

  private async calculateFresh(request: ETARequest & { travelMode: TravelMode }): Promise<ETAResponse> {
    if (this.apiKey) {
      return this.calculateWithGoogleMaps(request);
    }
    return this.calculateWithHaversine(request);
  }

  private async calculateWithGoogleMaps(
    request: ETARequest & { travelMode: TravelMode },
  ): Promise<ETAResponse> {
    const { pickup, dropoff, travelMode } = request;

    const params = {
      origin: `${pickup.lat},${pickup.lng}`,
      destination: `${dropoff.lat},${dropoff.lng}`,
      mode: travelMode,
      key: this.apiKey,
      units: 'metric',
    };

    const response = await axios.get(this.baseUrl, { params });

    if (response.data.status !== 'OK') {
      throw new Error(`Google Maps API error: ${response.data.status}`);
    }

    const route = response.data.routes[0];
    const leg = route.legs[0];

    return {
      estimatedTime: Math.ceil(leg.duration.value / 60),
      distance: leg.distance.value / 1000,
      durationText: leg.duration.text,
      distanceText: leg.distance.text,
      route: {
        distance: leg.distance.value,
        duration: leg.duration.value,
        distanceText: leg.distance.text,
        durationText: leg.duration.text,
      },
    };
  }

  private calculateWithHaversine(request: ETARequest & { travelMode: TravelMode }): ETAResponse {
    const { pickup, dropoff, travelMode } = request;

    const distance = this.calculateHaversineDistance(pickup, dropoff);
    const distanceKm = distance / 1000;

    const speeds: Record<TravelMode, number> = {
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
        distance: distance,
        duration: durationMinutes * 60,
        distanceText: `${Math.round(distanceKm * 100) / 100} km`,
        durationText: `${Math.ceil(durationMinutes)} mins`,
      },
    };
  }

  private calculateHaversineDistance(point1: Coordinates, point2: Coordinates): number {
    const R = 6371000;
    const dLat = this.toRadians(point2.lat - point1.lat);
    const dLng = this.toRadians(point2.lng - point1.lng);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(point1.lat)) *
        Math.cos(this.toRadians(point2.lat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}

export const routingService = new RoutingService();
