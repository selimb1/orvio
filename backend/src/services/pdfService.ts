import pdfParse from 'pdf-parse';
import { logger } from '../utils/logger';

export interface PdfContent {
  type: 'text' | 'image';
  text?: string;       // Para PDFs con texto seleccionable
  pages?: Buffer[];    // Para PDFs escaneados (imágenes por página)
  pageCount: number;
}

/**
 * Tamaño mínimo de texto para considerar que el PDF es seleccionable.
 * Si el texto extraído es muy corto, asumimos que es un PDF escaneado.
 */
const MIN_TEXT_LENGTH_PER_PAGE = 100;

class PdfService {
  /**
   * Extrae el contenido de un PDF.
   * Detecta automáticamente si es texto seleccionable o escaneado.
   * 
   * @param buffer - Buffer del PDF en memoria
   * @returns PdfContent con texto o imágenes de cada página
   */
  async extractContent(buffer: Buffer): Promise<PdfContent> {
    try {
      // Intentar extracción de texto primero
      const parsed = await pdfParse(buffer, {
        // No ejecutar JavaScript embebido en el PDF (seguridad)
        max: 0,
      });

      const pageCount = parsed.numpages;
      const text = parsed.text?.trim() ?? '';

      // Si el texto por página es suficiente, es un PDF seleccionable
      const avgTextPerPage = text.length / Math.max(pageCount, 1);

      if (avgTextPerPage >= MIN_TEXT_LENGTH_PER_PAGE) {
        logger.debug('PDF con texto seleccionable detectado', { pageCount, textLength: text.length });
        return {
          type: 'text',
          text: this.cleanText(text),
          pageCount,
        };
      }

      // PDF con poco texto → probablemente escaneado
      // Por ahora devolvemos el texto (podría ser escaneado con poco texto)
      // En una implementación completa, aquí convertiríamos a imágenes con sharp/pdfjs
      logger.warn('PDF con poco texto — puede ser escaneado', { pageCount, textLength: text.length });
      return {
        type: 'text',
        text: text.length > 0 ? this.cleanText(text) : '[PDF escaneado sin texto extraíble]',
        pageCount,
      };
    } catch (err) {
      logger.error('Error al procesar PDF', err);
      throw new Error('No se pudo procesar el archivo PDF. Verificá que no esté dañado o protegido con contraseña.');
    }
  }

  /**
   * Limpia y normaliza el texto extraído del PDF.
   * - Elimina caracteres de control
   * - Normaliza espacios en blanco
   * - Limita longitud para no exceder tokens del modelo
   */
  private cleanText(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Chars de control
      .replace(/\n{3,}/g, '\n\n')                          // Máximo 2 saltos de línea
      .trim()
      .slice(0, 80000); // ~20k tokens máx (seguridad)
  }
}

export const pdfService = new PdfService();
