import { Document, Model, Schema, Types, model } from 'mongoose';

/** Lifecycle states a delivery moves through. */
export const DELIVERY_STATUSES = [
  'pending',
  'accepted',
  'in_transit',
  'delivered',
  'cancelled',
  'disputed',
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export interface IDelivery {
  reference: string;
  sender: Types.ObjectId;
  courier?: Types.ObjectId;
  pickupAddress: string;
  dropoffAddress: string;
  status: DeliveryStatus;
  amount: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

export type IDeliveryDocument = IDelivery & Document;

const deliverySchema = new Schema<IDeliveryDocument>(
  {
    reference: {
      type: String,
      required: [true, 'Delivery reference is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Sender is required'],
      index: true,
    },
    courier: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    pickupAddress: {
      type: String,
      required: [true, 'Pickup address is required'],
      trim: true,
      maxlength: [250, 'Pickup address must not exceed 250 characters'],
    },
    dropoffAddress: {
      type: String,
      required: [true, 'Dropoff address is required'],
      trim: true,
      maxlength: [250, 'Dropoff address must not exceed 250 characters'],
    },
    status: {
      type: String,
      enum: DELIVERY_STATUSES,
      default: 'pending',
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Delivery amount is required'],
      min: [0, 'Delivery amount cannot be negative'],
    },
    currency: {
      type: String,
      default: 'XLM',
      trim: true,
      uppercase: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>): Record<string, unknown> => {
        ret.id = ret._id?.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Compound index backing the common "my deliveries, newest first" access path.
deliverySchema.index({ sender: 1, createdAt: -1 });
deliverySchema.index({ status: 1, createdAt: -1 });

export const Delivery: Model<IDeliveryDocument> = model<IDeliveryDocument>(
  'Delivery',
  deliverySchema,
);

export default Delivery;
