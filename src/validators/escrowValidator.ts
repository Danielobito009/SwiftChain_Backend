import { z } from 'zod';

/**
 * Path params for `GET /api/v1/escrow/delivery/:id`.
 *
 * `id` may be a 24-character MongoDB ObjectId or the business `deliveryId`
 * key, so only generic length/charset constraints are enforced here; existence
 * is resolved in the service layer against the database.
 */
export const escrowByDeliveryParamsSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1, 'delivery id is required')
    .max(64, 'delivery id cannot exceed 64 characters')
    .regex(/^[A-Za-z0-9_-]+$/, 'delivery id contains invalid characters'),
});

export type EscrowByDeliveryParams = z.infer<typeof escrowByDeliveryParamsSchema>;
