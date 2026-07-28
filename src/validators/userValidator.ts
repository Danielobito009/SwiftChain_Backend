import { z } from 'zod';
import { StrKey } from '@stellar/stellar-sdk';

export const updateWalletSchema = z.object({
  walletAddress: z
    .string({ error: 'Wallet address is required' })
    .trim()
    .refine((value) => StrKey.isValidEd25519PublicKey(value), {
      message: 'Please provide a valid Stellar public key',
    }),
});

export type UpdateWalletInput = z.infer<typeof updateWalletSchema>;
