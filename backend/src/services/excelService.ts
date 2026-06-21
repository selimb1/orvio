import ExcelJS from 'exceljs';
import { logger } from '../utils/logger';

interface Transaction {
  txn_date: string;
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number | null;
}

interface StatementMeta {
  bankName: string;
  periodFrom: string | null;
  periodTo: string | null;
  fileName: string;
}

/**
 * Servicio para generar archivos Excel.
 * Usa ExcelJS para crear archivos .xlsx formateados.
 */
class ExcelService {
  /**
   * Genera un Excel con los movimientos de un extracto bancario.
   * El archivo está formateado con:
   * - Encabezado con datos del banco y período
   * - Tabla de movimientos con formato contable (positivos en verde, negativos en rojo)
   * - Columnas con ancho automático
   * - Totales de débitos y créditos
   */
  async generateBankStatement(
    transactions: Transaction[],
    meta: StatementMeta
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    workbook.creator = 'Orvio';
    workbook.created = new Date();
    workbook.modified = new Date();

    const sheet = workbook.addWorksheet('Movimientos', {
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
      },
    });

    // ============================================================
    // Encabezado informativo
    // ============================================================
    sheet.addRow(['ORVIO — Extracto Bancario Procesado']);
    sheet.getRow(1).getCell(1).font = { bold: true, size: 14 };

    sheet.addRow([`Banco: ${meta.bankName}`]);
    sheet.addRow([
      `Período: ${meta.periodFrom ? this.formatDate(meta.periodFrom) : 'N/D'} — ${
        meta.periodTo ? this.formatDate(meta.periodTo) : 'N/D'
      }`,
    ]);
    sheet.addRow([`Archivo original: ${meta.fileName}`]);
    sheet.addRow([`Generado: ${new Date().toLocaleString('es-AR')}`]);
    sheet.addRow([
      '⚠️  DISCLAIMER: Este archivo fue generado como apoyo al trabajo contable. La validación final y la responsabilidad profesional son del contador interviniente.',
    ]);
    sheet.getRow(6).getCell(1).font = { italic: true, color: { argb: 'FF8B0000' } };
    sheet.addRow([]); // Fila vacía

    // ============================================================
    // Encabezados de columna
    // ============================================================
    const headerRow = sheet.addRow([
      'N°',
      'Fecha',
      'Descripción / Concepto',
      'Débito (AR$)',
      'Crédito (AR$)',
      'Saldo (AR$)',
    ]);

    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E3A5F' }, // Azul oscuro
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        bottom: { style: 'thin' },
      };
    });

    // ============================================================
    // Datos
    // ============================================================
    let totalDebit = 0;
    let totalCredit = 0;

    transactions.forEach((txn, index) => {
      const row = sheet.addRow([
        index + 1,
        txn.txn_date,
        txn.description,
        txn.debit ?? '',
        txn.credit ?? '',
        txn.balance ?? '',
      ]);

      // Formato de fecha
      const dateCell = row.getCell(2);
      dateCell.numFmt = 'dd/mm/yyyy';
      if (txn.txn_date) {
        dateCell.value = new Date(txn.txn_date + 'T00:00:00');
      }

      // Formato numérico contable
      const debitCell = row.getCell(4);
      const creditCell = row.getCell(5);
      const balanceCell = row.getCell(6);

      [debitCell, creditCell, balanceCell].forEach((cell) => {
        cell.numFmt = '#,##0.00';
        cell.alignment = { horizontal: 'right' };
      });

      // Color débitos en rojo suave, créditos en verde suave
      if (txn.debit != null) {
        debitCell.font = { color: { argb: 'FF8B0000' } };
        totalDebit += txn.debit;
      }
      if (txn.credit != null) {
        creditCell.font = { color: { argb: 'FF006400' } };
        totalCredit += txn.credit;
      }

      // Alternar color de fila
      if (index % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF8F9FA' },
          };
        });
      }
    });

    // ============================================================
    // Fila de totales
    // ============================================================
    sheet.addRow([]);
    const totalRow = sheet.addRow([
      '',
      '',
      'TOTALES',
      totalDebit,
      totalCredit,
      '',
    ]);

    totalRow.getCell(3).font = { bold: true };
    totalRow.getCell(4).numFmt = '#,##0.00';
    totalRow.getCell(4).font = { bold: true, color: { argb: 'FF8B0000' } };
    totalRow.getCell(5).numFmt = '#,##0.00';
    totalRow.getCell(5).font = { bold: true, color: { argb: 'FF006400' } };

    // ============================================================
    // Anchos de columna
    // ============================================================
    sheet.getColumn(1).width = 6;
    sheet.getColumn(2).width = 14;
    sheet.getColumn(3).width = 50;
    sheet.getColumn(4).width = 18;
    sheet.getColumn(5).width = 18;
    sheet.getColumn(6).width = 18;

    // Congelar primera fila de datos
    sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 8 }];

    // Generar buffer
    const buffer = await workbook.xlsx.writeBuffer();
    logger.info('Excel generado', { transactions: transactions.length });

    return Buffer.from(buffer);
  }

  private formatDate(dateStr: string): string {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  }
}

export const excelService = new ExcelService();
