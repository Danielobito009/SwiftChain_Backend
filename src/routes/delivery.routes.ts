import { Router } from 'express';
import { deliveryController } from '../controllers/delivery.controller';
import { validateRequest } from '../middlewares/validateRequest';
import {
  createDeliverySchema,
  updateDeliverySchema,
} from '../validators/deliveryValidator';

const router = Router();

/**
 * @openapi
 * /v1/deliveries:
 *   post:
 *     tags: [Deliveries]
 *     summary: Create a new delivery
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateDeliveryRequest'
 *     responses:
 *       201:
 *         description: Delivery created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeliveryResponse'
 *       409:
 *         description: A delivery with this tracking number already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   get:
 *     tags: [Deliveries]
 *     summary: List deliveries
 *     description: Returns non-archived deliveries, optionally filtered and paginated.
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, assigned, in_progress, completed, cancelled]
 *       - in: query
 *         name: driver
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Matches against tracking number
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Paginated list of deliveries
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeliveryListResponse'
 */
router.post(
  '/',
  validateRequest({ body: createDeliverySchema }),
  deliveryController.create.bind(deliveryController)
);

router.get('/', deliveryController.list.bind(deliveryController));

/**
 * @openapi
 * /v1/deliveries/archived:
 *   get:
 *     tags: [Deliveries]
 *     summary: List archived (soft-deleted) deliveries
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Paginated list of archived deliveries
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeliveryListResponse'
 */
router.get(
  '/archived',
  deliveryController.listArchived.bind(deliveryController)
);

/**
 * @openapi
 * /v1/deliveries/{id}:
 *   get:
 *     tags: [Deliveries]
 *     summary: Get a delivery by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Delivery found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeliveryResponse'
 *       400:
 *         description: Invalid delivery id format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *   patch:
 *     tags: [Deliveries]
 *     summary: Update a delivery
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
 *             $ref: '#/components/schemas/UpdateDeliveryRequest'
 *     responses:
 *       200:
 *         description: Delivery updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeliveryResponse'
 *       400:
 *         description: Invalid delivery id format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/:id', deliveryController.getById.bind(deliveryController));

router.patch(
  '/:id',
  validateRequest({ body: updateDeliverySchema }),
  deliveryController.update.bind(deliveryController)
);

/**
 * @openapi
 * /v1/deliveries/{id}/archive:
 *   patch:
 *     tags: [Deliveries]
 *     summary: Archive (soft-delete) a delivery
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Delivery archived
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeliveryResponse'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: Delivery is already archived
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch(
  '/:id/archive',
  deliveryController.archive.bind(deliveryController)
);

/**
 * @openapi
 * /v1/deliveries/{id}/restore:
 *   patch:
 *     tags: [Deliveries]
 *     summary: Restore an archived delivery
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Delivery restored
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeliveryResponse'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: Delivery is not archived
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch(
  '/:id/restore',
  deliveryController.restore.bind(deliveryController)
);

export default router;