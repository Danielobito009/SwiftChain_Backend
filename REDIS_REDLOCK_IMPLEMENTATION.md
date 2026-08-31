# Redis Redlock Implementation for Escrow Release

## Overview

This implementation adds distributed locking using Redis and the Redlock algorithm to prevent concurrent requests from releasing the same escrow twice. This is critical for maintaining data consistency and preventing double-spending in the escrow system.

## Architecture

### Components

1. **Redis Configuration** (`src/config/redis.ts`)
   - Redis client initialization with `ioredis`
   - Redlock instance configuration
   - Lock acquisition and release utilities
   - Graceful connection/disconnection handling

2. **Service Layer** (`src/services/escrow.service.ts`)
   - `releaseEscrow()` method with distributed locking
   - Idempotent transaction handling
   - Lock-protected critical section

3. **Controller Layer** (`src/controllers/escrow.controller.ts`)
   - `release()` endpoint handler
   - Request validation
   - Error handling

4. **Routes** (`src/routes/escrow.routes.ts`)
   - POST `/api/v1/escrow/release` endpoint

## How It Works

### Distributed Locking Flow

```
Client Request → Controller → Service Layer
                                    ↓
                            Acquire Lock (Redis)
                                    ↓
                            Critical Section:
                            - Validate escrow status
                            - Check transaction hash
                            - Update escrow status
                            - Update delivery status
                                    ↓
                            Release Lock (Redis)
                                    ↓
                            Return Response
```

### Lock Mechanism

1. **Lock Acquisition**: Before processing an escrow release, the system acquires a distributed lock using the resource key `escrow:release:{escrowId}`

2. **Lock TTL**: Locks automatically expire after `REDIS_LOCK_TTL_MS` (default: 10 seconds) to prevent deadlocks

3. **Retry Logic**: If lock acquisition fails, the system retries `REDIS_LOCK_RETRY_COUNT` times with `REDIS_LOCK_RETRY_DELAY_MS` between attempts

4. **Automatic Release**: Locks are automatically released after the critical section completes, whether successful or not

### Race Condition Prevention

The implementation prevents the following race conditions:

- **Concurrent Release Requests**: Two simultaneous requests to release the same escrow
- **Double Spending**: Releasing funds twice due to race conditions
- **Status Inconsistency**: Concurrent status updates causing data corruption

## Configuration

### Environment Variables

Add the following to your `.env` file:

```env
# Redis connection URL
REDIS_URL=redis://localhost:6379

# Lock TTL in milliseconds (default: 10000)
REDIS_LOCK_TTL_MS=10000

# Maximum retry attempts for lock acquisition (default: 3)
REDIS_LOCK_RETRY_COUNT=3

# Delay between retry attempts in milliseconds (default: 200)
REDIS_LOCK_RETRY_DELAY_MS=200
```

### Redis Setup

#### Local Development

```bash
# Using Docker
docker run -d -p 6379:6379 redis:7-alpine

# Or using Redis CLI
redis-server
```

#### Production

For production environments, consider:
- Redis Cluster for high availability
- Redis Sentinel for automatic failover
- Multiple Redis instances for Redlock
- Persistent storage configuration

## API Usage

### Release Escrow Endpoint

**Endpoint**: `POST /api/v1/escrow/release`

**Request Body**:
```json
{
  "escrowId": "507f1f77bcf86cd799439011",
  "transactionHash": "0xabc123...",
  "ledger": 12345
}
```

**Success Response** (200 OK):
```json
{
  "status": "success",
  "message": "Escrow released successfully",
  "data": {
    "escrow": {
      "_id": "507f1f77bcf86cd799439011",
      "contractId": "CABC123...",
      "amount": 1000,
      "asset": "XLM",
      "lockStatus": "released",
      "transactions": [
        {
          "hash": "0xabc123...",
          "type": "release",
          "ledger": 12345,
          "recordedAt": "2024-01-15T10:30:00.000Z"
        }
      ],
      "releasedAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

**Error Responses**:

- **400 Bad Request**: Invalid input parameters
- **404 Not Found**: Escrow not found
- **409 Conflict**: Escrow already released or in invalid state
- **500 Internal Server Error**: Lock acquisition failed or system error

### Error Scenarios

#### Lock Acquisition Failure

If the lock cannot be acquired after all retries:

```json
{
  "status": "error",
  "message": "Failed to acquire lock for escrow:release:507f1f77bcf86cd799439011"
}
```

#### Already Released

If attempting to release an already-released escrow:

```json
{
  "status": "error",
  "message": "Escrow has already been released"
}
```

#### Invalid State

If escrow is not in LOCKED state:

```json
{
  "status": "error",
  "message": "Escrow cannot be released from status: pending"
}
```

## Testing

### Manual Testing

1. **Start Redis**:
   ```bash
   docker run -d -p 6379:6379 redis:7-alpine
   ```

2. **Start the application**:
   ```bash
   npm run dev
   ```

3. **Create test escrow** (fund it first):
   ```bash
   # Create and fund escrow through your existing flow
   ```

4. **Test concurrent releases** (simulate race condition):
   ```bash
   # Terminal 1
   curl -X POST http://localhost:3000/api/v1/escrow/release \
     -H "Content-Type: application/json" \
     -d '{
       "escrowId": "YOUR_ESCROW_ID",
       "transactionHash": "tx_hash_1",
       "ledger": 12345
     }'

   # Terminal 2 (run immediately after Terminal 1)
   curl -X POST http://localhost:3000/api/v1/escrow/release \
     -H "Content-Type: application/json" \
     -d '{
       "escrowId": "YOUR_ESCROW_ID",
       "transactionHash": "tx_hash_2",
       "ledger": 12346
     }'
   ```

   Expected: One request succeeds, the other fails with lock acquisition error or conflict

### Load Testing

Use the existing k6 load testing infrastructure:

```bash
cd load-tests
npm run load:deliveries
```

## Monitoring

### Redis Health Check

The health endpoint now includes Redis status:

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "success",
  "message": "SwiftChain-Backend is running",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "mongodb": "connected",
  "redis": "ready"
}
```

