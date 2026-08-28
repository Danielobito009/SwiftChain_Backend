import { Router } from 'express';
import { circuitBreakerController } from '../controllers/circuitBreakerController';

/**
 * Health routes.
 *
 * Mounted at /api/v1/health by the root router.
 *
 * Endpoints:
 *   GET /api/v1/health/circuit-breakers — live state of all circuit breakers
 */
const router = Router();

/**
 * @openapi
 * /v1/health/circuit-breakers:
 *   get:
 *     tags: [Health]
 *     summary: Get circuit breaker states
 *     description: |
 *       Returns the runtime state and rolling statistics for every circuit
 *       breaker registered in the process (Google Maps, Soroban RPC, etc.).
 *
 *       Useful for monitoring dashboards and alerting pipelines to detect
 *       when an external dependency is degraded without waiting for a full
 *       outage to surface in application logs.
 *     responses:
 *       200:
 *         description: All circuit breakers are CLOSED (healthy)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CircuitBreakerStatusResponse'
 *       206:
 *         description: One or more circuit breakers are OPEN or HALF-OPEN (degraded)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CircuitBreakerStatusResponse'
 */
router.get(
  '/circuit-breakers',
  circuitBreakerController.getStatus.bind(circuitBreakerController),
);

export default router;
