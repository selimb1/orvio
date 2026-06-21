'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useDropzone } from 'react-dropzone';
import { 
  ArrowLeft, 
  Loader2, 
  AlertTriangle, 
  CheckCircle2, 
  Upload, 
  FileSpreadsheet, 
  History,
  FileText,
  DollarSign,
  ArrowRight,
  TrendingDown,
  Info
} from 'lucide-react';
import Link from 'next/link';
import DashboardLayout from '@/app/dashboard/layout';

interface ClientMeta {
  id: string;
  name: string;
  cuit: string | null;
}

interface CompletedStatement {
  id: string;
  file_name: string;
  bank_detected: string | null;
  period_from: string | null;
  period_to: string | null;
}

interface ReconciliationDeviation {
  type: 'unmatched_bank' | 'unmatched_accounting' | 'amount_mismatch';
  severity: 'high' | 'medium' | 'low' | 'info';
  date: string;
  description: string;
  amount: number;
  details: {
    difference?: number;
    explanation: string;
  };
}

interface ReconciliationReport {
  id: string;
  generated_at: string;
  total_deviations: number;
  deviations: ReconciliationDeviation[];
  bank_statements?: { file_name: string };
  statement_id?: string;
}

interface HistoryReport {
  id: string;
  generated_at: string;
  total_deviations: number;
  bank_statements: { file_name: string } | null;
}

