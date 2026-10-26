import { describe, expect, it } from 'vitest';
import { BankNotConfiguredError, getBankPixProvider, validatePayment } from './bank-provider';

describe('Pix safety guards', () => {
 it('fails closed without officially configured bank API', () => {
   expect(() => getBankPixProvider()).toThrow(BankNotConfiguredError);
 });
 it('accepts matching bank settlement evidence', () => {
   expect(() => validatePayment({ txid: 'tx-1', amountCents: 15990, status: 'pending' }, {
     txid: 'tx-1', amountCents: 15990, endToEndId: 'E123', settledAt: '2026-10-26T16:00:00Z',
   })).not.toThrow();
 });
 it('rejects incorrect payment amount', () => {
   expect(() => validatePayment({ txid: 'tx-1', amountCents: 15990, status: 'pending' }, {
     txid: 'tx-1', amountCents: 999, endToEndId: 'E123', settledAt: '2026-10-26T16:00:00Z',
   })).toThrow();
 });
 it('rejects repeat settlement', () => {
   expect(() => validatePayment({ txid: 'tx-1', amountCents: 15990, status: 'paid' }, {
     txid: 'tx-1', amountCents: 15990, endToEndId: 'E123', settledAt: '2026-10-26T16:00:00Z',
   })).toThrow();
 });
});
