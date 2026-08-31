import { rpc as StellarRpc, Networks, StrKey } from '@stellar/stellar-sdk';
import logger from './logger';
import env from './env';

/**
 * Supported Stellar network aliases.
 */
export type StellarNetwork = typeof env.STELLAR_NETWORK;

/**
 * Resolved Stellar configuration derived from environment variables.
 */
export interface StellarConfig {
  /** Soroban RPC endpoint URL. */
  rpcUrl: string;
  /** Network passphrase used when signing/verifying transactions. */
  networkPassphrase: string;
  /** Human-readable network alias (for logs and API responses). */
  network: StellarNetwork;
  /** HTTP request timeout in milliseconds for RPC calls. */
  timeoutMs: number;
  /**
   * Soroban contract id (`C...`) of the SwiftChain escrow contract.
   * Optional at boot so the API still starts without it; endpoints that need
   * it fail with a clear 503 instead.
   */
  escrowContractId?: string;
  /** Escrow contract function invoked to lock funds. */
  escrowLockFunction: string;
  /** Base fee (in stroops) used when building transactions. */
  baseFee: string;
  /** Validity window, in seconds, of generated unsigned transactions. */
  transactionTimeoutSeconds: number;
}

// ─── Network passphrase map ────────────────────────────────────────────────────

const NETWORK_PASSPHRASES: Record<StellarNetwork, string> = {
  mainnet: Networks.PUBLIC,
  testnet: Networks.TESTNET,
  futurenet: Networks.FUTURENET,
};

const DEFAULT_RPC_URLS: Record<StellarNetwork, string> = {
  mainnet: 'https://soroban-mainnet.stellar.org',
  testnet: 'https://soroban-testnet.stellar.org',
  futurenet: 'https://rpc-futurenet.stellar.org',
};

// ─── Resolve config from env ───────────────────────────────────────────────────

/**
 * Build the Stellar configuration from environment variables with sensible
 * defaults. Validated at startup so misconfiguration fails fast.
 */
function resolveStellarConfig(): StellarConfig {
  const network = env.STELLAR_NETWORK;

  // Blank values fall back to the well-known endpoint/passphrase for the
  // selected network, so only non-default deployments need to set them.
  const rpcUrl = env.SOROBAN_RPC_URL || DEFAULT_RPC_URLS[network];
  const networkPassphrase = env.STELLAR_NETWORK_PASSPHRASE || NETWORK_PASSPHRASES[network];
  const escrowContractId = env.SOROBAN_ESCROW_CONTRACT_ID || undefined;

  if (escrowContractId && !StrKey.isValidContract(escrowContractId)) {
    throw new Error(
      `Invalid SOROBAN_ESCROW_CONTRACT_ID="${escrowContractId}". ` +
        'Must be a valid Soroban contract id (starts with "C").',
    );
  }

  return {
    rpcUrl,
    networkPassphrase,
    network,
    timeoutMs: env.SOROBAN_RPC_TIMEOUT_MS,
    escrowContractId,
    escrowLockFunction: env.SOROBAN_ESCROW_LOCK_FUNCTION,
    baseFee: env.STELLAR_BASE_FEE,
    transactionTimeoutSeconds: env.STELLAR_TRANSACTION_TIMEOUT_SECONDS,
  };
}

// ─── Singleton config ──────────────────────────────────────────────────────────

export const stellarConfig: StellarConfig = resolveStellarConfig();

// ─── Soroban RPC client factory ────────────────────────────────────────────────

/**
 * Create a new `rpc.Server` instance using the resolved configuration.
 *
 * A factory function (rather than a singleton) is used so that callers in
 * tests can construct fresh instances with custom options without mutating
 * shared state.
 *
 * @param options - Optional overrides forwarded to `rpc.Server`.
 * @returns         A configured Soroban RPC client.
 */
export function createSorobanRpcClient(
  options?: Partial<ConstructorParameters<typeof StellarRpc.Server>[1]>,
): StellarRpc.Server {
  return new StellarRpc.Server(stellarConfig.rpcUrl, {
    allowHttp: stellarConfig.rpcUrl.startsWith('http://'),
    ...options,
  });
}

/**
 * Pre-built default RPC client singleton.
 * Use this for all production code paths.
 */
export const sorobanRpcClient: StellarRpc.Server = createSorobanRpcClient();

logger.info(
  `[Stellar] Soroban RPC client initialised — network=${stellarConfig.network} ` +
    `url=${stellarConfig.rpcUrl}`,
);
