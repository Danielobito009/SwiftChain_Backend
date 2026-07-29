import mongoose, { Schema } from 'mongoose';
import { IFleetInvitation, FleetInvitationStatus } from '../interfaces/IFleet';

const fleetInvitationSchema = new Schema<IFleetInvitation>(
  {
    fleetId: {
      type: Schema.Types.ObjectId,
      ref: 'Fleet',
      required: [true, 'fleetId is required'],
    },
    driverId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'driverId is required'],
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'invitedBy is required'],
    },
    status: {
      type: String,
      enum: Object.values(FleetInvitationStatus),
      default: FleetInvitationStatus.PENDING,
    },
    respondedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

// A driver should not have two simultaneous pending invitations to the same fleet.
fleetInvitationSchema.index(
  { fleetId: 1, driverId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: FleetInvitationStatus.PENDING } },
);
fleetInvitationSchema.index({ driverId: 1 });

const FleetInvitation = mongoose.model<IFleetInvitation>('FleetInvitation', fleetInvitationSchema);

export default FleetInvitation;