### Redis Status Values

- `ready`: Connected and ready to accept commands
- `connecting`: Connection in progress
- `reconnecting`: Attempting to reconnect
- `disconnecting`: Closing connection
- `end`: Connection closed

### Logging

The implementation includes comprehensive logging:

- **Debug**: Lock acquisition/release events
- **Info**: Successful escrow releases
- **Warn**: Lock acquisition failures, already-released escrows
- **Error**: Critical errors during release process

Example log output:
```
[2024-01-15 10:30:00] [INFO] [EscrowService] Attempting to release escrow — id=507f1f77bcf86cd799439011 tx=0xabc123
[2024-01-15 10:30:00] [DEBUG] [Redlock] Acquiring lock for resource: escrow:release:507f1f77bcf86cd799439011
[2024-01-15 10:30:00] [DEBUG] [Redlock] Lock acquired for resource: escrow:release:507f1f77bcf86cd799439011
[2024-01-15 10:30:00] [INFO] [EscrowService] Escrow released successfully — id=507f1f77bcf86cd799439011 contract=CABC123 tx=0xabc123
[2024-01-15 10:30:00] [DEBUG] [Redlock] Lock released for resource: escrow:release:507f1f77bcf86cd799439011
```

## Performance Considerations

### Lock TTL

The default lock TTL of 10 seconds is suitable for most scenarios. Adjust based on:
- Average escrow release time
- Network latency
- Database query performance

### Retry Strategy

The retry mechanism uses exponential backoff with jitter:
- Base delay: 200ms
- Jitter: ±100ms
- Max retries: 3

### Redis Performance

- **Single Redis Instance**: Suitable for development and moderate production loads
- **Redis Cluster**: Recommended for high-availability production deployments
- **Connection Pooling**: ioredis handles connection pooling automatically

## Troubleshooting

### Redis Connection Failures

**Issue**: Application fails to start due to Redis connection error

**Solution**:
1. Verify Redis is running: `redis-cli ping` (should return "PONG")
2. Check `REDIS_URL` in `.env` file
3. For development, the application continues without Redis (with warning)
4. For production, Redis connection is required

### Lock Timeout

**Issue**: Lock acquisition times out during high load

**Solution**:
1. Increase `REDIS_LOCK_RETRY_COUNT` in `.env`
2. Increase `REDIS_LOCK_RETRY_DELAY_MS` in `.env`
3. Scale Redis infrastructure (cluster/sentinel)

### Deadlocks

**Issue**: Locks not being released properly

**Solution**:
- Locks automatically expire after TTL
- Check application logs for lock release errors
- Monitor Redis for stale keys: `redis-cli KEYS "escrow:release:*"`

## Security Considerations

### Lock Key Naming

Lock keys use the pattern: `escrow:release:{escrowId}`
- Unique per escrow
- Prevents cross-escrow lock collisions
- Easy to identify in Redis

### Authentication

The release endpoint should be protected with appropriate authentication/authorization:
- Add authentication middleware to the route
- Verify user permissions before allowing release
- Audit log all release attempts

### Redis Security

For production:
- Enable Redis AUTH: `requirepass your_password`
- Use TLS for Redis connections
- Network isolation (VPC/private network)
- Regular security updates

## Future Enhancements

1. **Multiple Redis Instances**: Extend Redlock to use 3+ Redis instances for higher fault tolerance
2. **Lock Metrics**: Add Prometheus metrics for lock acquisition times and failures
3. **Circuit Breaker**: Implement circuit breaker pattern for Redis failures
4. **Lock Monitoring**: Dashboard for active locks and lock history
5. **Automatic Unlock**: Admin endpoint to manually release stuck locks

## References

- [Redlock Algorithm](https://redis.io/topics/distlock)
- [ioredis Documentation](https://github.com/luin/ioredis)
- [node-redlock Library](https://github.com/mike-marcacci/node-redlock)

## License

This implementation is part of the SwiftChain Backend project.
