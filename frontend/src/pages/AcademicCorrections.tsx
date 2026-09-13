import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Chip, CircularProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { FileWarning, RotateCcw } from 'lucide-react';
import { DataPageShell, EmptyState } from '../components/ui';
import { apiClient } from '../api/client';
import { STATUS_LABELS_AR } from '../constants/status';

export const AcademicCorrections: React.FC = () => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['academic-returned-trainees'],
    queryFn: async () => (await apiClient.get('/training-requests/trainees/returned')).data?.data ?? [],
    refetchInterval: 30000,
  });
  const rows: any[] = data ?? [];

  return <DataPageShell
    icon={RotateCcw}
    title="معالجة التظلمات والتصحيحات"
    subtitle="متابعة الملفات التي أعادها التجمع الصحي للجامعة للتصحيح — العرض الأكاديمي للمتابعة دون تجاوز صلاحية الجامعة"
    loading={isLoading}
    stats={[
      { label: 'ملفات مُعادة', value: rows.length, icon: RotateCcw, tone: rows.length ? 'warning' : 'success' },
      { label: 'تحتاج مستندات', value: rows.filter((r) => (r.requiredDocuments?.length ?? 0) > 0).length, icon: FileWarning, tone: 'info' },
    ]}
  >
    {isError && <Alert severity="error" sx={{ mb: 2 }}>تعذر تحميل الملفات المُعادة.</Alert>}
    {isLoading ? <CircularProgress /> : !rows.length ? <EmptyState icon={RotateCcw} title="لا توجد ملفات مُعادة حالياً" hint="سيظهر هنا ما أعاده التجمع للجامعة ضمن نطاق الجهة الحالية." /> : <TableContainer component={Paper}><Table size="small"><TableHead><TableRow>{['المتدرب','الرقم الأكاديمي','الطلب','سبب الإرجاع','المستندات','آخر موعد','الحالة'].map((h) => <TableCell key={h} sx={{ fontWeight: 800 }}>{h}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map((row) => <TableRow key={row.id} hover><TableCell><Typography fontWeight={700}>{row.nameAr || '—'}</Typography><Typography variant="caption" color="text.secondary">{row.nationalId || ''}</Typography></TableCell><TableCell>{row.academicNumber || '—'}</TableCell><TableCell>{row.trainingRequest?.requestNumber || '—'}</TableCell><TableCell>{row.returnReason || row.officialComments || '—'}</TableCell><TableCell>{(row.requiredDocuments || []).length ? row.requiredDocuments.map((d: string) => <Chip key={d} size="small" label={d} sx={{ mr: .5, mb: .5 }} />) : '—'}</TableCell><TableCell>{row.correctionDeadline ? row.correctionDeadline.slice(0,10) : '—'}</TableCell><TableCell><Chip size="small" color="warning" label={STATUS_LABELS_AR[row.status] || row.status || '—'} /></TableCell></TableRow>)}</TableBody></Table></TableContainer>}
  </DataPageShell>;
};

export default AcademicCorrections;
