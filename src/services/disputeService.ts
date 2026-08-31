import Escrow, { IEscrow } from '../models/Escrow';
import Dispute, { IDispute } from '../models/Dispute';
import AuditLog from '../models/AuditLog';
import mongoose from 'mongoose';

class DisputeService {
  public async lockEscrow(escrowId: string, adminId: string, reason: string): Promise<IDispute> {
    if (!mongoose.Types.ObjectId.isValid(escrowId)) {
      throw new Error('Invalid escrow id');
    }

    const escrow = await Escrow.findById(escrowId);
    if (!escrow) {
      throw new Error('Escrow not found');
    }

    if (escrow.locked) {
      throw new Error('Escrow already locked');
    }

    // Mark escrow as locked
    escrow.locked = true;
    escrow.status = 'locked';
    await escrow.save();

    // Create dispute record
    const dispute = await Dispute.create({
      escrow: escrow._id,
      reason,
      status: 'locked',
      createdBy: adminId ? new mongoose.Types.ObjectId(adminId) : undefined,
      lockedAt: new Date(),
      history: [
        {
          actor: adminId ? new mongoose.Types.ObjectId(adminId) : null,
          action: 'locked_escrow',
          notes: reason,
          timestamp: new Date(),
        },
      ],
    });

    // Audit log
    await AuditLog.create({
      action: 'escrow_locked',
      actor: adminId ? new mongoose.Types.ObjectId(adminId) : null,
      targetType: 'Escrow',
      targetId: escrow._id,
      description: `Escrow ${escrow._id} locked due to dispute: ${reason}`,
      meta: { disputeId: dispute._id.toString() },
    });

    return dispute;
  }

  public async resolveDispute(disputeId: string, action: 'refund' | 'release', adminId: string, notes?: string): Promise<{ dispute: IDispute; escrow: IEscrow }>
  {
    if (!mongoose.Types.ObjectId.isValid(disputeId)) {
      throw new Error('Invalid dispute id');
    }

    const dispute = await Dispute.findById(disputeId);
    if (!dispute) {
      throw new Error('Dispute not found');
    }

    if (dispute.status === 'resolved') {
      throw new Error('Dispute already resolved');
    }

    const escrow = await Escrow.findById(dispute.escrow);
    if (!escrow) {
      throw new Error('Associated escrow not found');
    }

    // Perform resolution: update escrow status
    if (action === 'refund') {
      escrow.status = 'refunded';
    } else {
      escrow.status = 'released';
    }
    escrow.locked = false;
    await escrow.save();

    // Update dispute
    dispute.status = 'resolved';
    dispute.resolution = action;
    dispute.resolvedAt = new Date();
    dispute.history.push({
      actor: adminId ? new mongoose.Types.ObjectId(adminId) : null,
      action: `resolved:${action}`,
      notes: notes || null,
      timestamp: new Date(),
    } as any);
    await dispute.save();

    // Audit log entry
    await AuditLog.create({
      action: `dispute_resolved_${action}`,
      actor: adminId ? new mongoose.Types.ObjectId(adminId) : null,
      targetType: 'Dispute',
      targetId: dispute._id,
      description: `Dispute ${dispute._id} resolved with action ${action}`,
      meta: { escrowId: escrow._id.toString(), notes: notes || null },
    });

    return { dispute, escrow };
  }
}

export default new DisputeService();
