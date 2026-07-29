import mongoose, { Schema, Document } from 'mongoose';

export interface IDelivery extends Document {
  deliveryId: string;
  status: string;
  contractId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DeliverySchema: Schema = new Schema(
  {
    deliveryId: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      required: true,
      default: 'Pending',
      enum: ['Pending', 'Assigned', 'Picked Up', 'In Transit', 'Delivered'],
    },
    contractId: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

export const Delivery = mongoose.model<IDelivery>('Delivery', DeliverySchema);
