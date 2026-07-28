/**
 * Configuration for the escrow smart-contract indexer.
 *
 * ESCROW_CONTRACT_ID is the deployed Soroban contract address whose events
 * (e.g. `escrow_funded`) the indexer subscribes to. It is intentionally
 * separate from the generic Stellar/Soroban RPC config since it identifies
 * a specific contract instance rather than network connection details.
 */
export interface EscrowIndexerConfig {
  /** Deployed escrow contract id (Soroban "C..." address). */
  contractId: string;
  /** Event topic emitted by the contract when an escrow is funded. */
  fundedEventTopic: string;
}

function resolveEscrowIndexerConfig(): EscrowIndexerConfig {
  return {
    contractId: process.env.ESCROW_CONTRACT_ID?.trim() ?? '',
    fundedEventTopic: process.env.ESCROW_FUNDED_EVENT_TOPIC?.trim() || 'escrow_funded',
  };
}

export const escrowIndexerConfig: EscrowIndexerConfig = resolveEscrowIndexerConfig();
