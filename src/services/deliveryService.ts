import { Delivery } from '../models/Delivery';
import { routingService, ETARequest } from './routingService';

interface DeliveryETARequest {
  deliveryId: string;
}

interface DeliveryETAResponse {
  deliveryId: string;
  status: string;
  pickup: {
    address: string;
    coordinates: { lat: number; lng: number };
  };
  dropoff: {
    address: string;
    coordinates: { lat: number; lng: number };
  };
  eta: {
    estimatedMinutes: number;
    distanceKm: number;
    durationText: string;
    distanceText: string;
  };
}

class DeliveryService {
  async calculateDeliveryETA(request: DeliveryETARequest): Promise<DeliveryETAResponse> {
    const delivery = await Delivery.findOne({ deliveryId: request.deliveryId });

    if (!delivery) {
      throw new Error(`Delivery with ID ${request.deliveryId} not found`);
    }

    if (!delivery.pickupCoordinates || !delivery.dropoffCoordinates) {
      throw new Error('Delivery does not have complete coordinates');
    }

    const routingRequest: ETARequest = {
      pickup: {
        lat: delivery.pickupCoordinates.lat,
        lng: delivery.pickupCoordinates.lng,
      },
      dropoff: {
        lat: delivery.dropoffCoordinates.lat,
        lng: delivery.dropoffCoordinates.lng,
      },
      travelMode: 'driving',
    };

    const etaResult = await routingService.calculateETA(routingRequest);

    delivery.distance = etaResult.distance * 1000;
    delivery.estimatedDuration = etaResult.estimatedTime * 60;
    await delivery.save();

    return {
      deliveryId: delivery.deliveryId,
      status: delivery.status,
      pickup: {
        address: delivery.pickupCoordinates.address,
        coordinates: {
          lat: delivery.pickupCoordinates.lat,
          lng: delivery.pickupCoordinates.lng,
        },
      },
      dropoff: {
        address: delivery.dropoffCoordinates.address,
        coordinates: {
          lat: delivery.dropoffCoordinates.lat,
          lng: delivery.dropoffCoordinates.lng,
        },
      },
      eta: {
        estimatedMinutes: etaResult.estimatedTime,
        distanceKm: etaResult.distance,
        durationText: etaResult.durationText,
        distanceText: etaResult.distanceText,
      },
    };
  }
}

export const deliveryService = new DeliveryService();
