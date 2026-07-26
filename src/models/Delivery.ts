import mongoose, { Schema, Document } from 'mongoose';

export interface IDelivery extends Document {
  deliveryId: string;
  driverId: string;
  userId: string;
  trackingNumber?: string;
  customer?: ICustomer;
  pickup?: ILocation;
  dropoff?: ILocation;
  package?: IPackage;
  deliveryFee?: number;
  escrowAmount?: number;
  notes?: string;
  pickupCoordinates: {
    lat: number;
    lng: number;
    address: string;
  };
  dropoffCoordinates: {
    lat: number;
    lng: number;
    address: string;
  };
  status: DeliveryStatus;
  distance?: number;
  estimatedDuration?: number;
  actualDuration?: number;
  isDeleted?: boolean;
  deletedAt?: Date | null;
  deletedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  softDelete(userId?: string): Promise<this>;
  restore(): Promise<this>;
}

export enum DeliveryStatus {
  PENDING = 'pending',
  FUNDED = 'funded',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export interface ICustomer {
  name: string;
  phone: string;
  email?: string;
}

export interface ILocation {
  address: string;
  city?: string;
  state?: string;
  zipCode?: string;
  instructions?: string;
}

export interface IPackage {
  description: string;
  weight: number;
  size?: string;
  isFragile?: boolean;
  requiresSignature?: boolean;
}

const DeliverySchema = new Schema<IDelivery>(
  {
    deliveryId: { type: String, unique: true, sparse: true },
    driverId: { type: String },
    userId: { type: String },
    trackingNumber: { type: String, unique: true, sparse: true },
    customer: { type: Schema.Types.Mixed },
    pickup: { type: Schema.Types.Mixed },
    dropoff: { type: Schema.Types.Mixed },
    package: { type: Schema.Types.Mixed },
    deliveryFee: { type: Number },
    escrowAmount: { type: Number },
    notes: { type: String },
    pickupCoordinates: {
      lat: { type: Number },
      lng: { type: Number },
      address: { type: String },
    },
    dropoffCoordinates: {
      lat: { type: Number },
      lng: { type: Number },
      address: { type: String },
    },
    status: {
      type: String,
      enum: Object.values(DeliveryStatus),
      default: DeliveryStatus.PENDING,
    },
    distance: { type: Number },
    estimatedDuration: { type: Number },
    actualDuration: { type: Number },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String },
  },
  { timestamps: true, strict: false },
);

DeliverySchema.methods.softDelete = async function (
  this: IDelivery,
  userId?: string,
): Promise<IDelivery> {
  this.isDeleted = true;
  this.deletedAt = new Date();
  if (userId) {
    this.deletedBy = userId;
  }
  return this.save();
};

DeliverySchema.methods.restore = async function (this: IDelivery): Promise<IDelivery> {
  this.isDeleted = false;
  this.deletedAt = null;
  this.deletedBy = undefined;
  return this.save();
};

const Delivery = mongoose.model<IDelivery>('Delivery', DeliverySchema);

export default Delivery;
export { Delivery };
