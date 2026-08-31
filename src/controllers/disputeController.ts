import { Request, Response } from 'express';
import disputeService from '../services/disputeService';

class DisputeController {
  public async lockEscrow(req: Request, res: Response): Promise<Response> {
    try {
      const { escrowId } = req.params;
      const adminId = req.body.adminId || null;
      const reason = req.body.reason || 'Dispute opened by admin';

      const dispute = await disputeService.lockEscrow(escrowId, adminId, reason);

      return res.status(201).json({ status: 'success', data: dispute });
    } catch (error: any) {
      return res.status(400).json({ status: 'error', message: error.message });
    }
  }

  public async resolveDispute(req: Request, res: Response): Promise<Response> {
    try {
      const { disputeId } = req.params;
      const { action, adminId, notes } = req.body;

      if (!action || (action !== 'refund' && action !== 'release')) {
        return res.status(400).json({ status: 'error', message: 'Invalid action. Use "refund" or "release".' });
      }

      const result = await disputeService.resolveDispute(disputeId, action, adminId, notes);

      return res.status(200).json({ status: 'success', data: result });
    } catch (error: any) {
      return res.status(400).json({ status: 'error', message: error.message });
    }
  }

  public async getDispute(req: Request, res: Response): Promise<Response> {
    try {
      const { disputeId } = req.params;
      const dispute = await (await import('../models/Dispute')).default.findById(disputeId).populate('escrow');
      if (!dispute) {
        return res.status(404).json({ status: 'error', message: 'Dispute not found' });
      }
      return res.status(200).json({ status: 'success', data: dispute });
    } catch (error: any) {
      return res.status(400).json({ status: 'error', message: error.message });
    }
  }
}

export default new DisputeController();
