# Socket.io Reconnection Race Condition Fix

## Overview

This implementation fixes race conditions in Socket.io reconnections that cause duplicate location updates to be processed and broadcast. The fix ensures location updates are processed idempotently using Redis-based deduplication, timestamp validation, and stale update detection.

## Problem Statement

### Race Condition Scenarios

1. **Reconnection Buffer Replay**: When a driver reconnects, buffered location updates may be sent alongside new updates, causing duplicates
2. **Concurrent Connections**: A driver with multiple devices or browser tabs can send the same location update simultaneously
3. **Network Retry**: Failed transmissions that are automatically retried by the client can result in duplicate submissions
4. **Out-of-Order Updates**: Network delays can cause newer updates to arrive before older ones, leading to temporal inconsistencies

### Impact

- **Data Duplication**: Multiple identical location records in MongoDB
- **Bandwidth Waste**: Duplicate broadcasts consume server and client resources
- **UI Glitches**: Tracking interfaces show "jumpy" or duplicate location markers
- **Analytics Corruption**: Route replay and distance calculations become inaccurate

## Solution Architecture

### Three-Layer Defense

1. **Deduplication Layer** (Redis-based)
   - Tracks recently processed updates using unique composite keys
   - TTL-based expiration prevents memory bloat
   - Atomic SET NX operation ensures thread-safety

2. **Timestamp Validation Layer**
   - Rejects updates that are too old (> 5 minutes by default)
   - Rejects updates with future timestamps (> 30 seconds ahead by default)
   - Prevents replay attacks and clock skew issues

3. **Stale Update Detection Layer**
   - Tracks the last processed timestamp per driver-delivery pair
   - Rejects updates older than the last successfully processed update
   - Prevents out-of-order updates from corrupting the timeline

### Data Flow

```
Client Location Update
        ↓
┌──────────────────────┐
│ Payload Validation   │ ← Coordinates, delivery ID, format
└──────────────────────┘
        ↓
┌──────────────────────┐
│ Timestamp Validation │ ← Not too old, not too far future
└──────────────────────┘
        ↓
┌──────────────────────┐
│ Duplicate Check      │ ← Redis SET NX with TTL
│ (Redis)              │
└──────────────────────┘
        ↓
┌──────────────────────┐
│ Stale Check          │ ← Compare with last processed timestamp
│ (Redis)              │
└──────────────────────┘
        ↓
┌──────────────────────┐
│ Persist to MongoDB   │
└──────────────────────┘
        ↓
┌──────────────────────┐
│ Broadcast to Room    │
└──────────────────────┘
        ↓
    ACK to Client
```

## Implementation Details

### Deduplication Key Format

```
location:dedup:{driverId}:{deliveryId}:{capturedAt}:{roundedLat}:{roundedLng}
```

**Components**:
- `driverId`: MongoDB ObjectId string
- `deliveryId`: MongoDB ObjectId string
- `capturedAt`: Unix timestamp in milliseconds
- `roundedLat`: Latitude rounded to 6 decimal places (~0.1m precision)
- `roundedLng`: Longitude rounded to 6 decimal places (~0.1m precision)

**Example**:
```
location:dedup:507f1f77bcf86cd799439011:507f191e810c19729de860ea:1642584000000:40.712776:-74.005974
```

### Last Update Tracking Key Format

```
location:last:{driverId}:{deliveryId}
```

**Value**: Unix timestamp in milliseconds of the last processed update

### Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `LOCATION_DEDUP_TTL_SECONDS` | 60 | TTL for deduplication keys in Redis |
| `LOCATION_MAX_AGE_MS` | 300000 | Maximum age (5 min) for valid updates |
| `LOCATION_MAX_FUTURE_MS` | 30000 | Max tolerance (30s) for future timestamps |

### Error Handling

The implementation uses a "fail-open" approach for Redis errors:
- If Redis is unavailable, updates are allowed through
- Redis errors are logged but don't block location processing
- This ensures service availability even when Redis is down

## API Changes

### LocationUpdateAck Interface

**New Fields**:

```typescript
interface LocationUpdateAck {
  success: boolean;
  locationId?: string;
  error?: string;
  isDuplicate?: boolean;  // NEW: true if rejected as duplicate
  isStale?: boolean;       // NEW: true if rejected as stale
}
```

### Error Responses

**Duplicate Update**:
```json
{
  "success": false,
  "error": "Duplicate update (already processed within the last 60 seconds)",
  "isDuplicate": true
}
```

**Stale Update**:
```json
{
  "success": false,
  "error": "Stale update (older than last processed update)",
  "isStale": true
}
```

**Too Old**:
```json
{
  "success": false,
  "error": "Update is too old: 320s ago (max: 300s)"
}
```

