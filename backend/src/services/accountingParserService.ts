import ExcelJS from 'exceljs';
import { logger } from '../utils/logger';

export interface AccountingEntryInput {
  entryDate: string;      // YYYY-MM-DD
  description: string;
  debit: number | null;
  credit: number | null;
  accountCode: string | null;
  accountName: string | null;
}

class AccountingParserService {
  /**
   * Parsea un archivo de asientos contables (.xlsx, .xls, .csv) y retorna un array normalizado.
   */
  async parseFile(buffer: Buffer, mimetype: string): Promise<AccountingEntryInput[]> {
    try {
      if (mimetype === 'text/csv' || mimetype === 'application/csv') {
        return this.parseCsv(buffer.toString('utf-8'));
      } else {
        return await this.parseExcel(buffer);
      }
    } catch (err) {
      logger.error('Error parsing accounting file', err);
      throw new Error('No se pudo procesar el archivo de asientos contables. Verificá que el formato sea válido.');
    }
  }

  private parseCsv(csvText: string): AccountingEntryInput[] {
    const lines = csvText.split(/\r?\n/);
    if (lines.length === 0) return [];

    // Encontrar cabeceras
    let headerIndex = -1;
    let colIndices = { date: -1, desc: -1, debit: -1, credit: -1, account: -1 };

    for (let i = 0; i < Math.min(lines.length, 20); i++) {
      const cols = this.splitCsvLine(lines[i]).map(c => c.toLowerCase().trim());
      const dateIdx = cols.findIndex(c => c.includes('fecha') || c.includes('date'));
      const descIdx = cols.findIndex(c => c.includes('concepto') || c.includes('desc') || c.includes('leyenda') || c.includes('detalle'));
      const debeIdx = cols.findIndex(c => c.includes('debe') || c.includes('debit') || c.includes('ingreso'));
      const haberIdx = cols.findIndex(c => c.includes('haber') || c.includes('credit') || c.includes('egreso'));

      if (dateIdx !== -1 && (debeIdx !== -1 || haberIdx !== -1)) {
        headerIndex = i;
        colIndices = {
          date: dateIdx,
          desc: descIdx !== -1 ? descIdx : 1,
          debit: debeIdx,
          credit: haberIdx,
          account: cols.findIndex(c => c.includes('cuenta') || c.includes('codigo') || c.includes('acc')),
        };
        break;
      }
    }

    if (headerIndex === -1) {
      // Fallback a columnas por defecto
      colIndices = { date: 0, desc: 1, debit: 2, credit: 3, account: -1 };
      headerIndex = 0; // Asumir que la primera fila es cabecera
    }

    const entries: AccountingEntryInput[] = [];

    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = this.splitCsvLine(line);
      const rawDate = cols[colIndices.date];
      const rawDesc = cols[colIndices.desc] || '';
      const rawDebit = cols[colIndices.debit];
      const rawCredit = cols[colIndices.credit];
      const rawAccount = colIndices.account !== -1 ? cols[colIndices.account] : null;

      if (!rawDate) continue;

      const entryDate = this.normalizeDate(rawDate);
      if (!entryDate) continue; // Saltar si la fecha no es válida

      entries.push({
        entryDate,
        description: rawDesc.trim(),
        debit: this.parseAmount(rawDebit),
        credit: this.parseAmount(rawCredit),
        accountCode: rawAccount ? rawAccount.trim() : null,
        accountName: null,
      });
    }

