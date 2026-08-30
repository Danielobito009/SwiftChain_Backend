import { Document, Model, Schema, Types, model } from 'mongoose';

/**
 * Administrative actions that must leave an immutable trail.
 *
 * Keeping this as a closed enum means an unrecognized action is rejected at
 * write time rather than silently producing an unqueryable audit record.
 */
export const AUDIT_ACTIONS = [
  'user.suspended',
  'user.reinstated',
  'user.role_changed',
  'user.deleted',
  'delivery.cancelled',
  'delivery.reassigned',
  'escrow.refunded',
  'escrow.released',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Collections an audit entry can point at. */
export const AUDIT_TARGET_TYPES = ['User', 'Delivery', 'Escrow'] as const;
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

export const AUDIT_STATUSES = ['success', 'failure'] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];

export interface IAuditLog {
  admin: Types.ObjectId;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: Types.ObjectId;
  status: AuditStatus;
  reason?: string;
  /** Field-level before/after snapshot, used to reconstruct what changed. */
  changes?: Record<string, { from: unknown; to: unknown }>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type IAuditLogDocument = IAuditLog & Document;

const auditLogSchema = new Schema<IAuditLogDocument>(
  {
    admin: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'The acting admin is required'],
      index: true,
    },
    action: {
      type: String,
      enum: {
        values: AUDIT_ACTIONS,
        message: '`{VALUE}` is not a recognized audit action',
      },
      required: [true, 'Action is required'],
      index: true,
    },
    targetType: {
      type: String,
      enum: {
        values: AUDIT_TARGET_TYPES,
        message: '`{VALUE}` is not a recognized audit target type',
      },
      required: [true, 'Target type is required'],
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: [true, 'Target id is required'],
      index: true,
    },
    status: {
      type: String,
      enum: AUDIT_STATUSES,
      default: 'success',
      index: true,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: [500, 'Reason must not exceed 500 characters'],
    },
    changes: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    ipAddress: { type: String, trim: true },
    userAgent: { type: String, trim: true, maxlength: 500 },
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

// Audit trails are read as "what did this admin do recently" and
// "what happened to this record", so both access paths are indexed.
auditLogSchema.index({ admin: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

/**
 * Audit records are append-only: once written they must never be mutated or
 * removed, otherwise the trail cannot be trusted. These guards make any such
 * attempt fail loudly instead of silently corrupting history.
 */
const blockMutation = function blockMutation(next: (error?: Error) => void): void {
  next(new Error('Audit log entries are immutable and cannot be modified or deleted'));
};

auditLogSchema.pre('updateOne', blockMutation);
auditLogSchema.pre('updateMany', blockMutation);
auditLogSchema.pre('findOneAndUpdate', blockMutation);
auditLogSchema.pre('deleteOne', blockMutation);
auditLogSchema.pre('deleteMany', blockMutation);
auditLogSchema.pre('findOneAndDelete', blockMutation);

export const AuditLog: Model<IAuditLogDocument> = model<IAuditLogDocument>(
  'AuditLog',
  auditLogSchema,
);

export default AuditLog;
