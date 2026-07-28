import { z } from 'zod';
import { DisputeReason } from '../models/Dispute';

export const createDisputeSchema = z.object({
  deliveryId: z.string({ error: 'deliveryId is required' }).trim().min(1, 'deliveryId is required'),
  reason: z.enum(DisputeReason, { error: 'A valid dispute reason is required' }),
  description: z
    .string({ error: 'description is required' })
    .trim()
    .min(10, 'description must be at least 10 characters')
    .max(2000, 'description must be at most 2000 characters'),
  evidenceUrls: z.array(z.url('Each evidence entry must be a valid URL')).max(10).optional(),
});

export type CreateDisputeInput = z.infer<typeof createDisputeSchema>;