    logger.info(`CSV parseado con éxito: ${entries.length} asientos encontrados`);
    return entries;
  }

  private async parseExcel(buffer: Buffer): Promise<AccountingEntryInput[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error('El archivo Excel no tiene hojas.');

    let headerRowIndex = -1;
    let colIndices = { date: -1, desc: -1, debit: -1, credit: -1, account: -1 };

    // Buscar la fila de cabeceras en las primeras 30 filas
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > 30 || headerRowIndex !== -1) return;

      const values = (row.values as any[]).map(v => 
        (v && typeof v === 'object' && 'text' in v ? v.text : String(v || '')).toLowerCase().trim()
      );

      const dateIdx = values.findIndex(v => v.includes('fecha') || v.includes('date'));
      const debeIdx = values.findIndex(v => v.includes('debe') || v.includes('debit') || v.includes('ingreso'));
      const haberIdx = values.findIndex(v => v.includes('haber') || v.includes('credit') || v.includes('egreso'));

      if (dateIdx !== -1 && (debeIdx !== -1 || haberIdx !== -1)) {
        headerRowIndex = rowNumber;
        colIndices = {
          date: dateIdx,
          desc: values.findIndex(v => v.includes('concepto') || v.includes('desc') || v.includes('leyenda') || v.includes('detalle')),
          debit: debeIdx,
          credit: haberIdx,
          account: values.findIndex(v => v.includes('cuenta') || v.includes('codigo') || v.includes('acc')),
        };
      }
    });

    if (headerRowIndex === -1) {
      // Fallback a columnas por defecto
      colIndices = { date: 1, desc: 2, debit: 3, credit: 4, account: -1 };
      headerRowIndex = 1;
    }

    const entries: AccountingEntryInput[] = [];

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= headerRowIndex) return; // Saltar cabeceras e info anterior

      const rawDateVal = row.getCell(colIndices.date).value;
      const rawDescVal = colIndices.desc !== -1 ? row.getCell(colIndices.desc).value : '';
      const rawDebitVal = row.getCell(colIndices.debit).value;
      const rawCreditVal = row.getCell(colIndices.credit).value;
      const rawAccountVal = colIndices.account !== -1 ? row.getCell(colIndices.account).value : null;

      if (!rawDateVal) return;

      let entryDate = '';
      if (rawDateVal instanceof Date) {
        entryDate = rawDateVal.toISOString().split('T')[0];
      } else {
        entryDate = this.normalizeDate(String(rawDateVal)) || '';
      }

      if (!entryDate) return; // Fecha inválida

      const description = typeof rawDescVal === 'object' && rawDescVal && 'text' in rawDescVal
        ? (rawDescVal as any).text
        : String(rawDescVal || '');

      entries.push({
        entryDate,
        description: description.trim(),
        debit: this.parseAmount(rawDebitVal),
        credit: this.parseAmount(rawCreditVal),
        accountCode: rawAccountVal ? String(rawAccountVal).trim() : null,
        accountName: null,
      });
    });

    logger.info(`Excel parseado con éxito: ${entries.length} asientos encontrados`);
    return entries;
  }

  private splitCsvLine(line: string): string[] {
    // Parser simple de CSV que maneja comillas
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if ((char === ',' || char === ';') && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  private parseAmount(val: any): number | null {
    if (val == null) return null;
    if (typeof val === 'number') return val === 0 ? null : Math.abs(val);
    
    // Si es un objeto de ExcelJS (ej: formula)
    if (typeof val === 'object' && 'result' in val) {
      return this.parseAmount(val.result);
    }

    const clean = String(val)
      .replace(/\s/g, '')
      .replace(/\./g, '') // Eliminar puntos de miles
      .replace(',', '.');  // Convertir coma decimal a punto

    const num = parseFloat(clean);
    return isNaN(num) || num === 0 ? null : Math.abs(num);
  }

  private normalizeDate(dateStr: string): string | null {
    const clean = dateStr.trim();
    
    // Formato DD/MM/YYYY o DD-MM-YYYY
    const dmyMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      const year = dmyMatch[3];
      return `${year}-${month}-${day}`;
    }

    // Formato YYYY-MM-DD
    const ymdMatch = clean.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
    if (ymdMatch) {
      return `${ymdMatch[1]}-${ymdMatch[2]}-${ymdMatch[3]}`;
    }

    return null;
  }
}

export const accountingParserService = new AccountingParserService();
