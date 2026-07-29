/**
 * Stellar amounts are fixed-point with 7 decimal places; the smallest unit is
 * a "stroop". Soroban token contracts follow the same convention for the
 * platform assets used by SwiftChain, so escrow amounts persisted as decimal
 * numbers must be converted before being passed to a contract as an `i128`.
 */
export const STELLAR_DECIMALS = 7;

const STROOPS_PER_UNIT = 10n ** BigInt(STELLAR_DECIMALS);

/** Largest decimal amount that survives the conversion without losing precision. */
export const MAX_CONVERTIBLE_AMOUNT = Number.MAX_SAFE_INTEGER / Number(STROOPS_PER_UNIT);

/**
 * Convert a decimal asset amount into stroops.
 *
 * The conversion goes through the fixed-point string representation rather
 * than floating-point multiplication, so values such as `15.99` do not drift
 * (`15.99 * 1e7 === 159899999.99999997`).
 *
 * @param amount - A finite, positive decimal amount (e.g. `150.25`).
 * @returns        The equivalent value in stroops.
 * @throws  {RangeError} When the amount is not finite, not positive, or too
 *                       large to convert without precision loss.
 */
export function toStroops(amount: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new RangeError(`Amount must be a finite positive number, received: ${amount}`);
  }

  if (amount > MAX_CONVERTIBLE_AMOUNT) {
    throw new RangeError(
      `Amount ${amount} exceeds the maximum convertible value of ${MAX_CONVERTIBLE_AMOUNT}`,
    );
  }

  const [whole, fraction = ''] = amount.toFixed(STELLAR_DECIMALS).split('.');

  return BigInt(whole) * STROOPS_PER_UNIT + BigInt(fraction.padEnd(STELLAR_DECIMALS, '0'));
}

/**
 * Convert stroops back into a decimal string, preserving all 7 decimals.
 *
 * @param stroops - Amount in stroops.
 * @returns         The decimal representation (e.g. `"150.2500000"`).
 */
export function fromStroops(stroops: bigint): string {
  const negative = stroops < 0n;
  const absolute = negative ? -stroops : stroops;
  const whole = absolute / STROOPS_PER_UNIT;
  const fraction = (absolute % STROOPS_PER_UNIT).toString().padStart(STELLAR_DECIMALS, '0');

  return `${negative ? '-' : ''}${whole.toString()}.${fraction}`;
}