export default function Module2Page({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const clientId = params.id;
  const router = useRouter();

  const [client, setClient] = useState<ClientMeta | null>(null);
  const [loadingClient, setLoadingClient] = useState(true);

  // Statements for dropdown selection
  const [statements, setStatements] = useState<CompletedStatement[]>([]);
  const [selectedStatementId, setSelectedStatementId] = useState('');
  const [loadingStatements, setLoadingStatements] = useState(true);

  // Upload/Processing states
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  
  // Selected report states
  const [activeReport, setActiveReport] = useState<ReconciliationReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  
  // History of reports
  const [reportsHistory, setReportsHistory] = useState<HistoryReport[]>([]);
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

  // Load completed statements list (for the dropdown)
  useEffect(() => {
    async function loadStatements() {
      try {
        const { data, error } = await supabase
          .from('bank_statements')
          .select('id, file_name, bank_detected, period_from, period_to')
          .eq('client_id', clientId)
          .eq('status', 'completed')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setStatements(data || []);
        if (data && data.length > 0) {
          setSelectedStatementId(data[0].id);
        }
      } catch (err) {
        console.error('Error loading statements for module2', err);
      } finally {
        setLoadingStatements(false);
      }
    }
    loadStatements();
  }, [clientId, supabase]);

  // Load reports history
  const loadReportsHistory = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/module2/client/${clientId}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) throw new Error('Error al cargar historial de reportes');
      const data = await res.json();
      setReportsHistory(data.reports || []);
    } catch (err) {
      console.error('Reports history load error', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [clientId, supabase]);

  useEffect(() => {
    loadReportsHistory();
  }, [loadReportsHistory]);

  // Fetch report details
  const loadReportDetails = async (reportId: string) => {
    setLoadingReport(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/module2/${reportId}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) throw new Error('Error al cargar reporte');
      const data = await res.json();
      setActiveReport(data.report);
    } catch (err) {
      console.error('Report detail error', err);
      alert('No se pudo cargar el informe seleccionado.');
    } finally {
      setLoadingReport(false);
    }
  };

  // Dropzone for accounting entries upload
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    if (!selectedStatementId) {
      setUploadError('Por favor, seleccioná primero el extracto bancario con el que vas a conciliar.');
      return;
    }

    const file = acceptedFiles[0];
    setUploading(true);
    setUploadError('');
    setActiveReport(null);

    const formData = new FormData();
    formData.append('accountingFile', file);
    formData.append('clientId', clientId);
    formData.append('statementId', selectedStatementId);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sesión expirada.');

      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/module2/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al procesar la conciliación');
      }

      // Load the generated report details
      await loadReportDetails(data.reportId);
      loadReportsHistory();
    } catch (err: any) {
      setUploadError(err.message || 'Error de red al procesar el archivo');
    } finally {
      setUploading(false);
    }
  }, [clientId, selectedStatementId, loadReportsHistory, supabase]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
  });

  const getSeverityBadge = (severity: ReconciliationDeviation['severity']) => {
    switch (severity) {
      case 'high':
        return <span className="badge badge-danger">Crítico</span>;
      case 'medium':
        return <span className="badge badge-warning">Medio</span>;
      case 'low':
        return <span className="badge badge-primary">Bajo</span>;
      case 'info':
        return <span className="badge badge-neutral">Info</span>;
    }
  };

  const getDeviationTypeLabel = (type: ReconciliationDeviation['type']) => {
    switch (type) {
      case 'unmatched_bank':
        return 'No Contabilizado (Banco)';
      case 'unmatched_accounting':
        return 'No Reflejado (Asiento)';
      case 'amount_mismatch':
        return 'Diferencia Importe';
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
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Detección de Desvíos (M2)</h1>
          <p className="text-sm text-slate-400 mt-1.5">
            Cliente: <span className="text-blue-400 font-bold">{client?.name}</span>
            {client?.cuit && <span className="text-slate-500"> • CUIT: {client.cuit}</span>}
          </p>
        </div>

        {/* Upload + Analysis Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Panel: Inputs & Reports history */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Input card */}
            <div className="card border-slate-800 bg-slate-900/40">
              <h3 className="font-bold text-white mb-4">Nueva Conciliación</h3>
              
              <div className="space-y-4">
                {/* Step 1: Select Statement */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    1. Elegir Extracto Bancario
                  </label>
                  {loadingStatements ? (
                    <div className="h-10 skeleton" />
                  ) : statements.length === 0 ? (
                    <div className="text-xs text-amber-400 bg-amber-950/20 border border-amber-900/30 p-3 rounded-lg">
                      No hay extractos procesados para este cliente. Primero debés subir uno en el <Link href={`/clients/${clientId}/module1`} className="underline font-semibold hover:text-amber-300">Módulo 1</Link>.
                    </div>
                  ) : (
                    <select
                      value={selectedStatementId}
                      onChange={(e) => setSelectedStatementId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-sm text-white focus:border-blue-500/80 outline-none transition-all"
                    >
                      {statements.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.file_name} ({s.bank_detected || 'Banco'})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Step 2: Upload accounting file */}
                {statements.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      2. Subir Archivo Contable
                    </label>
                    <div 
                      {...getRootProps()} 
                      className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                        isDragActive 
                          ? 'border-indigo-500 bg-indigo-600/5' 
                          : 'border-slate-800 hover:border-slate-700 bg-slate-950/20'
                      }`}
                    >
                      <input {...getInputProps()} />
                      <Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-white">Arrastrá el Libro Diario o Mayor acá</p>
                      <p className="text-[10px] text-slate-500 mt-1">Excel (.xlsx, .xls) o CSV</p>
                    </div>
                  </div>
                )}
              </div>

              {uploading && (
                <div className="flex items-center justify-center gap-2 text-slate-400 text-xs mt-4">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                  Comparando y detectando desvíos...
                </div>
              )}

              {uploadError && (
                <div className="flex items-start gap-2.5 bg-red-950/40 border border-red-500/30 rounded-lg p-3 mt-4 text-xs text-red-300">
                  <AlertTriangle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                  <span>{uploadError}</span>
                </div>
              )}
            </div>

            {/* Reports History */}
            <div className="card border-slate-800 bg-slate-900/40">
              <h3 className="font-bold text-white mb-4">Informes Previos</h3>

              {loadingHistory ? (
                <div className="space-y-2">
                  <div className="h-10 skeleton" />
                  <div className="h-10 skeleton" />
                </div>
              ) : reportsHistory.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">No se generaron reportes previos de conciliación.</p>
              ) : (
                <div className="space-y-3 max-h-[35vh] overflow-y-auto pr-1">
                  {reportsHistory.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => loadReportDetails(item.id)}
                      className={`w-full text-left p-3 rounded-lg border text-xs flex items-center justify-between gap-3 transition-all ${
                        activeReport?.id === item.id
                          ? 'border-indigo-500 bg-indigo-950/20'
                          : 'border-slate-800 hover:border-slate-700 bg-slate-950/20'
                      }`}
                    >
                      <div className="min-w-0">
                        <span className="block font-semibold text-white truncate">
                          {item.bank_statements?.file_name || 'Extracto'}
                        </span>
                        <span className="block text-[10px] text-slate-500 mt-0.5">
                          {new Date(item.generated_at).toLocaleDateString('es-AR')}
                        </span>
                      </div>
                      <span className={`badge ${item.total_deviations > 0 ? 'badge-warning' : 'badge-success'} shrink-0`}>
                        {item.total_deviations} desvíos
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Right Panel: Active Report Results */}
          <div className="lg:col-span-2 space-y-6">
            {loadingReport ? (
              <div className="card h-full flex flex-col items-center justify-center text-center border-slate-800 bg-slate-900/40 py-20">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
                <h3 className="font-semibold text-white font-medium">Cargando reporte de desvíos</h3>
              </div>
            ) : !activeReport ? (
              <div className="card h-full flex flex-col items-center justify-center text-center border-slate-800 bg-slate-900/40 py-20">
                <AlertTriangle className="w-16 h-16 text-slate-700 mb-4" />
                <h3 className="font-semibold text-white">Ningún informe activo</h3>
                <p className="text-slate-500 text-sm mt-1 max-w-sm">
                  Subí los asientos contables o seleccioná un informe previo del historial para ver el análisis de diferencias.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                
                {/* Overview Header */}
                <div className="card border-slate-800 bg-slate-900/40 p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                    <div>
                      <h2 className="text-xl font-bold text-white">Reporte de Conciliación</h2>
                      <span className="block text-xs text-slate-500 mt-1">Generado: {new Date(activeReport.generated_at).toLocaleString('es-AR')}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      {activeReport.total_deviations === 0 ? (
                        <div className="badge badge-success py-1.5 px-3 flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" /> Conciliado Ok
                        </div>
                      ) : (
                        <div className="badge badge-warning py-1.5 px-3 flex items-center gap-1 font-bold">
                          <AlertTriangle className="w-4 h-4" /> {activeReport.total_deviations} Desvíos Detectados
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center text-red-400 border border-slate-700">
                        <TrendingDown className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Críticos (High)</span>
                        <span className="text-sm font-bold text-white">
                          {activeReport.deviations.filter(d => d.severity === 'high').length}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center text-amber-400 border border-slate-700">
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Medios (Medium)</span>
                        <span className="text-sm font-bold text-white">
                          {activeReport.deviations.filter(d => d.severity === 'medium').length}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center text-blue-400 border border-slate-700">
                        <Info className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Leves (Low/Info)</span>
                        <span className="text-sm font-bold text-white">
                          {activeReport.deviations.filter(d => d.severity === 'low' || d.severity === 'info').length}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Deviations table list */}
                {activeReport.deviations.length > 0 && (
                  <div className="card border-slate-800 bg-slate-900/40">
                    <h3 className="font-bold text-white mb-4">Detalle de Diferencias</h3>

                    <div className="overflow-x-auto">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Severidad</th>
                            <th>Tipo Desvío</th>
                            <th>Fecha</th>
                            <th>Descripción</th>
                            <th className="text-right">Importe</th>
                            <th>Explicación / Detalle</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeReport.deviations.map((d, index) => (
                            <tr key={index} className="border-slate-850/80">
                              <td>{getSeverityBadge(d.severity)}</td>
                              <td className="font-semibold text-slate-300 whitespace-nowrap">
                                {getDeviationTypeLabel(d.type)}
                              </td>
                              <td className="text-slate-400 whitespace-nowrap">
                                {new Date(d.date + 'T00:00:00').toLocaleDateString('es-AR')}
                              </td>
                              <td className="text-white max-w-xs truncate" title={d.description}>{d.description}</td>
                              <td className="text-right font-bold text-slate-200">
                                ${d.amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="text-slate-300 text-xs min-w-[200px]">
                                {d.details.explanation}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Success message when clean report */}
                {activeReport.total_deviations === 0 && (
                  <div className="card flex flex-col items-center justify-center text-center border-slate-800 bg-slate-900/40 py-16">
                    <CheckCircle2 className="w-16 h-16 text-emerald-500 mb-4" />
                    <h3 className="font-bold text-white">¡Conciliación Perfecta!</h3>
                    <p className="text-slate-400 text-sm mt-1 max-w-sm">
                      No se detectaron diferencias entre el extracto bancario y los asientos contables del estudio. Todos los importes y fechas cuadran dentro de los límites esperados.
                    </p>
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
