import mongoose, { Document, Model, Schema } from 'mongoose';

export type DeliveryStatus = 'pending' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered';

export interface DeliveryDocument extends Document {
  customerName: string;
  pickupLocation: string;
  dropoffLocation: string;
  packageDetails: string;
  status: DeliveryStatus;
  assignedDriver?: string;
  createdAt: Date;
  updatedAt: Date;
}

const deliverySchema = new Schema<DeliveryDocument>(
  {
    customerName: { type: String, required: true, trim: true },
    pickupLocation: { type: String, required: true, trim: true },
    dropoffLocation: { type: String, required: true, trim: true },
    packageDetails: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['pending', 'assigned', 'picked_up', 'in_transit', 'delivered'],
      default: 'pending',
      required: true,
    },
    assignedDriver: { type: String, default: null },
  },
  {
    timestamps: true,
  },
);

// ─── Indexes ────────────────────────────────────────────────────────────────
// Status is looked up and transitioned on every PUT /api/v1/deliveries/:id/status
// call (src/controllers/deliveryStatusController.ts); a single-field index
// supports filtering/listing deliveries by their current status.
deliverySchema.index({ status: 1 });

// Supports the natural "a driver's assigned deliveries" access pattern once a
// driver-facing listing endpoint queries this collection by assignedDriver.
deliverySchema.index({ assignedDriver: 1 });

export const Delivery =
  (mongoose.models.DeliveryLegacy as Model<DeliveryDocument>) ||
  mongoose.model<DeliveryDocument>('DeliveryLegacy', deliverySchema);
