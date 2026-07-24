import { rpc as StellarRpc, Networks } from '@stellar/stellar-sdk';
import logger from './logger';

/**
 * Supported Stellar network aliases.
 */
export type StellarNetwork = 'mainnet' | 'testnet' | 'futurenet';

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
  const network = (process.env.STELLAR_NETWORK?.toLowerCase() ?? 'testnet') as StellarNetwork;

  if (!['mainnet', 'testnet', 'futurenet'].includes(network)) {
    throw new Error(
      `Invalid STELLAR_NETWORK="${process.env.STELLAR_NETWORK}". ` +
        'Must be one of: mainnet | testnet | futurenet',
    );
  }

  const rpcUrl = process.env.SOROBAN_RPC_URL?.trim() || DEFAULT_RPC_URLS[network];

  // Prefer explicit passphrase env var; fall back to the well-known value for
  // the configured network.
  const networkPassphrase =
    process.env.STELLAR_NETWORK_PASSPHRASE?.trim() || NETWORK_PASSPHRASES[network];

  const timeoutMs = parseInt(process.env.SOROBAN_RPC_TIMEOUT_MS ?? '10000', 10);

  if (!rpcUrl) {
    throw new Error('SOROBAN_RPC_URL is required and could not be resolved.');
  }

  if (!networkPassphrase) {
    throw new Error('STELLAR_NETWORK_PASSPHRASE is required and could not be resolved.');
  }

  return { rpcUrl, networkPassphrase, network, timeoutMs };
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
