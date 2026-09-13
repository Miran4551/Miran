import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Chip, CircularProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { Award, BookOpen, CheckCircle2, XCircle } from 'lucide-react';
import { DataPageShell, EmptyState } from '../components/ui';
import { apiClient } from '../api/client';

export const AcademicLogbook: React.FC = () => {
  const qc = useQueryClient();
  const cases = useQuery({
    queryKey: ['academic-logbook-cases'],
    queryFn: async () => (await apiClient.get('/logbook/cases')).data?.data ?? [],
  });
  const evaluations = useQuery({
    queryKey: ['academic-evaluations'],
    queryFn: async () => (await apiClient.get('/operations/evaluations')).data?.data ?? [],
  });
  const approve = useMutation({
    mutationFn: async (id: string) => (await apiClient.post(`/logbook/entries/${id}/approve`, {})).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['academic-logbook-cases'] }),
  });
  const reject = useMutation({
    mutationFn: async (id: string) => {
      const reason = window.prompt('سبب رفض السجل:');
      if (!reason?.trim()) throw new Error('سبب الرفض إلزامي');
      return (await apiClient.patch(`/logbook/entries/${id}/reject`, { feedback: reason.trim() })).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['academic-logbook-cases'] }),
  });

  const rows: any[] = cases.data ?? [];
  const evalRows: any[] = evaluations.data ?? [];
  const pending = rows.filter((r) => r.status === 'submitted');

  return (
    <DataPageShell
      title="اعتماد Logbook والتقييمات"
      subtitle="مراجعة السجلات السريرية والتقييمات ضمن نطاق الجامعة — دون استخدام واجهات المتدرب الشخصية"
      icon={BookOpen}
      stats={[
        { label: 'سجلات سريرية', value: rows.length, icon: BookOpen, tone: 'primary' },
        { label: 'بانتظار الاعتماد', value: pending.length, icon: Award, tone: pending.length ? 'warning' : 'success' },
        { label: 'التقييمات', value: evalRows.length, icon: CheckCircle2, tone: 'info' },
      ]}
    >
      {cases.isError && <Alert severity="error" sx={{ mb: 2 }}>تعذر تحميل السجلات الأكاديمية. حدّث الصفحة وحاول مرة أخرى.</Alert>}
      {cases.isLoading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box> : !rows.length ? <EmptyState icon={BookOpen} title="لا توجد سجلات سريرية ضمن نطاقك" hint="سيظهر هنا ما يرتبط بالجهة التنظيمية الحالية فقط." /> : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead><TableRow>{['التشخيص / الإجراء','المتدرب','المدرب','الحالة','التاريخ','الإجراء'].map((h) => <TableCell key={h} sx={{ fontWeight: 800 }}>{h}</TableCell>)}</TableRow></TableHead>
            <TableBody>{rows.map((row) => <TableRow key={row.id} hover>
              <TableCell sx={{ fontWeight: 700 }}>{row.diagnosis || '—'}<Typography variant="caption" display="block" color="text.secondary">{row.procedure?.titleAr || ''}</Typography></TableCell>
              <TableCell>{row.traineeProfile?.person?.nameAr || '—'}</TableCell>
              <TableCell>{row.trainerProfile?.person?.nameAr || '—'}</TableCell>
              <TableCell><Chip size="small" label={row.status === 'submitted' ? 'بانتظار الاعتماد' : row.status === 'completed' ? 'معتمد أكاديمياً' : row.status} color={row.status === 'submitted' ? 'warning' : row.status === 'completed' ? 'success' : 'default'} /></TableCell>
              <TableCell>{row.performedAt ? new Date(row.performedAt).toLocaleDateString('ar-SA') : '—'}</TableCell>
              <TableCell>{row.status === 'submitted' ? <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button size="small" variant="contained" color="success" startIcon={<CheckCircle2 size={14}/>} disabled={approve.isPending} onClick={() => approve.mutate(row.id)}>اعتماد</Button>
                <Button size="small" variant="outlined" color="error" startIcon={<XCircle size={14}/>} disabled={reject.isPending} onClick={() => reject.mutate(row.id)}>رفض</Button>
              </Box> : '—'}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </TableContainer>
      )}
      <Box sx={{ mt: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>التقييمات الأكاديمية</Typography>
        {evaluations.isLoading ? <CircularProgress size={22}/> : !evalRows.length ? <Alert severity="info">لا توجد تقييمات ظاهرة ضمن نطاق الجهة الحالية.</Alert> : <TableContainer component={Paper}><Table size="small"><TableHead><TableRow>{['المتدرب','النموذج','المقيّم','الدرجة','التاريخ'].map((h) => <TableCell key={h} sx={{ fontWeight: 800 }}>{h}</TableCell>)}</TableRow></TableHead><TableBody>{evalRows.slice(0, 100).map((e) => <TableRow key={e.id}><TableCell>{e.evaluatee?.person?.nameAr || '—'}</TableCell><TableCell>{e.form?.nameAr || e.evaluationType || '—'}</TableCell><TableCell>{e.evaluator?.person?.nameAr || '—'}</TableCell><TableCell>{e.totalScore ?? '—'}</TableCell><TableCell>{e.submittedAt ? new Date(e.submittedAt).toLocaleDateString('ar-SA') : '—'}</TableCell></TableRow>)}</TableBody></Table></TableContainer>}
      </Box>
    </DataPageShell>
  );
};

export default AcademicLogbook;
