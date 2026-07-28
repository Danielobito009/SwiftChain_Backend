import { Document } from 'mongoose';

export enum UserRole {
  USER = 'user',
  DRIVER = 'driver',
  ADMIN = 'admin',
  ENTERPRISE = 'enterprise',
}

export enum UserStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  BANNED = 'banned',
}

export interface IUser extends Document {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  status: UserStatus;
  suspendedReason?: string;
  suspendedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

export interface ILoginPayload {
  email: string;
  password: string;
}

export interface IAuthResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
  };
  token: string;
}