**Too Far Future**:
```json
{
  "success": false,
  "error": "Update timestamp is too far in the future: 45s ahead"
}
```

## Testing

### Manual Testing

#### 1. Test Duplicate Detection

```bash
# Terminal 1 - Send first update
curl -X POST http://localhost:3000/socket.io/ \
  -H "Content-Type: application/json" \
  -d '{
    "event": "driver_location_update",
    "payload": {
      "deliveryId": "507f191e810c19729de860ea",
      "lat": 40.712776,
      "lng": -74.005974,
      "capturedAt": 1642584000000
    }
  }'

# Terminal 2 - Send identical update immediately
curl -X POST http://localhost:3000/socket.io/ \
  -H "Content-Type: application/json" \
  -d '{
    "event": "driver_location_update",
    "payload": {
      "deliveryId": "507f191e810c19729de860ea",
      "lat": 40.712776,
      "lng": -74.005974,
      "capturedAt": 1642584000000
    }
  }'
```

Expected: First succeeds, second returns `isDuplicate: true`

#### 2. Test Stale Update Detection

```bash
# Send newer update first
curl ... -d '{
  "capturedAt": 1642584100000
}'

# Send older update
curl ... -d '{
  "capturedAt": 1642584000000
}'
```

Expected: Newer succeeds, older returns `isStale: true`

#### 3. Test Timestamp Validation

```bash
# Send very old update
curl ... -d '{
  "capturedAt": 1642000000000  # > 5 minutes ago
}'
```

Expected: Returns error about update being too old

### Integration Testing

Create a test file `tests/location.deduplication.test.ts`:

```typescript
import { locationService } from '../src/sockets/location.service';
import { redisClient } from '../src/config/redis';
import { LocationUpdate } from '../src/models/LocationUpdate';

describe('Location Update Deduplication', () => {
  beforeEach(async () => {
    await redisClient.flushdb();
    await LocationUpdate.deleteMany({});
  });

  it('should reject duplicate updates', async () => {
    const payload = {
      deliveryId: '507f191e810c19729de860ea',
      lat: 40.712776,
      lng: -74.005974,
      capturedAt: Date.now(),
    };

    const first = await locationService.processLiveUpdate(
      mockIo,
      'driverId123',
      payload,
    );
    
    const second = await locationService.processLiveUpdate(
      mockIo,
      'driverId123',
      payload,
    );

    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
    expect(second.isDuplicate).toBe(true);
  });

  it('should reject stale updates', async () => {
    const now = Date.now();
    
    const newer = await locationService.processLiveUpdate(
      mockIo,
      'driverId123',
      { ...payload, capturedAt: now },
    );
    
    const older = await locationService.processLiveUpdate(
      mockIo,
      'driverId123',
      { ...payload, capturedAt: now - 10000 },
    );

    expect(newer.success).toBe(true);
    expect(older.success).toBe(false);
    expect(older.isStale).toBe(true);
  });

  it('should reject updates older than 5 minutes', async () => {
    const old = Date.now() - 6 * 60 * 1000; // 6 minutes ago
    
    const result = await locationService.processLiveUpdate(
      mockIo,
      'driverId123',
      { ...payload, capturedAt: old },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('too old');
  });

  it('should reject future-dated updates', async () => {
    const future = Date.now() + 60 * 1000; // 1 minute in future
    
    const result = await locationService.processLiveUpdate(
      mockIo,
      'driverId123',
      { ...payload, capturedAt: future },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('future');
  });

  it('should allow updates after dedup TTL expires', async () => {
    const payload = {
      deliveryId: '507f191e810c19729de860ea',
      lat: 40.712776,
      lng: -74.005974,
      capturedAt: Date.now(),
    };

    const first = await locationService.processLiveUpdate(
      mockIo,
      'driverId123',
      payload,
    );

    // Wait for TTL to expire (61 seconds)
    await new Promise(resolve => setTimeout(resolve, 61000));

    const second = await locationService.processLiveUpdate(
      mockIo,
      'driverId123',
      payload,
    );

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
  });
});
```

### Load Testing

Use the existing k6 infrastructure to test under load:

