import { Schema, model, Document, Types } from 'mongoose';

/**
 * Represents a single GPS coordinate pair.
 */
export interface ICoordinates {
  /** Latitude in decimal degrees (-90 to +90). */
  lat: number;
  /** Longitude in decimal degrees (-180 to +180). */
  lng: number;
}

/**
 * Mongoose document interface for a LocationUpdate record.
 *
 * A LocationUpdate is persisted whenever a driver sends a location
 * (either in real-time or as part of an offline catch-up batch).
 */
export interface ILocationUpdate extends Document {
  /** Reference to the driver (User._id). */
  driverId: Types.ObjectId;

  /**
   * Optional delivery/trip reference so updates can be scoped to a job.
   * Nullable — a driver may send updates outside of an active delivery.
   */
  deliveryId?: Types.ObjectId;

  /** GPS coordinates at the time of capture. */
  coordinates: ICoordinates;

  /**
   * Client-side timestamp (ms since epoch) at which the location was
   * captured on the device. Used for ordering offline batch updates.
   */
  capturedAt: Date;

  /**
   * Whether this record arrived via an offline sync batch (true) or was
   * sent live (false). Useful for analytics and audit trails.
   */
  isOfflineSync: boolean;

  /**
   * Processing status of this update.
   * - pending   : received but not yet processed downstream
   * - processed : acknowledged and forwarded (e.g., to tracking service)
   * - failed    : encountered an error during downstream processing
   */
  status: 'pending' | 'processed' | 'failed';

  /** Optional free-form error message when status === 'failed'. */
  errorMessage?: string;

  /** Mongoose-managed creation timestamp. */
  createdAt: Date;

  /** Mongoose-managed last-update timestamp. */
  updatedAt: Date;
}

const CoordinatesSchema = new Schema<ICoordinates>(
  {
    lat: {
      type: Number,
      required: true,
      min: -90,
      max: 90,
    },
    lng: {
      type: Number,
      required: true,
      min: -180,
      max: 180,
    },
  },
  { _id: false },
);

const LocationUpdateSchema = new Schema<ILocationUpdate>(
  {
    driverId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    deliveryId: {
      type: Schema.Types.ObjectId,
      ref: 'Delivery',
      index: true,
      default: null,
    },

    coordinates: {
      type: CoordinatesSchema,
      required: true,
    },

    capturedAt: {
      type: Date,
      required: true,
      index: true,
    },

    isOfflineSync: {
      type: Boolean,
      required: true,
      default: false,
    },

    status: {
      type: String,
      enum: ['pending', 'processed', 'failed'],
      default: 'pending',
      index: true,
    },

    errorMessage: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// ─── Compound indexes ──────────────────────────────────────────────────────────

// Efficiently fetch all pending updates for a driver sorted chronologically
LocationUpdateSchema.index({ driverId: 1, status: 1, capturedAt: 1 });

// Efficiently scope updates to a delivery
LocationUpdateSchema.index({ deliveryId: 1, capturedAt: 1 });

// ─── Model ────────────────────────────────────────────────────────────────────

export const LocationUpdate = model<ILocationUpdate>('LocationUpdate', LocationUpdateSchema);
