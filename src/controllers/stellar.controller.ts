import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { sorobanService } from '../blockchain/soroban.service';
import logger from '../config/logger';

/**
 * StellarController handles HTTP requests related to Stellar / Soroban
 * network interactions.
 *
 * All methods follow the Express request-response pattern and delegate
 * business logic entirely to SorobanService.
 */
export class StellarController {
  /**
   * GET /api/v1/stellar/health
   *
   * Performs a live connectivity check against the configured Soroban RPC
   * node and returns the result.
   *
   * Response 200 — node reachable and healthy:
   * ```json
   * {
   *   "status": "success",
   *   "data": {
   *     "connected": true,
   *     "network": "testnet",
   *     "networkPassphrase": "Test SDF Network ; September 2015",
   *     "rpcUrl": "https://soroban-testnet.stellar.org",
   *     "status": "healthy",
   *     "latestLedger": 12345678,
   *     "checkedAt": "2024-01-01T00:00:00.000Z",
   *     "latencyMs": 142
   *   }
   * }
   * ```
   *
   * Response 503 — node unreachable or unhealthy:
   * ```json
   * {
   *   "status": "error",
   *   "data": {
   *     "connected": false,
   *     "network": "testnet",
   *     "rpcUrl": "https://soroban-testnet.stellar.org",
   *     "checkedAt": "2024-01-01T00:00:00.000Z",
   *     "error": "connect ECONNREFUSED ..."
   *   }
   * }
   * ```
   */
  public async checkHealth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await sorobanService.checkConnectivity();

      if (result.connected) {
        res.status(StatusCodes.OK).json({
          status: 'success',
          data: result,
        });
      } else {
        res.status(StatusCodes.SERVICE_UNAVAILABLE).json({
          status: 'error',
          data: result,
        });
      }
    } catch (err) {
      logger.error('[StellarController] Unexpected error in checkHealth:', err);
      next(err);
    }
  }

  /**
   * GET /api/v1/stellar/network
   *
   * Returns network information (passphrase, protocol version) from the
   * Soroban RPC node.
   *
   * Response 200:
   * ```json
   * {
   *   "status": "success",
   *   "data": {
   *     "passphrase": "Test SDF Network ; September 2015",
   *     "protocolVersion": 21
   *   }
   * }
   * ```
   */
  public async getNetworkInfo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const info = await sorobanService.getNetworkInfo();

      res.status(StatusCodes.OK).json({
        status: 'success',
        data: info,
      });
    } catch (err) {
      logger.error('[StellarController] Unexpected error in getNetworkInfo:', err);
      next(err);
    }
  }

  /**
   * GET /api/v1/stellar/ledger/latest
   *
   * Returns the latest ledger sequence number from the Soroban RPC node.
   *
   * Response 200:
   * ```json
   * {
   *   "status": "success",
   *   "data": { "latestLedger": 12345678 }
   * }
   * ```
   */
  public async getLatestLedger(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const latestLedger = await sorobanService.getLatestLedger();

      res.status(StatusCodes.OK).json({
        status: 'success',
        data: { latestLedger },
      });
    } catch (err) {
      logger.error('[StellarController] Unexpected error in getLatestLedger:', err);
      next(err);
    }
  }
}

/** Singleton instance used by the router. */
export const stellarController = new StellarController();
