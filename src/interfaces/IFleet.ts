import { Document, Types } from 'mongoose';

export interface IFleet extends Document {
  name: string;
  ownerId: Types.ObjectId;
  drivers: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export enum FleetInvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
}

export interface IFleetInvitation extends Document {
  fleetId: Types.ObjectId;
  driverId: Types.ObjectId;
  invitedBy: Types.ObjectId;
  status: FleetInvitationStatus;
  respondedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
