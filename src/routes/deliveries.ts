import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { updateDeliveryStatus } from '../controllers/deliveryStatusController';

const router = Router();

/**
 * @openapi
 * /v1/deliveries/{id}/status:
 *   put:
 *     tags: [Delivery Status]
 *     summary: Transition a delivery to its next status
 *     description: >
 *       Restricted to drivers and admins. Enforces a strict state machine:
 *       pending -> assigned -> picked_up -> in_transit -> delivered.
 *       Skipping states or transitioning a delivered delivery is rejected.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateDeliveryStatusRequest'
 *     responses:
 *       200:
 *         description: Status updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeliveryResponse'
 *       400:
 *         description: Invalid delivery id, invalid status value, or invalid transition
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.put('/:id/status', authenticate, authorize(['driver', 'admin']), updateDeliveryStatus);

export default router;