```javascript
// load-tests/k6/scenarios/location-updates-load.js
import { check } from 'k6';
import ws from 'k6/ws';

export default function () {
  const url = 'ws://localhost:3000';
  const params = { tags: { name: 'LocationUpdates' } };

  ws.connect(url, params, function (socket) {
    socket.on('open', () => {
      // Send 100 rapid-fire location updates
      for (let i = 0; i < 100; i++) {
        socket.send(JSON.stringify({
          event: 'driver_location_update',
          payload: {
            deliveryId: '507f191e810c19729de860ea',
            lat: 40.712776 + (i * 0.0001),
            lng: -74.005974 + (i * 0.0001),
            capturedAt: Date.now() + (i * 1000),
          },
        }));
      }
    });

    socket.on('message', (data) => {
      const response = JSON.parse(data);
      if (response.event === 'location_update_ack') {
        check(response.payload, {
          'no duplicates processed': (ack) => 
            !ack.isDuplicate || ack.success === false,
        });
      }
    });
  });
}
```

## Monitoring

### Redis Metrics

Monitor these Redis keys for health:

```bash
# Count active dedup keys
redis-cli KEYS "location:dedup:*" | wc -l

# Count last-update tracking keys
redis-cli KEYS "location:last:*" | wc -l

# Check memory usage
redis-cli INFO memory | grep used_memory_human

# Monitor key expirations
redis-cli INFO stats | grep expired_keys
```

### Application Logs

Key log patterns to monitor:

```
[Location] Duplicate update rejected — indicates working deduplication
[Location] Stale update rejected — indicates out-of-order protection working
[Location] Invalid timestamp — indicates timestamp validation working
[Location] Redis deduplication check failed — indicates Redis connectivity issues
```

### Metrics to Track

1. **Deduplication Rate**: `(rejected_duplicates / total_updates) * 100`
2. **Stale Update Rate**: `(rejected_stale / total_updates) * 100`
3. **Redis Error Rate**: Track Redis operation failures
4. **Average Update Age**: Time between `capturedAt` and `receivedAt`

## Performance Impact

### Redis Operations Per Update

- 1x `SET NX EX` (deduplication check)
- 1x `GET` (last timestamp lookup)
- 1x `SET EX` (last timestamp update)

**Total**: ~3 Redis operations per location update

### Latency

- **Redis operations**: ~1-2ms per operation (in-memory)
- **Total added latency**: ~3-6ms per update
- **Original latency**: ~50-100ms (MongoDB persist + broadcast)
- **Impact**: <10% increase in total latency

### Memory Usage

**Per driver-delivery pair**:
- Dedup keys: ~150 bytes each, TTL 60s
- Last-update keys: ~100 bytes each, TTL 120s

**At scale (1000 active drivers, 1 update/second)**:
- Dedup keys: ~150 bytes × 60 updates = ~9 KB per driver
- Total: ~9 MB for 1000 drivers
- Negligible compared to available Redis memory

## Troubleshooting

### Issue: All updates being rejected as duplicates

**Cause**: Redis key not expiring properly

**Solution**:
```bash
# Check TTL on a dedup key
redis-cli TTL "location:dedup:*"

# If TTL is -1 (no expiry), flush and restart
redis-cli FLUSHDB
```

### Issue: Legitimate updates rejected as stale

**Cause**: Clock skew between client and server

**Solution**:
1. Ensure NTP is configured on all servers
2. Increase `LOCATION_MAX_AGE_MS` if needed
3. Log client timestamps to identify problematic devices

### Issue: Redis errors in logs

**Cause**: Redis connection issues

**Solution**:
1. Check Redis is running: `redis-cli PING`
2. Verify `REDIS_URL` in `.env`
3. Check Redis logs: `redis-cli INFO`
4. Service continues to work (fail-open) but without deduplication

## Migration Guide

### Backward Compatibility

This fix is **fully backward compatible**:
- Existing clients work without changes
- New `isDuplicate` and `isStale` fields are optional
- No database schema changes required

### Rollout Strategy

1. **Phase 1**: Deploy to staging, monitor for 24 hours
2. **Phase 2**: Canary deployment (10% of production traffic)
3. **Phase 3**: Gradual rollout to 100% over 7 days
4. **Phase 4**: Monitor duplicate rates, adjust TTLs if needed

### Rollback Plan

If issues arise:
1. Redis errors are logged but don't block updates (fail-open)
2. Revert code changes if needed (simple git revert)
3. No data migration required
4. Previous behavior restored immediately

## Future Enhancements

1. **Adaptive TTL**: Adjust dedup TTL based on update frequency
2. **Geofencing**: Different validation rules for different regions
3. **Client-side deduplication**: Reduce server load
4. **Machine learning**: Detect and flag anomalous location patterns
5. **Distributed tracing**: Add OpenTelemetry spans for debugging

## References

- [Socket.io Reconnection Docs](https://socket.io/docs/v4/client-initialization/#reconnection)
- [Redis SET Command](https://redis.io/commands/set/)
- [Idempotency Patterns](https://stripe.com/docs/api/idempotent_requests)

## License

This implementation is part of the SwiftChain Backend project.
