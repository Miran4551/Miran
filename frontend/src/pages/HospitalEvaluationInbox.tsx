import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Chip, CircularProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { Award, RefreshCw } from 'lucide-react';
import { DataPageShell, EmptyState } from '../components/ui';
import { apiClient } from '../api/client';

/** Hospital-wide evaluation ledger for hospital training management. */
export const HospitalEvaluationInbox: React.FC = () => {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['hospital-evaluation-inbox'],
    queryFn: async () => (await apiClient.get('/operations/evaluations')).data?.data ?? [],
  });

  const rows = Array.isArray(data) ? data : [];

  return (
    <DataPageShell
      eyebrow="HOSPITAL TRAINING"
      title="التقييمات الواردة من المدربين"
      subtitle="جميع التقييمات التي أرسلها المدربون للمتدربين داخل المستشفى — للمتابعة الإشرافية"
      actions={
        <button
          type="button"
          onClick={() => refetch()}
          style={{ border: '1px solid #CBD5E1', background: '#fff', borderRadius: 8, padding: '8px 12px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={16} /> تحديث
        </button>
      }
      loading={isLoading}
      stats={[{ label: 'إجمالي التقييمات', value: rows.length, icon: Award, tone: rows.length ? 'success' : 'warning' }]}
    >
      {isError ? (
        <Alert severity="error">
          تعذر تحميل التقييمات: {(error as any)?.response?.data?.message || (error as any)?.message || 'خطأ غير معروف'}
          <button type="button" onClick={() => refetch()} style={{ marginInlineStart: 12, border: 0, background: 'transparent', cursor: 'pointer', fontWeight: 700 }}>إعادة المحاولة</button>
        </Alert>
      ) : rows.length === 0 ? (
        <EmptyState icon={Award} title="لا توجد تقييمات واردة" hint="ستظهر هنا التقييمات التي يرسلها المدربون بعد حفظها في النظام." />
      ) : (
        <TableContainer component={Paper} className="glass-card" sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 800 }}>المتدرب</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>المدرب</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>نموذج التقييم</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>النوع</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>الدرجة</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>التاريخ</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>الملاحظات</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((evaluation: any) => (
                <TableRow key={evaluation.id} hover>
                  <TableCell><Typography sx={{ fontWeight: 700 }}>{evaluation.evaluatee?.person?.nameAr || '—'}</Typography></TableCell>
                  <TableCell>{evaluation.evaluator?.person?.nameAr || '—'}</TableCell>
                  <TableCell>{evaluation.form?.nameAr || '—'}</TableCell>
                  <TableCell><Chip size="small" label={evaluation.evaluationType === 'final_rotation' ? 'نهاية الدورة' : evaluation.evaluationType === 'mid_rotation' ? 'منتصف الدورة' : evaluation.evaluationType || '—'} /></TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>{evaluation.totalScore ?? '—'}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{evaluation.submittedAt ? new Date(evaluation.submittedAt).toLocaleDateString('ar-SA') : '—'}</TableCell>
                  <TableCell sx={{ maxWidth: 280, color: '#475569' }}>{evaluation.comments || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Box sx={{ mt: 2 }}><Alert severity="info">التقييمات المعروضة هنا للمتابعة الإشرافية. درجة التقييم محفوظة كما أرسلها المدرب.</Alert></Box>
    </DataPageShell>
  );
};

export default HospitalEvaluationInbox;
