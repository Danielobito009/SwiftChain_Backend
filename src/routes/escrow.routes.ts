import { Router } from 'express';
import { escrowController } from '../controllers/escrow.controller';

/**
 * Escrow routes.
 *
 * Mounted at /api/v1/escrow by the root router.
 *
 * Endpoints:
 *   GET  /api/v1/escrow/delivery/:deliveryId  — escrow record for a delivery
 *   GET  /api/v1/escrow/contract/:contractId  — escrow record for a contract id
 *   POST /api/v1/escrow/sync                  — manually trigger an escrow_funded indexer poll
 */
const router = Router();

router.get('/delivery/:deliveryId', escrowController.getByDelivery.bind(escrowController));
router.get('/contract/:contractId', escrowController.getByContract.bind(escrowController));
router.post('/sync', escrowController.sync.bind(escrowController));

export default router;
