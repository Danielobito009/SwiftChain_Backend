import { rpc as StellarRpc } from '@stellar/stellar-sdk';
import logger from '../config/logger';
import { sorobanRpcClient, stellarConfig } from '../config/stellar';

/**
 * Result returned by a successful connectivity check.
 */
export interface ConnectivityCheckResult {
  /** Whether the RPC node is reachable and healthy. */
  connected: boolean;
  /** Human-readable network alias. */
  network: string;
  /** Network passphrase used. */
  networkPassphrase: string;
  /** RPC endpoint that was queried. */
  rpcUrl: string;
  /** Health status string returned by the node (e.g. "healthy"). */
  status: string;
  /** Latest ledger number at time of check. */
  latestLedger: number;
  /** ISO timestamp of when the check was performed. */
  checkedAt: string;
  /** Round-trip latency in milliseconds. */
  latencyMs: number;
}

/**
 * Result returned when the connectivity check fails.
 */
export interface ConnectivityCheckError {
  connected: false;
  network: string;
  rpcUrl: string;
  checkedAt: string;
  error: string;
}

/**
 * SorobanService provides the business-logic layer for all Stellar / Soroban
 * RPC interactions.
 *
 * Responsibilities:
 *   - Perform a live connectivity check against the configured RPC node.
 *   - Surface health, network, and ledger data for API responses.
 *   - Abstract the raw SDK client behind a typed interface so higher layers
 *     (controllers, other services) are decoupled from the SDK.
 */
export class SorobanService {
  private readonly client: StellarRpc.Server;

  constructor(client: StellarRpc.Server = sorobanRpcClient) {
    this.client = client;
  }

  /**
   * Perform a connectivity check against the Soroban RPC node.
   *
   * Calls `getHealth()` and `getLatestLedger()` in parallel. Both must
   * succeed for the check to be considered healthy.
   *
   * @returns A `ConnectivityCheckResult` on success, or a
   *          `ConnectivityCheckError` on failure.
   */
  public async checkConnectivity(): Promise<ConnectivityCheckResult | ConnectivityCheckError> {
    const checkedAt = new Date().toISOString();
    const start = Date.now();

    logger.debug(
      `[Soroban] Connectivity check — network=${stellarConfig.network} url=${stellarConfig.rpcUrl}`,
    );

    try {
      const [health, ledger] = await Promise.all([
        this.client.getHealth(),
        this.client.getLatestLedger(),
      ]);

      const latencyMs = Date.now() - start;

      const result: ConnectivityCheckResult = {
        connected: true,
        network: stellarConfig.network,
        networkPassphrase: stellarConfig.networkPassphrase,
        rpcUrl: stellarConfig.rpcUrl,
        status: health.status,
        latestLedger: ledger.sequence,
        checkedAt,
        latencyMs,
      };

      logger.info(
        `[Soroban] Connectivity OK — network=${stellarConfig.network} ` +
          `ledger=${ledger.sequence} latency=${latencyMs}ms`,
      );

      return result;
    } catch (err) {
      const latencyMs = Date.now() - start;
      const message = err instanceof Error ? err.message : 'Unknown error';

      logger.error(
        `[Soroban] Connectivity FAILED — network=${stellarConfig.network} ` +
          `latency=${latencyMs}ms error="${message}"`,
      );

      const errorResult: ConnectivityCheckError = {
        connected: false,
        network: stellarConfig.network,
        rpcUrl: stellarConfig.rpcUrl,
        checkedAt,
        error: message,
      };

      return errorResult;
    }
  }

  /**
   * Fetch the latest ledger sequence number from the RPC node.
   *
   * @returns The ledger sequence number.
   * @throws  If the RPC call fails.
   */
  public async getLatestLedger(): Promise<number> {
    const ledger = await this.client.getLatestLedger();
    return ledger.sequence;
  }

  /**
   * Fetch network information (passphrase, protocol version) from the RPC node.
   *
   * @returns The raw `getNetwork` response from the SDK.
   */
  public async getNetworkInfo(): Promise<StellarRpc.Api.GetNetworkResponse> {
    return this.client.getNetwork();
  }
}

/** Singleton instance for use across the application. */
export const sorobanService = new SorobanService();
