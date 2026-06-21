import { z } from 'zod';
import { openai } from '../lib/openai';
import { env } from '../utils/env';
import { logger } from '../utils/logger';
import type { PdfContent } from './pdfService';

// ============================================================
// Schemas Zod estrictos para validar la respuesta del modelo
// ============================================================

const transactionSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha debe estar en formato YYYY-MM-DD')
    .describe('Fecha de la transacción en formato YYYY-MM-DD'),
  description: z.string().min(1).max(500).describe('Descripción o concepto del movimiento'),
  debit: z
    .number()
    .positive()
    .nullable()
    .optional()
    .describe('Importe debitado (débito) en pesos argentinos, null si no aplica'),
  credit: z
    .number()
    .positive()
    .nullable()
    .optional()
    .describe('Importe acreditado (crédito) en pesos argentinos, null si no aplica'),
  balance: z
    .number()
    .nullable()
    .optional()
    .describe('Saldo después del movimiento, null si no disponible'),
});

const bankStatementSchema = z.object({
  bankName: z
    .string()
    .nullable()
    .optional()
    .describe('Nombre del banco detectado (ej: Galicia, Santander, BBVA, Nación, Macro, ICBC)'),
  accountNumber: z
    .string()
    .nullable()
    .optional()
    .describe('Número de cuenta bancaria si está disponible en el extracto'),
  periodFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .describe('Fecha de inicio del período del extracto en formato YYYY-MM-DD'),
  periodTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .describe('Fecha de fin del período del extracto en formato YYYY-MM-DD'),
  currency: z.enum(['ARS', 'USD', 'EUR']).default('ARS').describe('Moneda de los importes'),
  transactions: z
    .array(transactionSchema)
    .min(1, 'Debe haber al menos una transacción')
    .describe('Lista de movimientos del extracto bancario'),
});

export type BankStatementExtraction = z.infer<typeof bankStatementSchema>;
export type TransactionExtraction = z.infer<typeof transactionSchema>;

// ============================================================
// Prompt para el modelo
// ============================================================
const SYSTEM_PROMPT = `Eres un asistente especializado en contabilidad argentina. 
Tu tarea es extraer movimientos bancarios de extractos de bancos argentinos.

INSTRUCCIONES:
1. Analiza el texto del extracto bancario proporcionado.
2. Extrae TODOS los movimientos bancarios (débitos, créditos, transferencias, comisiones, impuestos, etc.).
3. Las fechas DEBEN estar en formato ISO 8601 (YYYY-MM-DD). Si el extracto usa formato DD/MM/YYYY, convertí.
4. Los importes son números decimales sin separadores de miles. Usar punto como decimal.
5. Un movimiento es un DÉBITO cuando reduce el saldo (salida de dinero), y un CRÉDITO cuando lo aumenta.
6. Si un campo no está disponible en el extracto, devolver null.
7. Devuelve ÚNICAMENTE el JSON válido, sin texto adicional ni markdown.

BANCOS ARGENTINOS CONOCIDOS: Galicia, Santander, BBVA, Banco Nación, Macro, ICBC, Supervielle, 
Patagonia, Ciudad, Provincia, Credicoop, Hipotecario, Industrial, Itaú, HSBC, Comafi.`;

class OpenAIService {
  /**
   * Extrae movimientos bancarios de un PDF usando GPT-4o.
   * Valida la respuesta estrictamente con Zod antes de retornarla.
   * Si la validación falla, lanza un error — nunca retorna datos sin validar.
   */
  async extractBankTransactions(pdfContent: PdfContent): Promise<BankStatementExtraction> {
    const model = env.openaiModel();
    logger.info('Iniciando extracción de movimientos con IA', { model });

    try {
      let content: Parameters<typeof openai.chat.completions.create>[0]['messages'][0]['content'];

      if (pdfContent.type === 'text' && pdfContent.text) {
        content = [
          {
            type: 'text',
            text: `Extraé los movimientos bancarios de este extracto:\n\n${pdfContent.text}`,
          },
        ];
      } else if (pdfContent.type === 'image' && pdfContent.pages) {
        // Input multimodal para PDFs escaneados
        content = [
          {
            type: 'text',
            text: 'Extraé los movimientos bancarios de estas imágenes del extracto bancario:',
          },
          ...pdfContent.pages.map((page) => ({
            type: 'image_url' as const,
            image_url: {
              url: `data:image/png;base64,${page.toString('base64')}`,
              detail: 'high' as const,
            },
          })),
        ];
      } else {
        throw new Error('Contenido del PDF inválido');
      }

      const completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: content as any },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,     // Baja temperatura para respuestas más determinísticas
        max_tokens: 8000,
      });

      const rawResponse = completion.choices[0]?.message?.content;

      if (!rawResponse) {
        throw new Error('El modelo no devolvió ninguna respuesta');
      }

      // Parsear el JSON
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawResponse);
      } catch {
        logger.error('Respuesta de IA no es JSON válido', { rawResponse: rawResponse.slice(0, 200) });
        throw new Error('La respuesta del modelo no pudo interpretarse');
      }

      // Validar con Zod — si falla, lanza ZodError
      const validated = bankStatementSchema.parse(parsed);

      logger.info('Extracción completada', {
        transactions: validated.transactions.length,
        bank: validated.bankName,
        model,
        tokensUsed: completion.usage?.total_tokens,
      });

      return validated;
    } catch (err) {
      if (err instanceof z.ZodError) {
        logger.error('Respuesta de IA inválida (fallo de validación Zod)', {
          errors: err.errors,
        });
        // Lanzar error genérico — no exponer detalles de la IA al usuario
        throw new Error('No se pudo extraer información válida del extracto. Verificá que el PDF corresponde a un extracto bancario.');
      }
      throw err;
    }
  }
}

export const openaiService = new OpenAIService();
