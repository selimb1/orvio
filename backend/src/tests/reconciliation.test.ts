import { describe, it, expect } from 'vitest';
import { reconciliationService, BankTransactionInput } from '../services/reconciliationService';
import { AccountingEntryInput } from '../services/accountingParserService';

describe('reconciliationService - logic testing', () => {
  it('should find no deviations for exact matches within date window', () => {
    const bankTxns: BankTransactionInput[] = [
      { txn_date: '2024-03-01', description: 'Pago Proveedor A', debit: 5000, credit: null },
      { txn_date: '2024-03-05', description: 'Cobro Cliente B', debit: null, credit: 12000 },
    ];

    const accEntries: AccountingEntryInput[] = [
      { entryDate: '2024-03-01', description: 'Pago Proveedor A', debit: 5000, credit: null, accountCode: '101', accountName: null },
      { entryDate: '2024-03-04', description: 'Cobro Cliente B', debit: null, credit: 12000, accountCode: '201', accountName: null },
    ];

    const deviations = reconciliationService.reconcile(bankTxns, accEntries);
    expect(deviations).toHaveLength(0);
  });

  it('should detect unmatched bank transaction', () => {
    const bankTxns: BankTransactionInput[] = [
      { txn_date: '2024-03-01', description: 'Comision Bancaria', debit: 450, credit: null },
    ];

    const accEntries: AccountingEntryInput[] = [];

    const deviations = reconciliationService.reconcile(bankTxns, accEntries);
    expect(deviations).toHaveLength(1);
    expect(deviations[0].type).toBe('unmatched_bank');
    expect(deviations[0].amount).toBe(450);
  });

  it('should detect unmatched accounting entry', () => {
    const bankTxns: BankTransactionInput[] = [];

    const accEntries: AccountingEntryInput[] = [
      { entryDate: '2024-03-01', description: 'Gasto Papeleria', debit: 1500, credit: null, accountCode: '501', accountName: null },
    ];

    const deviations = reconciliationService.reconcile(bankTxns, accEntries);
    expect(deviations).toHaveLength(1);
    expect(deviations[0].type).toBe('unmatched_accounting');
    expect(deviations[0].amount).toBe(1500);
  });

  it('should detect amount mismatch when description matches', () => {
    const bankTxns: BankTransactionInput[] = [
      { txn_date: '2024-03-02', description: 'Transferencia Recibida Perez', debit: null, credit: 80000 },
    ];

    const accEntries: AccountingEntryInput[] = [
      { entryDate: '2024-03-02', description: 'Transferencia Perez', debit: null, credit: 75000, accountCode: '111', accountName: null },
    ];

    const deviations = reconciliationService.reconcile(bankTxns, accEntries);
    expect(deviations).toHaveLength(1);
    expect(deviations[0].type).toBe('amount_mismatch');
    expect(deviations[0].amount).toBe(80000);
    expect(deviations[0].details.difference).toBe(5000);
  });
});
