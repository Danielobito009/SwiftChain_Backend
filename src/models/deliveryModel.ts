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

export const Delivery =
  (mongoose.models.DeliveryLegacy as Model<DeliveryDocument>) ||
  mongoose.model<DeliveryDocument>('DeliveryLegacy', deliverySchema);
