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

/**
 * Body schema for `POST /api/v1/transactions/submit`.
 *
 * Accepts a signed XDR envelope (produced by the client wallet after signing
 * the unsigned XDR from `/transactions/escrow-lock`) plus the identifiers
 * needed to rebuild the transaction if a `tx_bad_seq` error is encountered.
 */
export const submitTransactionSchema = z.object({
  deliveryId: z
    .string()
    .trim()
    .regex(/^[a-f\d]{24}$/i, 'deliveryId must be a valid MongoDB ObjectId'),

  payerAddress: z
    .string()
    .trim()
    .refine(
      (value) => StrKey.isValidEd25519PublicKey(value),
      'payerAddress must be a valid Stellar public key (G...)',
    ),

  signedXdr: z
    .string()
    .trim()
    .min(1, 'signedXdr is required')
    .max(65_536, 'signedXdr exceeds maximum allowed length'),
});

export type SubmitTransactionBody = z.infer<typeof submitTransactionSchema>;
