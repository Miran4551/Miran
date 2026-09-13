import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Typography } from '@mui/material';
import { RefreshCw, UsersRound, Merge } from 'lucide-react';
import { apiClient } from '../../api/client';

export const ScheduleUnificationActions: React.FC = () => {
  const qc = useQueryClient();
  const [open, setOpen] = useState<'unify' | 'sync' | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const schedules = useQuery({ queryKey: ['schedules-list'], queryFn: async () => (await apiClient.get('/schedules')).data?.data ?? [] });
  const activeSchedules = useMemo(() => (schedules.data ?? []).filter((s: any) => s.status !== 'archived'), [schedules.data]);
  const target = activeSchedules.find((s: any) => s.status === 'published') ?? activeSchedules[0];

  const runPreview = async (kind: 'unify' | 'sync') => {
    setError(''); setPreview(null); setLoading(true); setOpen(kind);
    try {
      const endpoint = kind === 'unify' ? '/schedules/unify' : '/schedules/sync-trainees';
      const r = await apiClient.post(endpoint, { scheduleId: target?.id, confirm: false });
      setPreview(r.data?.preview ?? r.data?.data?.preview ?? null);
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'تعذر إجراء المعاينة');
    } finally { setLoading(false); }
  };

  const confirm = async () => {
    if (!target?.id) return;
    setLoading(true); setError('');
    try {
      const endpoint = open === 'unify' ? '/schedules/unify' : '/schedules/sync-trainees';
      const r = await apiClient.post(endpoint, { scheduleId: target.id, confirm: true });
      const msg = r.data?.message || (open === 'unify' ? 'تم توحيد الجداول في جدول واحد.' : 'تمت مزامنة المتدربين الجدد.');
      setOpen(null); setPreview(null);
      await qc.invalidateQueries({ queryKey: ['schedules-list'] });
      window.dispatchEvent(new CustomEvent('schedule-unified-message', { detail: msg }));
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'تعذر تنفيذ العملية');
      const conflicts = e.response?.data?.conflicts;
      const responsePreview = e.response?.data?.preview;
      if (conflicts) setPreview((p: any) => ({ ...(p || {}), conflicts, hasConflicts: true }));
      if (responsePreview) setPreview(responsePreview);
    } finally { setLoading(false); }
  };

  if (!activeSchedules.length) return null;
  const isUnify = open === 'unify';
  const conflicts = preview?.conflicts ?? [];
  const unresolvedCount = preview?.unresolvedTrainees ?? preview?.unresolved?.length ?? 0;
  const unresolvedDays = preview?.unresolvedDays ?? (preview?.unresolved ?? []).reduce((sum: number, x: any) => sum + Number(x.unresolvedDays ?? 1), 0);
  const canConfirmSync = isUnify || Boolean(preview?.sessionsToAdd);
  return <>
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
      {activeSchedules.length > 1 && <Button size="small" variant="outlined" startIcon={<Merge size={15} />} onClick={() => runPreview('unify')} disabled={loading}>توحيد الجداول في جدول واحد</Button>}
      <Button size="small" variant="outlined" startIcon={<UsersRound size={15} />} onClick={() => runPreview('sync')} disabled={loading}>مزامنة المتدربين الجدد</Button>
      <Button size="small" variant="text" startIcon={<RefreshCw size={15} />} onClick={() => qc.invalidateQueries({ queryKey: ['schedules-list'] })}>تحديث</Button>
    </Box>
    <Dialog open={Boolean(open)} onClose={() => !loading && setOpen(null)} fullWidth maxWidth="sm" dir="rtl">
      <DialogTitle sx={{ fontWeight: 900 }}>{isUnify ? 'توحيد الجداول' : 'مزامنة المتدربين الجدد'}</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
        {loading && !preview ? <Typography sx={{ py: 3, textAlign: 'center' }}>جارٍ تجهيز المعاينة...</Typography> : preview && <Stack spacing={1.2}>
          <Alert severity={preview.hasConflicts ? 'error' : (!isUnify && unresolvedCount > 0 ? 'warning' : 'success')}>
            {preview.hasConflicts ? 'توجد تعارضات يجب معالجتها قبل التوحيد.' : isUnify ? 'يمكن توحيد الجداول بأمان.' : unresolvedCount > 0 ? `سيتم مزامنة المتدربين القابلين للجدولة تلقائيًا، مع إبقاء ${unresolvedCount} متدرب للمعالجة اليدوية (${unresolvedDays} يومًا غير قابل للجدولة).` : 'المتدربون الجدد جاهزون للمزامنة.'}
          </Alert>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            {isUnify ? <>
              <Typography>الجداول الحالية: <b>{preview.scheduleCount}</b></Typography>
              <Typography>الجداول التي ستؤرشف: <b>{preview.schedulesToArchive}</b></Typography>
              <Typography>الجلسات بعد الدمج: <b>{preview.mergedSessionCount}</b></Typography>
              <Typography>التكرارات المحذوفة: <b>{preview.duplicateSessionsRemoved}</b></Typography>
            </> : <>
              <Typography>المتدربون الحاليون: <b>{preview.currentTrainees ?? preview.existingParticipants ?? 0}</b></Typography>
              <Typography>المتدربون الجدد: <b>{preview.newTrainees ?? preview.eligibleTrainees ?? 0}</b></Typography>
              <Typography>الجلسات التي ستضاف: <b>{preview.sessionsToAdd ?? 0}</b></Typography>
              <Typography>سيتم إدخالهم للجدول: <b>{preview.traineesToAdd ?? 0}</b></Typography>
              <Typography>متدربون يحتاجون معالجة يدوية: <b>{unresolvedCount}</b></Typography>
              <Typography>أيام غير قابلة للجدولة: <b>{unresolvedDays}</b></Typography>
            </>}
          </Box>
          {conflicts.length > 0 && <><Divider /><Typography sx={{ fontWeight: 900 }}>التعارضات</Typography>{conflicts.slice(0, 8).map((c: any, i: number) => <Typography key={i} sx={{ fontSize: 12 }}>• {c.messageAr}</Typography>)}</>}
          {!isUnify && unresolvedCount > 0 && <><Divider /><Typography sx={{ fontWeight: 900 }}>متدربون يحتاجون معالجة يدوية</Typography>{preview.unresolved.slice(0, 8).map((x: any) => <Typography key={x.traineeId} sx={{ fontSize: 12 }}>• {x.traineeName || x.traineeId}: {x.reason}{x.unresolvedDays ? ` — ${x.unresolvedDays} يومًا` : ''}</Typography>)}</>}
          {isUnify && <Alert severity="info">سيتم الاحتفاظ بجدول واحد فقط، بينما تُؤرشف الجداول الأخرى ولا تُحذف سجلاتها التاريخية. الجلسات والمتدربون ينتقلون إلى الجدول الموحد.</Alert>}
          {!isUnify && <Alert severity="info">لن تتم إعادة بناء أو تعديل جلسات المتدربين الحاليين. سيتم إضافة جلسات المتدربين الجدد القابلة للجدولة فقط، أما الأيام غير القابلة للجدولة فستبقى مرتبطة بالمتدرب للمعالجة اليدوية ثم يمكن إعادة المزامنة.</Alert>}
        </Stack>}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={() => setOpen(null)} disabled={loading}>إلغاء</Button>
        {preview && <Button variant="contained" color="success" onClick={confirm} disabled={loading || preview.hasConflicts || !canConfirmSync}>تأكيد {isUnify ? 'التوحيد' : 'المزامنة'}</Button>}
      </DialogActions>
    </Dialog>
  </>;
};
