import axios from 'axios';

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
}

class RoutingService {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor() {
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
    this.baseUrl = 'https://maps.googleapis.com/maps/api/directions/json';

    if (!this.apiKey) {
      // eslint-disable-next-line no-console
      console.warn('⚠️ Google Maps API key not configured. Using fallback calculation.');
    }
  }

  async calculateETA(request: ETARequest): Promise<ETAResponse> {
    try {
      if (this.apiKey) {
        return await this.calculateWithGoogleMaps(request);
      }
      return this.calculateWithHaversine(request);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to calculate ETA:', error);
      throw new Error('Failed to calculate delivery ETA');
    }
  }

  private async calculateWithGoogleMaps(request: ETARequest): Promise<ETAResponse> {
    const { pickup, dropoff, travelMode = 'driving' } = request;

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

  private calculateWithHaversine(request: ETARequest): ETAResponse {
    const { pickup, dropoff, travelMode = 'driving' } = request;

    const distance = this.calculateHaversineDistance(pickup, dropoff);
    const distanceKm = distance / 1000;

    const speeds: Record<string, number> = {
      driving: 40,
      walking: 5,
      bicycling: 15,
      transit: 25,
    };

    const speed = speeds[travelMode] || 40;
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
