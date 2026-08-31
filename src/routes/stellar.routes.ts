import { Router } from 'express';
import { stellarController } from '../controllers/stellar.controller';

/**
 * Stellar / Soroban RPC routes.
 *
 * Mounted at /api/v1/stellar by the root router.
 *
 * Endpoints:
 *   GET /api/v1/stellar/health         — live connectivity check
 *   GET /api/v1/stellar/network        — network passphrase & protocol version
 *   GET /api/v1/stellar/ledger/latest  — latest ledger sequence number
 */
const router = Router();

router.get('/health', (req, res, next) => {
  void stellarController.checkHealth(req, res, next);
});

router.get('/network', (req, res, next) => {
  void stellarController.getNetworkInfo(req, res, next);
});

router.get('/ledger/latest', (req, res, next) => {
  void stellarController.getLatestLedger(req, res, next);
});

export default router;
