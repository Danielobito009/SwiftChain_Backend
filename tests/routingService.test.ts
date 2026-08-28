/**
 * Unit tests for ETA geohash cache keys, geohash encoding, and routingService
 * cache behaviour (hit/miss, external API skip on hit).
 */

jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('axios');

const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();

jest.mock('../src/services/etaCacheService', () => ({
  etaCacheService: {
    get: (...args: unknown[]) => mockCacheGet(...args),
    set: (...args: unknown[]) => mockCacheSet(...args),
  },
  EtaCacheService: jest.requireActual('../src/services/etaCacheService').EtaCacheService,
}));

import axios from 'axios';
import { encodeGeohash } from '../src/utils/geohash';
import { buildEtaCacheKey } from '../src/utils/etaCacheKey';
import { EtaCacheService } from '../src/services/etaCacheService';
import { routingService } from '../src/services/routingService';

const mockedAxiosGet = axios.get as jest.Mock;

describe('encodeGeohash', () => {
  it('produces a stable hash for the same coordinates', () => {
    expect(encodeGeohash(6.5244, 3.3792, 7)).toBe(encodeGeohash(6.5244, 3.3792, 7));
  });

  it('buckets nearby coordinates into the same hash at low precision', () => {
    const a = encodeGeohash(6.52441, 3.37921, 6);
    const b = encodeGeohash(6.52449, 3.37929, 6);
    expect(a).toBe(b);
  });
});

describe('buildEtaCacheKey', () => {
  it('includes geohashes and travel mode', () => {
    const key = buildEtaCacheKey(
      { lat: 6.5244, lng: 3.3792 },
      { lat: 6.455, lng: 3.3941 },
      'driving',
      7,
    );

    expect(key).toMatch(/^eta:[0-9a-z]+:[0-9a-z]+:driving$/);
  });
});

describe('EtaCacheService', () => {
  const mockRedisGet = jest.fn();
  const mockRedisSet = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');

    jest.spyOn(require('../src/config/redis'), 'getRedisClient').mockReturnValue({
      get: mockRedisGet,
      set: mockRedisSet,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns null on cache miss', async () => {
    const service = new EtaCacheService({ ttlSeconds: 300, geohashPrecision: 7 });
    const lookup = {
      pickup: { lat: 6.5244, lng: 3.3792 },
      dropoff: { lat: 6.455, lng: 3.3941 },
      travelMode: 'driving' as const,
    };

    const result = await service.get(lookup);
    expect(result).toBeNull();
    expect(mockRedisGet).toHaveBeenCalledTimes(1);
  });

  it('stores ETA JSON with TTL on set', async () => {
    const service = new EtaCacheService({ ttlSeconds: 300, geohashPrecision: 7 });
    const lookup = {
      pickup: { lat: 6.5244, lng: 3.3792 },
      dropoff: { lat: 6.455, lng: 3.3941 },
      travelMode: 'driving' as const,
    };
    const eta = {
      estimatedTime: 18,
      distance: 12.4,
      durationText: '18 mins',
      distanceText: '12.4 km',
      route: {
        distance: 12400,
        duration: 1080,
        distanceText: '12.4 km',
        durationText: '18 mins',
      },
    };

    await service.set(lookup, eta);

    expect(mockRedisSet).toHaveBeenCalledWith(
      expect.stringMatching(/^eta:/),
      JSON.stringify(eta),
      'EX',
      300,
    );
  });
});

describe('routingService.calculateETA', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.GOOGLE_MAPS_API_KEY;
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  it('returns cached ETA without calling external APIs on cache hit', async () => {
    const cached = {
      estimatedTime: 22,
      distance: 8.5,
      durationText: '22 mins',
      distanceText: '8.5 km',
      route: {
        distance: 8500,
        duration: 1320,
        distanceText: '8.5 km',
        durationText: '22 mins',
      },
    };
    mockCacheGet.mockResolvedValueOnce(cached);

    const result = await routingService.calculateETA({
      pickup: { lat: 6.5244, lng: 3.3792 },
      dropoff: { lat: 6.455, lng: 3.3941 },
    });

    expect(result).toEqual(cached);
    expect(mockedAxiosGet).not.toHaveBeenCalled();
    expect(mockCacheSet).not.toHaveBeenCalled();
  });

  it('computes ETA and writes to cache on miss', async () => {
    const result = await routingService.calculateETA({
      pickup: { lat: 6.5244, lng: 3.3792 },
      dropoff: { lat: 6.455, lng: 3.3941 },
      travelMode: 'driving',
    });

    expect(result.estimatedTime).toBeGreaterThan(0);
    expect(result.distance).toBeGreaterThan(0);
    expect(mockCacheGet).toHaveBeenCalledTimes(1);
    expect(mockCacheSet).toHaveBeenCalledTimes(1);
    expect(mockedAxiosGet).not.toHaveBeenCalled();
  });
});
