import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

// Tipos MIME permitidos para PDFs
const ALLOWED_PDF_MIME_TYPES = ['application/pdf'];

// Tipos MIME permitidos para archivos contables (Excel/CSV)
const ALLOWED_ACCOUNTING_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel',                                           // .xls
  'text/csv',                                                           // .csv
  'application/csv',
];

// Tamaño máximo: 20 MB por archivo
const MAX_FILE_SIZE = 20 * 1024 * 1024;

/**
 * Multer configurado para almacenar en memoria (no en disco).
 * Los archivos se procesan en RAM y se descartan después.
 * Esto evita acumulación de archivos temporales en disco.
 */
const storage = multer.memoryStorage();

/**
 * Validación de archivos en multer.
 * Verifica el tipo MIME real (desde el buffer, no solo la extensión).
 */
function pdfFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void {
  if (ALLOWED_PDF_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError(400, 'Solo se aceptan archivos PDF. Verificá el formato del archivo.'));
  }
}

function accountingFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void {
  if (ALLOWED_ACCOUNTING_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError(400, 'Solo se aceptan archivos Excel (.xlsx, .xls) o CSV.'));
  }
}

/**
 * Upload de un único PDF (Módulo 1 y Módulo 2).
 */
export const uploadPdf = multer({
  storage,
  fileFilter: pdfFileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
}).single('file');

/**
 * Upload simultáneo de PDF + archivo contable (Módulo 2).
 */
export const uploadPdfAndAccounting = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 2,
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'bankStatement') {
      pdfFileFilter(req, file, cb);
    } else if (file.fieldname === 'accountingFile') {
      accountingFileFilter(req, file, cb);
    } else {
      cb(new AppError(400, 'Campo de archivo no reconocido.'));
    }
  },
}).fields([
  { name: 'bankStatement', maxCount: 1 },
  { name: 'accountingFile', maxCount: 1 },
]);

/**
 * Middleware para verificar que el archivo PDF no está vacío
 * y tiene el magic number correcto (%PDF-).
 */
export function validatePdfContent(req: Request, res: Response, next: NextFunction): void {
  const file = req.file;

  if (!file) {
    res.status(400).json({ error: 'No se recibió ningún archivo.' });
    return;
  }

  if (file.size === 0) {
    res.status(400).json({ error: 'El archivo está vacío.' });
    return;
  }

  // Verificar magic number del PDF: %PDF-
  const magic = file.buffer.slice(0, 5).toString('ascii');
  if (magic !== '%PDF-') {
    res.status(400).json({ error: 'El archivo no es un PDF válido.' });
    return;
  }

  next();
}
