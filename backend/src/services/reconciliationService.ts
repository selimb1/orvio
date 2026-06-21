import { AccountingEntryInput } from './accountingParserService';

export interface BankTransactionInput {
  id?: string;
  txn_date: string;
  description: string;
  debit: number | null;
  credit: number | null;
  balance?: number | null;
}

export interface ReconciliationDeviation {
  type: 'unmatched_bank' | 'unmatched_accounting' | 'amount_mismatch';
  severity: 'high' | 'medium' | 'low' | 'info';
  date: string;
  description: string;
  amount: number;
  details: {
    bankTransaction?: BankTransactionInput;
    accountingEntry?: AccountingEntryInput;
    difference?: number;
    explanation: string;
  };
}

class ReconciliationService {
  /**
   * Compara los movimientos bancarios extraídos con los asientos contables subidos.
   * Retorna un listado detallado de desvíos con nivel de severidad.
   */
  reconcile(
    bankTxns: BankTransactionInput[],
    accEntries: AccountingEntryInput[],
    dateWindowDays = 5
  ): ReconciliationDeviation[] {
    const deviations: ReconciliationDeviation[] = [];

    // Copias mutables para marcar transacciones/asientos como "conciliados"
    const unmatchedBank = [...bankTxns];
    const unmatchedAcc = [...accEntries];

    // Intentar emparejar coincidencias exactas (fecha aproximada, mismo tipo e importe exacto)
    for (let b = unmatchedBank.length - 1; b >= 0; b--) {
      const bankTx = unmatchedBank[b];
      const bankAmount = bankTx.debit || bankTx.credit || 0;
      const isDebit = bankTx.debit !== null;

      // Buscar un asiento contable que coincida en importe y tipo dentro del rango de días
      const matchIndex = unmatchedAcc.findIndex((accTx) => {
        const accAmount = isDebit ? accTx.debit : accTx.credit;
        if (!accAmount) return false;

        // Verificar importe exacto
        if (Math.abs(accAmount - bankAmount) > 0.01) return false;

        // Verificar ventana de fechas
        const bankDate = new Date(bankTx.txn_date + 'T00:00:00');
        const accDate = new Date(accTx.entryDate + 'T00:00:00');
        const diffTime = Math.abs(bankDate.getTime() - accDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return diffDays <= dateWindowDays;
      });

      if (matchIndex !== -1) {
        // Encontró coincidencia exacta, remover de la lista de desvíos
        unmatchedBank.splice(b, 1);
        unmatchedAcc.splice(matchIndex, 1);
      }
    }

    // Buscar desvíos por diferencia de importe (mismo concepto o fecha, pero importe modificado)
    for (let b = unmatchedBank.length - 1; b >= 0; b--) {
      const bankTx = unmatchedBank[b];
      const bankAmount = bankTx.debit || bankTx.credit || 0;
      const isDebit = bankTx.debit !== null;

      // Intentar buscar un asiento contable similar (fecha cercana y descripción parecida)
      const matchIndex = unmatchedAcc.findIndex((accTx) => {
        const accAmount = isDebit ? accTx.debit : accTx.credit;
        if (!accAmount) return false;

        // Misma fecha o ventana muy cercana
        const bankDate = new Date(bankTx.txn_date + 'T00:00:00');
        const accDate = new Date(accTx.entryDate + 'T00:00:00');
        const diffTime = Math.abs(bankDate.getTime() - accDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > 3) return false;

        // Similitud de descripción (si una contiene a la otra, o comparten palabras clave)
        const bankDesc = bankTx.description.toLowerCase();
        const accDesc = accTx.description.toLowerCase();
        
        return bankDesc.includes(accDesc) || accDesc.includes(bankDesc) || this.shareKeywords(bankDesc, accDesc);
      });

      if (matchIndex !== -1) {
        const accTx = unmatchedAcc[matchIndex];
        const accAmount = isDebit ? accTx.debit : accTx.credit;
        const diff = Math.abs((accAmount || 0) - bankAmount);

        deviations.push({
          type: 'amount_mismatch',
          severity: diff > 5000 ? 'high' : 'medium',
          date: bankTx.txn_date,
          description: bankTx.description,
          amount: bankAmount,
          details: {
            bankTransaction: bankTx,
            accountingEntry: accTx,
            difference: diff,
            explanation: `Diferencia de importe: Banco registra $${bankAmount.toLocaleString('es-AR')} y Contabilidad registra $${(accAmount || 0).toLocaleString('es-AR')}. Diferencia: $${diff.toLocaleString('es-AR')}.`,
          },
        });

        unmatchedBank.splice(b, 1);
        unmatchedAcc.splice(matchIndex, 1);
      }
    }

    // Todos los movimientos bancarios que quedaron sin emparejar son extractos no contabilizados
    unmatchedBank.forEach((bankTx) => {
      const bankAmount = bankTx.debit || bankTx.credit || 0;
      deviations.push({
        type: 'unmatched_bank',
        severity: bankAmount > 10000 ? 'high' : 'medium',
        date: bankTx.txn_date,
        description: bankTx.description,
        amount: bankAmount,
        details: {
          bankTransaction: bankTx,
          explanation: `Movimiento bancario no encontrado en la contabilidad del estudio.`,
        },
      });
    });

    // Todos los asientos contables que quedaron sin emparejar son transacciones contables no reflejadas en el banco
    unmatchedAcc.forEach((accTx) => {
      const accAmount = accTx.debit || accTx.credit || 0;
      deviations.push({
        type: 'unmatched_accounting',
        severity: accAmount > 10000 ? 'high' : 'medium',
        date: accTx.entryDate,
        description: accTx.description,
        amount: accAmount,
        details: {
          accountingEntry: accTx,
          explanation: `Asiento contable sin débito/crédito correspondiente en el extracto bancario.`,
        },
      });
    });

    // Ordenar desvíos por severidad (high primero) y luego por fecha descendente
    const severityOrder = { high: 0, medium: 1, low: 2, info: 3 };
    return deviations.sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }

  private shareKeywords(desc1: string, desc2: string): boolean {
    const words1 = desc1.split(/\s+/).filter(w => w.length > 4);
    const words2 = desc2.split(/\s+/).filter(w => w.length > 4);

    return words1.some(w => words2.includes(w));
  }
}

export const reconciliationService = new ReconciliationService();
