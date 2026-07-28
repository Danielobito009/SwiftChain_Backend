import { rpc as StellarRpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { sorobanRpcClient } from '../config/stellar';
import { escrowIndexerConfig } from '../config/escrow';
import { escrowService, EscrowFundedInput } from '../services/escrow.service';
import logger from '../config/logger';

/**
 * Native representation of the `escrow_funded` event emitted by the escrow
 * Soroban contract.
 *
 * Expected on-chain shape:
 *   topics: [Symbol("escrow_funded"), Bytes|String delivery_id]
 *   data:   Map { amount: i128, asset: Symbol|Address, funded_by: Address }
 */
export interface EscrowFundedEventData {
  deliveryId: string;
  amount: number;
  asset: string;
  fundedBy?: string;
}

/** Result of processing a single raw contract event through the handler. */
export type EscrowEventProcessResult =
  | { status: 'processed'; ledger: number; transactionHash: string }
  | { status: 'ignored'; ledger: number; reason: string };

/** Summary returned after syncing a batch of `escrow_funded` events. */
export interface EscrowSyncSummary {
  latestLedger: number;
  cursor: string;
  processed: number;
  ignored: number;
  results: EscrowEventProcessResult[];
}

/**
 * Parse the `escrow_funded` event's topics/value into a typed payload.
 *
 * Returns `null` when the event does not match the expected shape (e.g. the
 * data map is missing required keys), so the caller can skip it instead of
 * crashing the indexer on an unrelated or malformed event.
 */
export function parseEscrowFundedEvent(
  event: StellarRpc.Api.EventResponse,
): EscrowFundedEventData | null {
  try {
    const [, deliveryIdTopic] = event.topic;
    if (!deliveryIdTopic) {
      return null;
    }

    const deliveryId = scValToNative(deliveryIdTopic) as unknown;
    if (typeof deliveryId !== 'string' || deliveryId.length === 0) {
      return null;
    }

    const data = scValToNative(event.value) as Record<string, unknown>;

    const rawAmount = data?.amount;
    const amount =
      typeof rawAmount === 'bigint'
        ? Number(rawAmount)
        : typeof rawAmount === 'number'
          ? rawAmount
          : NaN;

    const asset = data?.asset;
    const fundedBy = data?.funded_by;

    if (!Number.isFinite(amount) || typeof asset !== 'string') {
      return null;
    }

    return {
      deliveryId,
      amount,
      asset,
      fundedBy: typeof fundedBy === 'string' ? fundedBy : undefined,
    };
  } catch (err) {
    logger.warn(
      `[EscrowHandlers] Failed to parse escrow_funded event id=${event.id}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}

/**
 * Handle a single raw `escrow_funded` contract event: parse it and persist
 * the resulting escrow/delivery state via the service layer.
 */
export async function handleEscrowFundedEvent(
  event: StellarRpc.Api.EventResponse,
  contractId: string,
): Promise<EscrowEventProcessResult> {
  const parsed = parseEscrowFundedEvent(event);

  if (!parsed) {
    return { status: 'ignored', ledger: event.ledger, reason: 'unparseable event payload' };
  }

  const input: EscrowFundedInput = {
    contractId,
    deliveryId: parsed.deliveryId,
    amount: parsed.amount,
    asset: parsed.asset,
    fundedBy: parsed.fundedBy,
    transactionHash: event.txHash,
    ledger: event.ledger,
  };

  await escrowService.recordEscrowFunded(input);

  return { status: 'processed', ledger: event.ledger, transactionHash: event.txHash };
}

/**
 * Poll the Soroban RPC node for `escrow_funded` events emitted by the escrow
 * contract and process each one.
 *
 * @param startLedger - Ledger to start querying from (inclusive). Callers
 *                      are responsible for persisting the returned `cursor`
 *                      to resume from on the next poll.
 * @param contractId  - Escrow contract id to query. Defaults to
 *                      `ESCROW_CONTRACT_ID` from the environment.
 */
export async function syncEscrowFundedEvents(
  startLedger: number,
  contractId: string = escrowIndexerConfig.contractId,
): Promise<EscrowSyncSummary> {
  if (!contractId) {
    throw new Error('No escrow contract id configured. Set ESCROW_CONTRACT_ID.');
  }

  const response = await sorobanRpcClient.getEvents({
    startLedger,
    filters: [
      {
        type: 'contract',
        contractIds: [contractId],
        topics: [[xdr.ScVal.scvSymbol(escrowIndexerConfig.fundedEventTopic).toXDR('base64'), '*']],
      },
    ],
  });

  const results: EscrowEventProcessResult[] = [];

  for (const event of response.events) {
    const result = await handleEscrowFundedEvent(event, contractId);
    results.push(result);
  }

  const processed = results.filter((r) => r.status === 'processed').length;
  const ignored = results.length - processed;

  logger.info(
    `[EscrowHandlers] Synced escrow_funded events — contract=${contractId} ` +
      `processed=${processed} ignored=${ignored} latestLedger=${response.latestLedger}`,
  );

  return {
    latestLedger: response.latestLedger,
    cursor: response.cursor,
    processed,
    ignored,
    results,
  };
}
