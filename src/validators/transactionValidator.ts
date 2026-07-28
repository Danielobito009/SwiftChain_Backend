import { StrKey } from '@stellar/stellar-sdk';
import { z } from 'zod';

/**
 * Body schema for `POST /api/v1/transactions/escrow-lock`.
 *
 * Only identifiers are accepted from the client: the escrow amount, asset and
 * contract target are resolved server-side from the database and deployment
 * configuration so a caller cannot influence what gets locked.
 */
export const escrowLockTransactionSchema = z.object({
  deliveryId: z
    .string()
    .trim()
    .regex(/^[a-f\d]{24}$/i, 'deliveryId must be a valid delivery id'),
  payerAddress: z
    .string()
    .trim()
    .refine(
      (value) => StrKey.isValidEd25519PublicKey(value),
      'payerAddress must be a valid Stellar public key (G...)',
    ),
});

export type EscrowLockTransactionBody = z.infer<typeof escrowLockTransactionSchema>;
