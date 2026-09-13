import React, { lazy, Suspense, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Paper, TextField, Typography } from '@mui/material';
import { Edit3, CheckCircle2 } from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

const LogbookPage = lazy(() => import('./Logbook'));

const EVAL_TYPE_LABELS: Record<string, string> = {
  mid_rotation: 'منتصف الدورة',
  final_rotation: 'نهاية الدورة',
  mini_cex: 'Mini-CEX',
};

/**
 * Keeps the existing logbook intact while adding the missing trainer action:
 * editing an evaluation the trainer already submitted. The edit goes through
 * PATCH /operations/evaluations/:id, so it never creates a second evaluation.
 */
export const LogbookTrainerPage: React.FC = () => {
  const { user, primaryRole } = useAuth();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const isTrainer = primaryRole === 'trainer';
  const isEvaluationsTab = params.get('tab') === 'evaluations';
  const [editing, setEditing] = useState<any>(null);
  const [score, setScore] = useState('');
  const [comments, setComments] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const evaluations = useQuery({
    queryKey: ['logbook-trainer-evaluations-edit'],
    enabled: isTrainer && isEvaluationsTab,
    queryFn: async () => (await apiClient.get('/operations/evaluations')).data?.data ?? [],
  });

  const ownEvaluations = useMemo(
    () => (evaluations.data ?? []).filter((e: any) => e.evaluatorId === user?.id),
    [evaluations.data, user?.id],
  );

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error('اختر تقييماً أولاً');
      const numericScore = Number(score);
      if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 100) {
        throw new Error('الدرجة يجب أن تكون بين 0 و100');
      }
      if (numericScore < 60 && !comments.trim() && !editing.comments?.trim()) {
        throw new Error('التعليق إلزامي عندما تكون الدرجة أقل من 60');
      }
      return (await apiClient.patch(`/operations/evaluations/${editing.id}`, {
        scores: { overall: numericScore },
        totalScore: numericScore,
        comments: comments.trim() || undefined,
      })).data;
    },
    onSuccess: (response: any) => {
      setOk(response?.message || 'تم تعديل التقييم وحفظه بنجاح');
      setError('');
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['logbook-evaluations'] });
      qc.invalidateQueries({ queryKey: ['logbook-pending-evals'] });
      qc.invalidateQueries({ queryKey: ['logbook-trainer-evaluations-edit'] });
    },
    onError: (e: any) => {
      setOk('');
      setError(e?.response?.data?.message || e?.message || 'تعذر تعديل التقييم');
    },
  });

  const openEdit = (evaluation: any) => {
    setEditing(evaluation);
    setScore(String(evaluation?.scores?.overall ?? evaluation?.totalScore ?? ''));
    setComments(evaluation?.comments ?? '');
    setError('');
    setOk('');
  };

  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><CircularProgress /></div>}>
      <LogbookPage />
      {isTrainer && isEvaluationsTab && (
        <Box sx={{ maxWidth: 1400, mx: 'auto', px: { xs: 2, md: 3 }, pb: 4 }}>
          <Paper sx={{ p: 2, mt: 2, border: '1px solid #E2E8F0', borderRadius: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 1 }}>
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: 18 }}>تعديل التقييمات المرسلة</Typography>
                <Typography variant="body2" sx={{ color: '#64748B' }}>
                  عدّل درجتك أو تعليقك على تقييم سبق أن أرسلته بدون إنشاء تقييم مكرر.
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ color: '#64748B' }}>{ownEvaluations.length} تقييمات مرسلة</Typography>
            </Box>
            {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
            {ok && <Alert severity="success" sx={{ mb: 1 }} icon={<CheckCircle2 size={18} />}>{ok}</Alert>}
            {evaluations.isLoading ? <CircularProgress size={24} /> : ownEvaluations.length === 0 ? (
              <Typography variant="body2" sx={{ color: '#64748B' }}>لا توجد تقييمات مرسلة قابلة للتعديل.</Typography>
            ) : (
              <Box sx={{ display: 'grid', gap: 1 }}>
                {ownEvaluations.map((evaluation: any) => (
                  <Box key={evaluation.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, p: 1.25, borderBottom: '1px solid #E2E8F0', flexWrap: 'wrap' }}>
                    <Box>
                      <Typography sx={{ fontWeight: 700 }}>
                        {evaluation.evaluatee?.person?.nameAr ?? 'متدرب'} — {evaluation.form?.nameAr ?? EVAL_TYPE_LABELS[evaluation.evaluationType] ?? evaluation.evaluationType}
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#64748B' }}>
                        {EVAL_TYPE_LABELS[evaluation.evaluationType] ?? evaluation.evaluationType} · الدرجة: {evaluation.totalScore ?? '—'} · {evaluation.submittedAt ? new Date(evaluation.submittedAt).toLocaleDateString('ar-SA') : '—'}
                      </Typography>
                    </Box>
                    <Button size="small" variant="outlined" startIcon={<Edit3 size={15} />} onClick={() => openEdit(evaluation)}>
                      تعديل التقييم
                    </Button>
                  </Box>
                ))}
              </Box>
            )}
          </Paper>
        </Box>
      )}
      <Dialog open={Boolean(editing)} onClose={() => !editMutation.isPending && setEditing(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>تعديل التقييم</DialogTitle>
        <DialogContent dividers>
          {editing && <Typography variant="body2" sx={{ mb: 2, color: '#64748B' }}>
            {editing.evaluatee?.person?.nameAr ?? 'المتدرب'} — {editing.form?.nameAr ?? EVAL_TYPE_LABELS[editing.evaluationType] ?? editing.evaluationType}
          </Typography>}
          <TextField fullWidth size="small" type="number" label="الدرجة (0-100)" value={score} onChange={(e) => setScore(e.target.value)} inputProps={{ min: 0, max: 100 }} />
          <TextField fullWidth size="small" multiline rows={4} sx={{ mt: 2 }} label="تعليق التقييم" value={comments} onChange={(e) => setComments(e.target.value)} />
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setEditing(null)} disabled={editMutation.isPending}>إلغاء</Button>
          <Button variant="contained" startIcon={<Edit3 size={16} />} onClick={() => editMutation.mutate()} disabled={editMutation.isPending || !score.trim()}>
            {editMutation.isPending ? 'جارٍ الحفظ...' : 'حفظ التعديل'}
          </Button>
        </DialogActions>
      </Dialog>
    </Suspense>
  );
};

export default LogbookTrainerPage;
