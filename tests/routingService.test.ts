import { routingService } from '../src/services/routingService';
import type { ETARequest, Coordinates } from '../src/services/routingService';

describe('RoutingService - Haversine Distance Calculation', () => {
  describe('Standard Distance Calculations', () => {
    it('should calculate distance between New York and Los Angeles', async () => {
      const request: ETARequest = {
        pickup: { lat: 40.7128, lng: -74.006 }, // New York
        dropoff: { lat: 34.0522, lng: -118.2437 }, // Los Angeles
      };

      const result = await routingService.calculateETA(request);

      // Expected distance: ~3944 km
      expect(result.distance).toBeGreaterThan(3900);
      expect(result.distance).toBeLessThan(4000);
      expect(result.estimatedTime).toBeGreaterThan(0);
    });

    it('should calculate distance between London and Paris', async () => {
      const request: ETARequest = {
        pickup: { lat: 51.5074, lng: -0.1278 }, // London
        dropoff: { lat: 48.8566, lng: 2.3522 }, // Paris
      };

      const result = await routingService.calculateETA(request);

      // Expected distance: ~344 km
      expect(result.distance).toBeGreaterThan(330);
      expect(result.distance).toBeLessThan(360);
    });

    it('should calculate zero distance for identical coordinates', async () => {
      const request: ETARequest = {
        pickup: { lat: 0, lng: 0 },
        dropoff: { lat: 0, lng: 0 },
      };

      const result = await routingService.calculateETA(request);

      expect(result.distance).toBe(0);
      expect(result.estimatedTime).toBe(0);
    });

    it('should calculate small distance accurately', async () => {
      const request: ETARequest = {
        pickup: { lat: 40.7128, lng: -74.006 },
        dropoff: { lat: 40.7589, lng: -73.9851 }, // Times Square to Central Park (~5 km)
      };

      const result = await routingService.calculateETA(request);

      expect(result.distance).toBeGreaterThan(4);
      expect(result.distance).toBeLessThan(7);
    });
  });

  describe('Anti-Meridian Edge Cases (±180° longitude)', () => {
    it('should handle crossing the anti-meridian from west to east', async () => {
      // Fiji (178°E) to Samoa (172°W)
      const request: ETARequest = {
        pickup: { lat: -18.1248, lng: 178.4501 }, // Fiji
        dropoff: { lat: -13.759, lng: -172.1046 }, // Samoa
      };

      const result = await routingService.calculateETA(request);

      // Distance should be ~1100 km (short path across anti-meridian)
      // NOT ~19,000 km (wrong way around the globe)
      expect(result.distance).toBeGreaterThan(1000);
      expect(result.distance).toBeLessThan(1300);
    });

    it('should handle crossing the anti-meridian from east to west', async () => {
      // Samoa (172°W) to Fiji (178°E) - reverse direction
      const request: ETARequest = {
        pickup: { lat: -13.759, lng: -172.1046 }, // Samoa
        dropoff: { lat: -18.1248, lng: 178.4501 }, // Fiji
      };

      const result = await routingService.calculateETA(request);

      // Should be same distance as previous test (symmetric)
      expect(result.distance).toBeGreaterThan(1000);
      expect(result.distance).toBeLessThan(1300);
    });

    it('should handle points near but not crossing the anti-meridian (East)', async () => {
      const request: ETARequest = {
        pickup: { lat: 0, lng: 170 },
        dropoff: { lat: 0, lng: 175 },
      };

      const result = await routingService.calculateETA(request);

      // 5° longitude at equator ≈ 556 km
      expect(result.distance).toBeGreaterThan(540);
      expect(result.distance).toBeLessThan(570);
    });

    it('should handle points near but not crossing the anti-meridian (West)', async () => {
      const request: ETARequest = {
        pickup: { lat: 0, lng: -175 },
        dropoff: { lat: 0, lng: -170 },
      };

      const result = await routingService.calculateETA(request);

      // 5° longitude at equator ≈ 556 km
      expect(result.distance).toBeGreaterThan(540);
      expect(result.distance).toBeLessThan(570);
    });

    it('should handle equator crossing at anti-meridian', async () => {
      const request: ETARequest = {
        pickup: { lat: 5, lng: 179 },
        dropoff: { lat: -5, lng: -179 },
      };

      const result = await routingService.calculateETA(request);

      // ~10° latitude + ~2° longitude (short path) ≈ 1,134 km
      expect(result.distance).toBeGreaterThan(1100);
      expect(result.distance).toBeLessThan(1200);
    });

    it('should handle exactly at anti-meridian boundaries', async () => {
      const request: ETARequest = {
        pickup: { lat: 0, lng: 180 },
        dropoff: { lat: 0, lng: -180 },
      };

      const result = await routingService.calculateETA(request);

      // These are the same point (180° = -180°)
      expect(result.distance).toBeLessThan(1); // Allow small floating-point errors
    });

    it('should handle large anti-meridian crossing', async () => {
      // Alaska (USA) to Chukotka (Russia)
      const request: ETARequest = {
        pickup: { lat: 64.2008, lng: -149.4937 }, // Fairbanks, Alaska
        dropoff: { lat: 64.7341, lng: 177.5128 }, // Pevek, Russia
      };

      const result = await routingService.calculateETA(request);

      // Short path across Bering Strait ≈ 1,565 km
      // WITHOUT fix: would calculate ~37,000 km (wrong way around)
      expect(result.distance).toBeGreaterThan(1500);
      expect(result.distance).toBeLessThan(1650);
    });
  });

  describe('Edge Cases - Poles and Extreme Latitudes', () => {
    it('should handle North Pole to nearby point', async () => {
      const request: ETARequest = {
        pickup: { lat: 90, lng: 0 }, // North Pole
        dropoff: { lat: 85, lng: 0 },
      };

      const result = await routingService.calculateETA(request);

      // 5° latitude ≈ 556 km
      expect(result.distance).toBeGreaterThan(540);
      expect(result.distance).toBeLessThan(570);
    });

    it('should handle South Pole to nearby point', async () => {
      const request: ETARequest = {
        pickup: { lat: -90, lng: 0 }, // South Pole
        dropoff: { lat: -85, lng: 0 },
      };

      const result = await routingService.calculateETA(request);

      // 5° latitude ≈ 556 km
      expect(result.distance).toBeGreaterThan(540);
      expect(result.distance).toBeLessThan(570);
    });

    it('should handle crossing from North to South hemisphere', async () => {
      const request: ETARequest = {
        pickup: { lat: 45, lng: 0 },
        dropoff: { lat: -45, lng: 0 },
      };

      const result = await routingService.calculateETA(request);

      // 90° latitude ≈ 10,000 km
      expect(result.distance).toBeGreaterThan(9900);
      expect(result.distance).toBeLessThan(10100);
    });
  });

  describe('Different Travel Modes', () => {
    const baseRequest: ETARequest = {
      pickup: { lat: 40.7128, lng: -74.006 },
      dropoff: { lat: 40.7589, lng: -73.9851 }, // ~5 km
    };

    it('should calculate ETA for driving mode', async () => {
      const result = await routingService.calculateETA({
        ...baseRequest,
        travelMode: 'driving',
      });

      // 5 km at 40 km/h ≈ 7.5 minutes
      expect(result.estimatedTime).toBeGreaterThan(6);
      expect(result.estimatedTime).toBeLessThan(10);
    });

    it('should calculate ETA for walking mode', async () => {
      const result = await routingService.calculateETA({
        ...baseRequest,
        travelMode: 'walking',
      });

      // 5 km at 5 km/h = 60 minutes
      expect(result.estimatedTime).toBeGreaterThan(55);
      expect(result.estimatedTime).toBeLessThan(70);
    });

    it('should calculate ETA for bicycling mode', async () => {
      const result = await routingService.calculateETA({
        ...baseRequest,
        travelMode: 'bicycling',
      });

      // 5 km at 15 km/h = 20 minutes
      expect(result.estimatedTime).toBeGreaterThan(18);
      expect(result.estimatedTime).toBeLessThan(25);
    });

    it('should calculate ETA for transit mode', async () => {
      const result = await routingService.calculateETA({
        ...baseRequest,
        travelMode: 'transit',
      });

      // 5 km at 25 km/h = 12 minutes
      expect(result.estimatedTime).toBeGreaterThan(10);
      expect(result.estimatedTime).toBeLessThan(15);
    });
  });

  describe('Response Format Validation', () => {
    it('should return properly formatted response', async () => {
      const request: ETARequest = {
        pickup: { lat: 0, lng: 0 },
        dropoff: { lat: 1, lng: 1 },
      };

      const result = await routingService.calculateETA(request);

      expect(result).toHaveProperty('estimatedTime');
      expect(result).toHaveProperty('distance');
      expect(result).toHaveProperty('durationText');
      expect(result).toHaveProperty('distanceText');
      expect(result).toHaveProperty('route');
      expect(result.route).toHaveProperty('distance');
      expect(result.route).toHaveProperty('duration');
      expect(result.route).toHaveProperty('distanceText');
      expect(result.route).toHaveProperty('durationText');
    });

    it('should format distance text correctly', async () => {
      const request: ETARequest = {
        pickup: { lat: 0, lng: 0 },
        dropoff: { lat: 1, lng: 1 },
      };

      const result = await routingService.calculateETA(request);

      expect(result.distanceText).toMatch(/\d+(\.\d+)? km/);
    });

    it('should format duration text correctly', async () => {
      const request: ETARequest = {
        pickup: { lat: 0, lng: 0 },
        dropoff: { lat: 1, lng: 1 },
      };

      const result = await routingService.calculateETA(request);

      expect(result.durationText).toMatch(/\d+ mins/);
    });

    it('should round distance to 2 decimal places', async () => {
      const request: ETARequest = {
        pickup: { lat: 0, lng: 0 },
        dropoff: { lat: 0.0001, lng: 0.0001 },
      };

      const result = await routingService.calculateETA(request);

      // Check that distance has at most 2 decimal places
      const decimalPart = result.distance.toString().split('.')[1];
      expect(!decimalPart || decimalPart.length <= 2).toBe(true);
    });

    it('should round estimated time to nearest minute (ceiling)', async () => {
      const request: ETARequest = {
        pickup: { lat: 0, lng: 0 },
        dropoff: { lat: 0.001, lng: 0.001 }, // Very short distance
      };

      const result = await routingService.calculateETA(request);

      // estimatedTime should be an integer
      expect(Number.isInteger(result.estimatedTime)).toBe(true);
      expect(result.estimatedTime).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Performance Tests', () => {
    it('should calculate distance quickly for single request', async () => {
      const request: ETARequest = {
        pickup: { lat: 40.7128, lng: -74.006 },
        dropoff: { lat: 34.0522, lng: -118.2437 },
      };

      const startTime = performance.now();
      await routingService.calculateETA(request);
      const endTime = performance.now();

      // Should complete in less than 10ms
      expect(endTime - startTime).toBeLessThan(10);
    });

    it('should handle multiple calculations efficiently', async () => {
      const requests: ETARequest[] = [
        { pickup: { lat: 0, lng: 0 }, dropoff: { lat: 1, lng: 1 } },
        { pickup: { lat: 10, lng: 10 }, dropoff: { lat: 20, lng: 20 } },
        { pickup: { lat: -30, lng: 150 }, dropoff: { lat: -35, lng: 155 } },
        { pickup: { lat: 60, lng: -170 }, dropoff: { lat: 62, lng: 175 } }, // Anti-meridian
      ];

      const startTime = performance.now();
      await Promise.all(requests.map((r) => routingService.calculateETA(r)));
      const endTime = performance.now();

      // 4 calculations should complete in less than 20ms
      expect(endTime - startTime).toBeLessThan(20);
    });
  });

  describe('Symmetry and Consistency', () => {
    it('should return same distance regardless of direction', async () => {
      const pointA: Coordinates = { lat: 40.7128, lng: -74.006 };
      const pointB: Coordinates = { lat: 34.0522, lng: -118.2437 };

      const resultAtoB = await routingService.calculateETA({
        pickup: pointA,
        dropoff: pointB,
      });

      const resultBtoA = await routingService.calculateETA({
        pickup: pointB,
        dropoff: pointA,
      });

      expect(resultAtoB.distance).toBe(resultBtoA.distance);
    });

    it('should return same distance for anti-meridian crossing regardless of direction', async () => {
      const pointA: Coordinates = { lat: -18.1248, lng: 178.4501 };
      const pointB: Coordinates = { lat: -13.759, lng: -172.1046 };

      const resultAtoB = await routingService.calculateETA({
        pickup: pointA,
        dropoff: pointB,
      });

      const resultBtoA = await routingService.calculateETA({
        pickup: pointB,
        dropoff: pointA,
      });

      expect(resultAtoB.distance).toBe(resultBtoA.distance);
    });
  });
});
