'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useDropzone } from 'react-dropzone';
import { 
  FileText, 
  Upload, 
  ArrowLeft, 
  Loader2, 
  CheckCircle, 
  AlertTriangle, 
  FileSpreadsheet, 
  Download,
  Calendar,
  CreditCard,
  Building2,
  Clock,
  ExternalLink
} from 'lucide-react';
import Link from 'next/link';
import DashboardLayout from '@/app/dashboard/layout';

interface ClientMeta {
  id: string;
  name: string;
  cuit: string | null;
}

interface Statement {
  id: string;
  fileName: string;
  bankDetected: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  accountNumber: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage: string | null;
  createdAt: string;
}

interface Transaction {
  id: string;
  txn_date: string;
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number | null;
}

interface HistoryStatement {
  id: string;
  file_name: string;
  bank_detected: string | null;
  period_from: string | null;
  period_to: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
}

export default function Module1Page({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const clientId = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryStatementId = searchParams.get('statementId');

  const [client, setClient] = useState<ClientMeta | null>(null);
  const [loadingClient, setLoadingClient] = useState(true);

  // Upload states
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  
  // Selected statement & movements states
  const [activeStatement, setActiveStatement] = useState<Statement | null>(null);
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [loadingStatement, setLoadingStatement] = useState(false);
  
  // History
  const [history, setHistory] = useState<HistoryStatement[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const supabase = createClient();

  // Load client details
  useEffect(() => {
    async function loadClient() {
      try {
        const { data, error } = await supabase
          .from('clients')
          .select('id, name, cuit')
          .eq('id', clientId)
          .single();

        if (error || !data) {
          router.replace('/clients');
          return;
        }

        setClient(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingClient(false);
      }
    }
    loadClient();
  }, [clientId, router, supabase]);

  // Load history list
  const loadHistory = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/module1/client/${clientId}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) throw new Error('Error al cargar historial');
      const data = await res.json();
      setHistory(data.statements || []);
    } catch (err) {
      console.error('History load error', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [clientId, supabase]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Handle polling or loading details of a specific statement
  const loadStatementDetails = useCallback(async (statementId: string, shouldPoll = false) => {
    setLoadingStatement(true);
    let interval: NodeJS.Timeout | null = null;

    const fetchDetails = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return false;

        const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/module1/${statementId}`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!res.ok) throw new Error('No se pudo obtener el extracto');
        const data = await res.json();
        setActiveStatement(data.statement);
        setTransactions(data.transactions);

        if (data.statement.status === 'completed' || data.statement.status === 'failed') {
          // Stop polling and refresh history
          if (interval) clearInterval(interval);
          loadHistory();
          setLoadingStatement(false);
          return false;
        }
        return true; // continue polling
      } catch (err) {
        console.error('Detail fetch error', err);
        if (interval) clearInterval(interval);
        setLoadingStatement(false);
        return false;
      }
    };

    const isRunning = await fetchDetails();

    if (shouldPoll && isRunning) {
      interval = setInterval(async () => {
        const keepGoing = await fetchDetails();
        if (!keepGoing && interval) {
          clearInterval(interval);
        }
      }, 3000);
    } else if (!isRunning) {
      setLoadingStatement(false);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [loadHistory, supabase]);

  // Load statement from query param on initial mount
  useEffect(() => {
    if (queryStatementId) {
      loadStatementDetails(queryStatementId, true);
    }
  }, [queryStatementId, loadStatementDetails]);

  // File Dropzone Handler
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];

    setUploading(true);
    setUploadError('');
    setActiveStatement(null);
    setTransactions(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('clientId', clientId);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sesión expirada. Por favor reingresá.');

      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/module1/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Fallo al subir el extracto bancario');
      }

      // Begin polling status of the new statement
      loadStatementDetails(data.statementId, true);
    } catch (err: any) {
      setUploadError(err.message || 'Error de red al subir el archivo');
    } finally {
      setUploading(false);
    }
  }, [clientId, loadStatementDetails, supabase]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
  });

  const handleDownloadExcel = async (statementId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/module1/${statementId}/export`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) throw new Error('Error al generar Excel');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orvio_extracto_${statementId.slice(0, 8)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('No se pudo descargar el archivo Excel.');
    }
  };

  if (loadingClient) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="h-8 w-40 skeleton" />
          <div className="h-40 w-full skeleton" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-fade-in select-none">
        {/* Back Link */}
        <Link href="/clients" className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm font-semibold transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Volver a Clientes
        </Link>

        {/* Header */}
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Extracción de Extractos (M1)</h1>
          <p className="text-sm text-slate-400 mt-1.5">
            Cliente: <span className="text-blue-400 font-bold">{client?.name}</span>
            {client?.cuit && <span className="text-slate-500"> • CUIT: {client.cuit}</span>}
          </p>
        </div>

        {/* Upload + Main area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left panel: Upload dropzone & History */}
          <div className="lg:col-span-1 space-y-6">
            <div className="card border-slate-800 bg-slate-900/40">
              <h3 className="font-bold text-white mb-4">Cargar Extracto Bancario</h3>
              
              <div 
                {...getRootProps()} 
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  isDragActive 
                    ? 'border-blue-500 bg-blue-600/5' 
                    : 'border-slate-800 hover:border-slate-700 bg-slate-950/20'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                <p className="text-xs font-semibold text-white">Arrastrá un extracto PDF acá</p>
                <p className="text-[10px] text-slate-500 mt-1">O hacé click para buscar archivos</p>
                <span className="block badge badge-neutral text-[9px] scale-90 mt-3 font-mono">Solo archivos .pdf</span>
              </div>

              {uploading && (
                <div className="flex items-center justify-center gap-2 text-slate-400 text-xs mt-4">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  Subiendo archivo...
                </div>
              )}

              {uploadError && (
                <div className="flex items-start gap-2.5 bg-red-950/40 border border-red-500/30 rounded-lg p-3 mt-4 text-xs text-red-300">
                  <AlertTriangle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                  <span>{uploadError}</span>
                </div>
              )}
            </div>

            {/* Upload History */}
            <div className="card border-slate-800 bg-slate-900/40">
              <h3 className="font-bold text-white mb-4">Historial de Procesamientos</h3>

              {loadingHistory ? (
                <div className="space-y-2">
                  <div className="h-10 skeleton" />
                  <div className="h-10 skeleton" />
                </div>
              ) : history.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">No hay extractos previos para este cliente.</p>
              ) : (
                <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
                  {history.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => loadStatementDetails(item.id, item.status === 'processing')}
                      className={`w-full text-left p-3 rounded-lg border text-xs flex items-center justify-between gap-3 transition-all ${
                        activeStatement?.id === item.id
                          ? 'border-blue-500 bg-blue-950/20'
                          : 'border-slate-800 hover:border-slate-700 bg-slate-950/20'
                      }`}
                    >
                      <div className="min-w-0">
                        <span className="block font-semibold text-white truncate">{item.file_name}</span>
                        <span className="block text-[10px] text-slate-500 mt-0.5">
                          {new Date(item.created_at).toLocaleDateString('es-AR')}
                          {item.bank_detected && ` • ${item.bank_detected}`}
                        </span>
                      </div>
                      
                      {item.status === 'completed' && (
                        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                      )}
                      {item.status === 'processing' && (
                        <Loader2 className="w-4 h-4 text-amber-500 animate-spin shrink-0" />
                      )}
                      {item.status === 'failed' && (
                        <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right panel: Active Statement Details & Table */}
          <div className="lg:col-span-2 space-y-6">
            {!activeStatement ? (
              <div className="card h-full flex flex-col items-center justify-center text-center border-slate-800 bg-slate-900/40 py-20">
                <FileText className="w-16 h-16 text-slate-700 mb-4" />
                <h3 className="font-semibold text-white">Ningún extracto seleccionado</h3>
                <p className="text-slate-500 text-sm mt-1 max-w-sm">
                  Subí un nuevo PDF o elegí uno del historial para visualizar los movimientos extraídos por IA.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Meta details card */}
                <div className="card border-slate-800 bg-slate-900/40">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                    <div>
                      <h2 className="text-xl font-bold text-white truncate max-w-md">{activeStatement.fileName}</h2>
                      <span className="block text-xs text-slate-500 mt-1">ID: {activeStatement.id}</span>
                    </div>

                    {activeStatement.status === 'completed' && (
                      <button
                        onClick={() => handleDownloadExcel(activeStatement.id)}
                        className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 px-3.5 rounded-lg text-xs cursor-pointer shadow-lg shadow-emerald-600/10 active:scale-[0.98] transition-all"
                      >
                        <Download className="w-4 h-4" />
                        Exportar Excel
                      </button>
                    )}
                  </div>

                  {activeStatement.status === 'processing' && (
                    <div className="flex flex-col items-center justify-center text-center py-10">
                      <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-3" />
                      <h4 className="font-semibold text-white">Extrayendo movimientos con IA</h4>
                      <p className="text-xs text-slate-400 mt-1 max-w-xs">
                        Nuestro motor de IA está procesando el PDF, extrayendo las transacciones y normalizando los saldos. Esto toma unos segundos.
                      </p>
                    </div>
                  )}

                  {activeStatement.status === 'failed' && (
                    <div className="flex flex-col items-center justify-center text-center py-10">
                      <AlertTriangle className="w-10 h-10 text-red-500 mb-3" />
                      <h4 className="font-semibold text-white">Fallo en la extracción</h4>
                      <p className="text-xs text-red-400 mt-1 max-w-sm bg-red-950/20 border border-red-900/30 p-3 rounded-lg">
                        {activeStatement.errorMessage || 'No se pudo leer la información del extracto bancario.'}
                      </p>
                    </div>
                  )}

                  {activeStatement.status === 'completed' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center text-slate-300 border border-slate-700">
                          <Building2 className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Banco</span>
                          <span className="text-sm font-bold text-white">{activeStatement.bankDetected || 'Desconocido'}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center text-slate-300 border border-slate-700">
                          <CreditCard className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Cta Bancaria</span>
                          <span className="text-sm font-bold text-white truncate max-w-[120px] block">{activeStatement.accountNumber || 'N/D'}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center text-slate-300 border border-slate-700">
                          <Calendar className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Período</span>
                          <span className="text-xs font-bold text-white block">
                            {activeStatement.periodFrom ? new Date(activeStatement.periodFrom + 'T00:00:00').toLocaleDateString('es-AR') : 'N/D'} - 
                            {activeStatement.periodTo ? new Date(activeStatement.periodTo + 'T00:00:00').toLocaleDateString('es-AR') : 'N/D'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Disclaimer contable */}
                {activeStatement.status === 'completed' && (
                  <div className="disclaimer border-amber-900/50 bg-amber-950/20 text-amber-400">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <div>
                      <span className="font-bold block mb-0.5">Control de Auditoría Profesional</span>
                      <span>
                        Este reporte de movimientos fue generado automáticamente por Inteligencia Artificial. Por favor, verifique el saldo final y las transacciones críticas en el Excel final antes de cargarlo a los sistemas contables.
                      </span>
                    </div>
                  </div>
                )}

                {/* Transactions list */}
                {activeStatement.status === 'completed' && transactions && (
                  <div className="card border-slate-800 bg-slate-900/40">
                    <h3 className="font-bold text-white mb-4">Movimientos Detectados ({transactions.length})</h3>

                    <div className="overflow-x-auto">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Descripción</th>
                            <th className="text-right">Débito (Egreso)</th>
                            <th className="text-right">Crédito (Ingreso)</th>
                            <th className="text-right">Saldo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {transactions.map((txn) => (
                            <tr key={txn.id} className="border-slate-850/80">
                              <td className="text-slate-300">
                                {new Date(txn.txn_date + 'T00:00:00').toLocaleDateString('es-AR')}
                              </td>
                              <td className="text-white max-w-sm truncate" title={txn.description}>{txn.description}</td>
                              <td className="text-right font-medium text-red-400">
                                {txn.debit ? `$${txn.debit.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
                              </td>
                              <td className="text-right font-medium text-emerald-400">
                                {txn.credit ? `$${txn.credit.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
                              </td>
                              <td className="text-right font-semibold text-slate-300">
                                {txn.balance ? `$${txn.balance.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : 'N/D'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
