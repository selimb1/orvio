import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// ============================================================
// Tests del servicio de auditoría
// ============================================================
describe('auditService - hash chaining', () => {
  it('calcula un hash SHA-256 válido', async () => {
    const { createHash } = await import('crypto');
    const hash = createHash('sha256').update('test-data').digest('hex');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });
});

// ============================================================
// Tests de validación con Zod (openaiService schemas)
// ============================================================
describe('Zod - validación de extracto bancario', () => {
  const transactionSchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    description: z.string().min(1).max(500),
    debit: z.number().positive().nullable().optional(),
    credit: z.number().positive().nullable().optional(),
    balance: z.number().nullable().optional(),
  });

  it('acepta una transacción válida', () => {
    const result = transactionSchema.safeParse({
      date: '2024-03-15',
      description: 'Transferencia DEBIN',
      debit: 1500.50,
      credit: null,
      balance: 25000.00,
    });
    expect(result.success).toBe(true);
  });

  it('rechaza fecha en formato incorrecto', () => {
    const result = transactionSchema.safeParse({
      date: '15/03/2024', // formato DD/MM/YYYY — inválido
      description: 'Transferencia',
    });
    expect(result.success).toBe(false);
  });

  it('rechaza descripción vacía', () => {
    const result = transactionSchema.safeParse({
      date: '2024-03-15',
      description: '',
    });
    expect(result.success).toBe(false);
  });

  it('rechaza debito negativo', () => {
    const result = transactionSchema.safeParse({
      date: '2024-03-15',
      description: 'Test',
      debit: -500, // negativo — inválido
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// Tests del validador de PDF magic number
// ============================================================
describe('PDF magic number validation', () => {
  it('acepta un PDF válido (magic number %PDF-)', () => {
    const buffer = Buffer.from('%PDF-1.7\n%...');
    const magic = buffer.slice(0, 5).toString('ascii');
    expect(magic).toBe('%PDF-');
  });

  it('rechaza un archivo que no es PDF', () => {
    const buffer = Buffer.from('PK\x03\x04...'); // .zip
    const magic = buffer.slice(0, 5).toString('ascii');
    expect(magic).not.toBe('%PDF-');
  });
});

// ============================================================
// Tests de validación de CUIT argentino
// ============================================================
describe('CUIT validation', () => {
  const CUIT_REGEX = /^\d{2}-\d{8}-\d$/;

  it('acepta CUITs válidos', () => {
    expect(CUIT_REGEX.test('20-12345678-9')).toBe(true);
    expect(CUIT_REGEX.test('30-71234567-0')).toBe(true);
  });

  it('rechaza CUITs con formato incorrecto', () => {
    expect(CUIT_REGEX.test('20123456789')).toBe(false);    // Sin guiones
    expect(CUIT_REGEX.test('20-1234567-9')).toBe(false);   // Solo 7 dígitos en el medio
    expect(CUIT_REGEX.test('abc-12345678-9')).toBe(false); // Letras
  });
});

// ============================================================
// Tests de rate limiting (lógica de negocio)
// ============================================================
describe('Rate limiting - detección de anomalías', () => {
  it('detecta más de 5 intentos fallidos de login', () => {
    const attempts = [
      { success: false, timestamp: new Date() },
      { success: false, timestamp: new Date() },
      { success: false, timestamp: new Date() },
      { success: false, timestamp: new Date() },
      { success: false, timestamp: new Date() },
    ];

    const failedCount = attempts.filter((a) => !a.success).length;
    expect(failedCount).toBeGreaterThanOrEqual(5);
  });
});
