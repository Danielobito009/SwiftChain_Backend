import { z } from 'zod';

const contactSchema = z.object({
  name: z.string().min(1, 'name is required').trim(),
  contact: z.string().min(1, 'contact is required').trim(),
  address: z.string().min(1, 'address is required').trim(),
});

export const createDeliverySchema = z.object({
  sender: contactSchema,
  recipient: contactSchema,
  packageDescription: z.string().min(1, 'packageDescription is required').trim(),
  weight: z.number().positive().optional(),
  estimatedValue: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

export const updateDeliverySchema = z
  .object({
    sender: contactSchema.partial().optional(),
    recipient: contactSchema.partial().optional(),
    packageDescription: z.string().min(1).trim().optional(),
    weight: z.number().positive().optional(),
    estimatedValue: z.number().nonnegative().optional(),
    notes: z.string().optional(),
    status: z.enum(['pending', 'assigned', 'in_transit', 'delivered', 'cancelled']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Request body must not be empty' });

export const updateDeliveryStatusSchema = z.object({
  status: z.enum(['pending', 'assigned', 'in_transit', 'delivered', 'cancelled']),
});

export const assignDriverSchema = z.object({
  driverId: z.string().min(1, 'driverId is required').trim(),
});
