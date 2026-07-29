import { rpc as StellarRpc, xdr } from '@stellar/stellar-sdk';
import logger from '../config/logger';
import { sorobanRpcClient } from '../config/stellar';
import { escrowIndexerConfig } from '../config/escrow';
import EventLog from '../models/EventLog';
import { handleEscrowFundedEvent } from '../indexer/escrowHandlers';
import {
  ReputationEvent,
  dispatchReputationEvent,
} from '../indexer/reputationHandlers';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Default polling interval in milliseconds (30 seconds).
 * Override via `EVENT_POLLER_INTERVAL_MS` environment variable.
 */
const POLL_INTERVAL_MS = parseInt(
  process.env.EVENT_POLLER_INTERVAL_MS ?? '30000',
  10,
);

/**
 * How many ledgers behind the latest ledger to start from when no
 * EventLog record exists yet (approx. 1 hour on Stellar at ~5s/ledger).
 */
const DEFAULT_BACKFILL_LEDGERS = 720;

/**
 * Maximum number of events to fetch per `getEvents` call.
 */
const PAGE_LIMIT = 100;

// ─── Event Type Identifiers ───────────────────────────────────────────────────

const EVENT_TYPE_ESCROW_FUNDED = 'escrow_funded';
const EVENT_TYPE_REPUTATION_INCREASED = 'reputation_increased';

// ─── Dispatcher ───────────────────────────────────────────────────────────────

/**
 * Describes a registered event handler that the poller invokes for
 * each matched contract event.
 */
interface EventHandler {
  /** Human-readable event type label, used for EventLog cursor storage. */
  eventType: string;
  /** Soroban contract ID to filter events by. */
  contractId: string;
  /** Event topic symbol(s) the handler is interested in. */
  eventSymbol: string;
  /**
   * Callback invoked for each matching event. Returns a success/failure
   * indicator so the poller can decide whether to advance the cursor.
   */
  handle(event: StellarRpc.Api.EventResponse): Promise<boolean>;
}

// ─── Poller ───────────────────────────────────────────────────────────────────

/**
 * Continuously polls the Soroban RPC for new contract events and
 * dispatches them to the appropriate handler.
 *
 * Tracks the last processed ledger per event type in the `EventLog`
 * collection so it can resume from where it left off across restarts.
 */
export class EventPoller {
  private readonly handlers: EventHandler[] = [];
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private pollIntervalMs: number;

  constructor(pollIntervalMs: number = POLL_INTERVAL_MS) {
    this.pollIntervalMs = pollIntervalMs;
  }

  // ─── Handler Registration ───────────────────────────────────────────────

