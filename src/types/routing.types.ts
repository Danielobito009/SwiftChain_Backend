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

export type TravelMode = 'driving' | 'walking' | 'bicycling' | 'transit';

export interface ETARequest {
  pickup: Coordinates;
  dropoff: Coordinates;
  travelMode?: TravelMode;
}

export interface ETAResponse {
  estimatedTime: number;
  distance: number;
  durationText: string;
  distanceText: string;
  route: RouteInfo;
}
