/**
 * Pix bank integration boundary.
 * No real payment is created until the chosen bank's authenticated API is implemented.
 * Never embed bank tokens, mTLS keys or Supabase service role keys in the browser/app.
 */
export type PixCharge = {
 txid: string;
 amountCents: number;
 expiresAt: string;
 qrCodePayload: string;
};
export type VerifiedPixPayment = {
 txid: string;
 amountCents: number;
 endToEndId: string;
 settledAt: string;
};
export interface BankPixProvider {
 createCharge(input: { txid: string; amountCents: number; expiresInSeconds: number }): Promise<PixCharge>;
 /** Server-side consultation via bank API: do not trust arbitrary callback payloads. */
 getSettledPayment(txid: string): Promise<VerifiedPixPayment | null>;
}
export class BankNotConfiguredError extends Error {
 constructor() { super('Configure the bank and its Pix API credentials before accepting Pix payments.'); }
}
export function getBankPixProvider(): BankPixProvider {
 throw new BankNotConfiguredError();
}
export function validatePayment(
 expected: { txid: string; amountCents: number; status: string },
 observed: VerifiedPixPayment,
): void {
 if (expected.status !== 'pending') throw new Error('Payment is not pending');
 if (expected.txid !== observed.txid || expected.amountCents !== observed.amountCents)
   throw new Error('Pix txid or amount mismatch');
 if (!observed.endToEndId || !Number.isFinite(Date.parse(observed.settledAt)))
   throw new Error('Invalid bank settlement evidence');
}
// Next step: implement bank-specific adapter; secure checkout endpoint calculates amount
// from stored order lines, persists txid, and returns dynamic QR data.
// Webhook endpoint verifies bank authenticity, fetches settlement from bank,
// and atomically updates payment and order, with idempotent endToEndId.