  /**
   * Register an event handler. Call before `start()`.
   */
  public register(handler: EventHandler): void {
    this.handlers.push(handler);
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  /**
   * Begins the polling loop. Safe to call multiple times — subsequent
   * calls are no-ops if the poller is already running.
   */
  public start(): void {
    if (this.intervalHandle) {
      logger.warn('[EventPoller] Already running — ignoring duplicate start().');
      return;
    }

    if (this.handlers.length === 0) {
      logger.warn(
        '[EventPoller] No handlers registered — polling will be a no-op.',
      );
    }

    logger.info(
      `[EventPoller] Starting — interval=${this.pollIntervalMs}ms ` +
        `handlers=${this.handlers.length}`,
    );

    // Kick off an immediate poll, then continue on the interval.
    void this.poll();

    this.intervalHandle = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
  }

  /**
   * Stops the polling loop. Idempotent.
   */
  public stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      logger.info('[EventPoller] Stopped.');
    }
  }

  // ─── Poll Cycle ──────────────────────────────────────────────────────────

  /**
   * Execute a single poll cycle: for every registered handler, determine
   * the start ledger, fetch new events, and dispatch each one.
   *
   * Uses a concurrency guard (`isRunning`) so overlapping ticks are
   * silently skipped if a previous cycle is still in flight.
   */
  public async poll(): Promise<void> {
    if (this.isRunning) {
      logger.debug('[EventPoller] Previous poll still in progress — skipping tick.');
      return;
    }

    this.isRunning = true;

    try {
      for (const handler of this.handlers) {
        await this.pollHandler(handler);
      }
    } catch (err) {
      logger.error(
        `[EventPoller] Unhandled error during poll cycle: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Poll for a single handler's event type and process results.
   */
  private async pollHandler(handler: EventHandler): Promise<void> {
    try {
      const entry = await EventLog.findOne({
        eventType: handler.eventType,
        contractId: handler.contractId,
      }).lean();

      let startLedger: number;

      if (entry && entry.lastProcessedLedger > 0) {
        // Resume from where we left off (inclusive).
        startLedger = entry.lastProcessedLedger + 1;
      } else {
        // No prior cursor: backfill from N ledgers ago.
        const latest = await this.getLatestLedger();
        startLedger = Math.max(1, latest - DEFAULT_BACKFILL_LEDGERS);
        logger.info(
          `[EventPoller] No prior cursor for ${handler.eventType} — ` +
            `starting from ledger ${startLedger} (latest=${latest})`,
        );
      }

      const response = await sorobanRpcClient.getEvents({
        startLedger,
        filters: [
          {
            type: 'contract',
            contractIds: [handler.contractId],
            topics: [
              [
                xdr.ScVal.scvSymbol(handler.eventSymbol).toXDR('base64'),
                '*',
              ],
            ],
          },
        ],
        limit: PAGE_LIMIT,
      });

      const events = response.events;
      if (events.length === 0) {
        // No new events — just persist the latest ledger we checked up to.
        if (response.latestLedger > (entry?.lastProcessedLedger ?? 0)) {
          await EventLog.updateOne(
            { eventType: handler.eventType, contractId: handler.contractId },
            {
              $set: {
                lastProcessedLedger: response.latestLedger,
                cursor: response.cursor ?? undefined,
              },
              $setOnInsert: {
                eventType: handler.eventType,
                contractId: handler.contractId,
              },
            },
            { upsert: true },
          );
        }
        return;
      }

      let maxLedger = startLedger;
      let allSucceeded = true;

      for (const event of events) {
        const ok = await handler.handle(event);
        if (!ok) {
          allSucceeded = false;
          logger.warn(
            `[EventPoller] Handler ${handler.eventType} failed for ` +
              `event id=${event.id} tx=${event.txHash}`,
          );
        }
        if (event.ledger > maxLedger) {
          maxLedger = event.ledger;
        }
      }

      // Only advance the cursor if every event in this batch succeeded.
      // This ensures we retry failures on the next tick rather than
      // silently skipping them.
      const newLedger = allSucceeded ? maxLedger + 1 : maxLedger;

      await EventLog.updateOne(
        { eventType: handler.eventType, contractId: handler.contractId },
        {
          $set: {
            lastProcessedLedger: newLedger,
            cursor: response.cursor ?? undefined,
          },
          $setOnInsert: {
            eventType: handler.eventType,
            contractId: handler.contractId,
          },
        },
        { upsert: true },
      );

      logger.info(
        `[EventPoller] ${handler.eventType} — processed=${events.length} ` +
          `ok=${events.length - (allSucceeded ? 0 : 1)} ` +
          `cursor=${newLedger}`,
      );
    } catch (err) {
      logger.error(
        `[EventPoller] Error polling ${handler.eventType}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Fetch the latest ledger sequence number from the Soroban RPC.
   */
  private async getLatestLedger(): Promise<number> {
    const ledger = await sorobanRpcClient.getLatestLedger();
    return ledger.sequence;
  }
}

// ─── Singleton & Default Registration ───────────────────────────────────────

/**
 * Pre-configured singleton instance with the default handlers registered.
 */
export const eventPoller = new EventPoller();

// Register the escrow_funded handler using the contract ID from config.
eventPoller.register({
  eventType: EVENT_TYPE_ESCROW_FUNDED,
  contractId: escrowIndexerConfig.contractId,
  eventSymbol: escrowIndexerConfig.fundedEventTopic,
  async handle(event: StellarRpc.Api.EventResponse): Promise<boolean> {
    try {
      await handleEscrowFundedEvent(event, escrowIndexerConfig.contractId);
      return true;
    } catch (err) {
      logger.error(
        `[EventPoller] escrow_funded handler error for event id=${event.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  },
});

// Register the reputation event handler.
// The reputation contract ID must be set via REPUTATION_CONTRACT_ID env var.
const REPUTATION_CONTRACT_ID =
  process.env.REPUTATION_CONTRACT_ID?.trim() ?? '';

/**
 * Map a Soroban event topic symbol to the `ReputationEvent` type string
 * expected by `dispatchReputationEvent`.
 */
function reputationTopicToEventType(topicSymbol: string): string | null {
  switch (topicSymbol) {
    case 'reputation_increased':
      return 'reputation_increased';
    case 'reputation_slashed':
      return 'reputation_slashed';
    default:
      return null;
  }
}

/**
 * Parse a `ReputationEvent` from the raw Soroban event.
 */
function parseReputationEvent(
  event: StellarRpc.Api.EventResponse,
): ReputationEvent | null {
  try {
    const [, driverTopic] = event.topic;
    if (!driverTopic) {
      return null;
    }

    const driverAddress = String(driverTopic);
    if (!driverAddress) {
      return null;
    }

    const value = event.value as { points?: number };
    const points =
      typeof value?.points === 'number'
        ? value.points
        : typeof value?.points === 'bigint'
          ? Number(value.points)
          : NaN;

    if (!Number.isFinite(points) || points <= 0) {
      return null;
    }

    return {
      driverAddress,
      points,
      ledgerSequence: event.ledger,
    };
  } catch {
    return null;
  }
}

// Only register the reputation handler if the contract ID is configured.
if (REPUTATION_CONTRACT_ID) {
  eventPoller.register({
    eventType: EVENT_TYPE_REPUTATION_INCREASED,
    contractId: REPUTATION_CONTRACT_ID,
    eventSymbol: 'reputation_increased',
    async handle(event: StellarRpc.Api.EventResponse): Promise<boolean> {
      try {
        const topicSymbol = event.topic[0]?.sym() ?? '';
        const eventType = reputationTopicToEventType(topicSymbol);
        if (!eventType) {
          logger.warn(
            `[EventPoller] Unknown reputation topic symbol: ${topicSymbol}`,
          );
          return false;
        }

        const parsed = parseReputationEvent(event);
        if (!parsed) {
          logger.warn(
            `[EventPoller] Failed to parse reputation event id=${event.id}`,
          );
          return false;
        }

        await dispatchReputationEvent(eventType, parsed);
        return true;
      } catch (err) {
        logger.error(
          `[EventPoller] reputation handler error for event id=${event.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        return false;
      }
    },
  });
} else {
  logger.warn(
    '[EventPoller] REPUTATION_CONTRACT_ID not set — reputation event polling disabled.',
  );
}

// ─── Convenience Start/Stop Exports ─────────────────────────────────────────

/**
 * Start the event poller (idempotent).
 * Called once at server startup.
 */
export const startEventPoller = (): void => {
  eventPoller.start();
};

/**
 * Stop the event poller (idempotent).
 * Called during graceful shutdown.
 */
export const stopEventPoller = (): void => {
  eventPoller.stop();
};
