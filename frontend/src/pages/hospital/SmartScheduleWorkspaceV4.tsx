import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Grid, Typography } from '@mui/material';
import { CalendarDays, RefreshCw, Send, Users, UserCog, Building2, Wand2, ShieldCheck, UserPlus } from 'lucide-react';
import { apiClient } from '../../api/client';

const SLOTS = ['08:00 - 10:00', '10:00 - 12:00', '12:00 - 14:00', '14:00 - 16:00'];
const DAYS = [{ id: 0, label: 'الأحد' }, { id: 1, label: 'الإثنين' }, { id: 2, label: 'الثلاثاء' }, { id: 3, label: 'الأربعاء' }, { id: 4, label: 'الخميس' }];
const dateOnly = (v: any) => String(v ?? '').slice(0, 10);
const minutes = (v: string) => { const [h, m] = String(v || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const overlaps = (a: string, b: string, c: string, d: string) => Math.max(minutes(a), minutes(c)) < Math.min(minutes(b), minutes(d));
const nameOf = (v: any, fallback = 'غير محدد') => v?.person?.nameAr || v?.nameAr || fallback;
const errorText = (e: any) => e?.response?.data?.message || e?.response?.data?.error || e?.message || 'تعذر الاتصال بخدمة الجدولة.';

export const SmartScheduleWorkspaceV4: React.FC = () => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const schedules = useQuery({ queryKey: ['schedules-list'], queryFn: async () => (await apiClient.get('/schedules')).data?.data ?? [] });
  const schedule = schedules.data?.find((s: any) => s.status === 'published') ?? schedules.data?.[0];
  const detail = useQuery({ queryKey: ['schedule-detail', schedule?.id], enabled: Boolean(schedule?.id), queryFn: async () => (await apiClient.get(`/schedules/${schedule.id}`)).data?.data });
  const active = detail.data ?? schedule;
  const sessions = active?.sessions ?? [];

  const stats = useMemo(() => ({
    trainees: new Set(sessions.map((s: any) => s.traineeProfileId).filter(Boolean)).size,
    trainers: new Set(sessions.map((s: any) => s.trainerProfileId).filter(Boolean)).size,
    departments: new Set(sessions.map((s: any) => s.departmentId).filter(Boolean)).size,
    sessions: sessions.length,
  }), [sessions]);

  const week = useMemo(() => {
    if (!active?.startDate) return [];
    const base = new Date(active.startDate); base.setHours(0, 0, 0, 0); base.setDate(base.getDate() - base.getDay());
    return DAYS.map(d => { const x = new Date(base); x.setDate(base.getDate() + d.id); return { ...d, iso: x.toISOString().slice(0, 10), date: x }; });
  }, [active?.startDate]);

  const run = useMutation({
    mutationFn: async ({ mode, apply }: { mode: 'redistribute' | 'sync'; apply: boolean }) => {
      if (!active?.id) throw new Error('لا يوجد جدول تدريبي محدد.');
      const url = mode === 'sync' ? '/schedules/sync-trainees' : `/schedules/${active.id}/auto-distribute`;
      const body = mode === 'sync' ? { scheduleId: active.id, confirm: apply } : { preview: !apply };
      return apiClient.post(url, body);
    },
    onMutate: () => { setError(''); setMessage(''); setResult(null); },
    onSuccess: async (res, vars) => {
      const data = res.data?.data ?? res.data;
      setResult(data?.preview ?? data ?? {});
      setMessage(vars.apply ? (data?.message || 'تم التطبيق بنجاح.') : 'تمت المعاينة بنجاح — راجع النتائج بالأسفل.');
      if (vars.apply) {
        await queryClient.invalidateQueries({ queryKey: ['schedules-list'] });
        await queryClient.invalidateQueries({ queryKey: ['schedule-detail', active.id] });
      }
    },
    onError: (e: any) => {
      const data = e?.response?.data;
      setResult(data?.preview ?? null);
      setError(errorText(e));
    },
  });

  const publish = useMutation({
    mutationFn: () => apiClient.post(`/schedules/${active.id}/publish`, { changeReason: 'اعتماد الجدول التدريبي الموحد' }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['schedules-list'] }); await queryClient.invalidateQueries({ queryKey: ['schedule-detail', active.id] }); setMessage('تم اعتماد ونشر الجدول.'); },
    onError: (e: any) => setError(errorText(e)),
  });

  if (schedules.isLoading || detail.isLoading) return <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box>;
  if (!active) return <Alert severity="info">لا يوجد جدول تدريبي موحد بعد. أنشئ الجدول الأول من منشئ الجدول.</Alert>;

  return <Box dir="rtl" sx={{ width: '100%', maxWidth: 1600, mx: 'auto', p: { xs: 1, md: 2.5 } }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap', mb: 2 }}>
      <Box><Typography sx={{ color: '#64748B', fontSize: 12, fontWeight: 800 }}>إدارة الجدول التدريبي الموحد</Typography><Typography sx={{ fontSize: { xs: 24, md: 30 }, fontWeight: 900 }}>الجدول التدريبي</Typography><Typography sx={{ color: '#64748B', fontSize: 13 }}>Request → Assignment → Rotation → Schedule — لا تتم إزالة الجلسات القائمة عند إضافة دفعة جديدة.</Typography></Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}><Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={() => queryClient.invalidateQueries()}>تحديث</Button><Button variant="contained" startIcon={<Wand2 size={16} />} onClick={() => { setError(''); setMessage(''); setResult(null); setOpen(true); }}>التوزيع وإدارة الدفعات</Button>{active.status !== 'published' && <Button variant="contained" color="success" startIcon={<Send size={16} />} disabled={publish.isPending} onClick={() => publish.mutate()}>{publish.isPending ? 'جارٍ النشر...' : 'اعتماد ونشر'}</Button>}</Box>
    </Box>
    {(error || message) && <Alert severity={error ? 'error' : 'success'} sx={{ mb: 2 }} onClose={() => { setError(''); setMessage(''); }}>{error || message}</Alert>}

    <Grid container spacing={1.5} sx={{ mb: 2 }}>{[['المتدربون', stats.trainees, Users], ['المدربون المستخدمون', stats.trainers, UserCog], ['الأقسام', stats.departments, Building2], ['الجلسات', stats.sessions, CalendarDays]].map(([label, value, Icon]: any) => <Grid item xs={6} md={3} key={label}><Card><CardContent sx={{ p: '14px !important' }}><Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Box><Typography sx={{ color: '#64748B', fontSize: 11.5, fontWeight: 800 }}>{label}</Typography><Typography sx={{ fontSize: 25, fontWeight: 900 }}>{value}</Typography></Box><Icon size={20} /></Box></CardContent></Card></Grid>)}</Grid>

    <Card sx={{ overflow: 'hidden' }}><CardContent sx={{ p: 0 }}><Box sx={{ p: 2, borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}><Box><Typography sx={{ fontWeight: 900, fontSize: 17 }}>{active.titleAr}</Typography><Typography sx={{ color: '#64748B', fontSize: 11.5 }}>{dateOnly(active.startDate)} → {dateOnly(active.endDate)} · {active.status === 'published' ? 'منشور ومثبت' : 'مسودة'}</Typography></Box><Chip icon={<ShieldCheck size={15} />} label="الجلسات القائمة محمية" color="success" variant="outlined" /></Box><Box sx={{ overflowX: 'auto' }}><Box sx={{ minWidth: 980 }}><Box sx={{ display: 'grid', gridTemplateColumns: '130px repeat(5,minmax(165px,1fr))', bgcolor: '#F8FAFC' }}><Box sx={{ p: 1.25, fontWeight: 900 }}>الفترة الزمنية</Box>{week.map(d => <Box key={d.iso} sx={{ p: 1.25, textAlign: 'center', borderRight: '1px solid #E2E8F0' }}><Typography sx={{ fontWeight: 900, fontSize: 12 }}>{d.label}</Typography><Typography sx={{ color: '#64748B', fontSize: 10.5 }}>{d.date.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' })}</Typography></Box>)}</Box>{SLOTS.map(slot => { const [ss, se] = slot.split(' - '); return <Box key={slot} sx={{ display: 'grid', gridTemplateColumns: '130px repeat(5,minmax(165px,1fr))', minHeight: 105, borderTop: '1px solid #E2E8F0' }}><Box dir="ltr" sx={{ p: 1.25, display: 'flex', alignItems: 'center', fontWeight: 800, justifyContent: 'center' }}>{slot}</Box>{week.map(day => { const cell = sessions.filter((s: any) => dateOnly(s.date) === day.iso && overlaps(ss, se, s.startTime, s.endTime)); return <Box key={day.iso} sx={{ p: .75, borderRight: '1px solid #E2E8F0' }}>{cell.slice(0, 4).map((s: any) => <Box key={s.id} sx={{ mb: .55, p: .8, border: '1px solid #D9E8FF', borderRadius: 1.7, bgcolor: '#F7FAFF' }}><Typography sx={{ fontSize: 10.5, fontWeight: 900 }} noWrap>{s.department?.nameAr || 'قسم'}</Typography><Typography sx={{ fontSize: 10 }} noWrap>{nameOf(s.trainerProfile, 'مدرب')}</Typography><Typography sx={{ fontSize: 9.5, color: '#64748B' }} noWrap>{nameOf(s.traineeProfile, 'متدرب')}</Typography></Box>)}{cell.length > 4 && <Typography sx={{ fontSize: 9.5, textAlign: 'center' }}>+{cell.length - 4} جلسات</Typography>}</Box>})}</Box> })}</Box></Box></CardContent></Card>

    <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth dir="rtl"><DialogTitle sx={{ fontWeight: 900 }}>التوزيع الذكي وإدارة الدفعات الجديدة</DialogTitle><DialogContent dividers>
      <Alert severity="info" sx={{ mb: 2 }}>الفترات القياسية: <span dir="ltr">08–10 · 10–12 · 12–14 · 14–16</span>. القسم يأتي من Rotation الفعلي حسب التاريخ. لا يتم إنشاء Rotation جديد من الجدول.</Alert>
      <Grid container spacing={1.5} sx={{ mb: 2 }}>{SLOTS.map(s => <Grid item xs={6} md={3} key={s}><Box dir="ltr" sx={{ p: 1.4, border: '1px solid #E2E8F0', borderRadius: 2, textAlign: 'center', bgcolor: '#F8FAFC' }}><Typography sx={{ fontWeight: 900 }}>{s}</Typography><Typography dir="rtl" sx={{ color: '#64748B', fontSize: 10.5 }}>فترة قياسية</Typography></Box></Grid>)}</Grid>
      <Divider sx={{ my: 2 }} />
      <Grid container spacing={1.5}><Grid item xs={12} md={6}><Card variant="outlined"><CardContent><Typography sx={{ fontWeight: 900, mb: .7 }}>🔄 إعادة التنظيم الآمنة</Typography><Typography sx={{ color: '#64748B', fontSize: 11.5, minHeight: 55 }}>يضيف الجلسات المطلوبة فقط، ويستخدم Rotation + أهلية المدرب + الإجازات + السعة. لا يحذف الجلسات الموجودة.</Typography><Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}><Button size="small" variant="outlined" disabled={run.isPending} onClick={() => run.mutate({ mode: 'redistribute', apply: false })}>{run.isPending ? 'جارٍ الفحص...' : 'معاينة'}</Button><Button size="small" variant="contained" disabled={run.isPending} onClick={() => run.mutate({ mode: 'redistribute', apply: true })}>تطبيق</Button></Box></CardContent></Card></Grid><Grid item xs={12} md={6}><Card variant="outlined"><CardContent><Typography sx={{ fontWeight: 900, mb: .7 }}>👥 مزامنة دفعة جديدة</Typography><Typography sx={{ color: '#64748B', fontSize: 11.5, minHeight: 55 }}>يبحث عن المتدربين الجدد فقط ويضيفهم إلى الجدول الحالي دون إعادة بناء جلسات الدفعات السابقة.</Typography><Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}><Button size="small" variant="outlined" disabled={run.isPending} onClick={() => run.mutate({ mode: 'sync', apply: false })}>{run.isPending ? 'جارٍ الفحص...' : 'معاينة الدفعة'}</Button><Button size="small" variant="contained" disabled={run.isPending} onClick={() => run.mutate({ mode: 'sync', apply: true })}>مزامنة</Button></Box></CardContent></Card></Grid></Grid>
      {run.isPending && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}><CircularProgress size={18} /><Typography sx={{ fontSize: 12 }}>يتم فحص Rotation والسعة والمدربين والتعارضات…</Typography></Box>}
      {result && <Box sx={{ mt: 2, p: 1.5, bgcolor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: 2 }}><Typography sx={{ fontWeight: 900, mb: 1 }}>نتيجة المعاينة</Typography><Grid container spacing={1}>{[['المؤهلون', result.eligibleTrainees ?? 0], ['متدربون جدد', result.traineesToAdd ?? 0], ['جلسات ستضاف', result.sessionsToAdd ?? 0], ['حالات تحتاج يدوي', result.unresolved?.length ?? 0]].map(([l, v]) => <Grid item xs={6} md={3} key={l as string}><Box sx={{ p: 1.1, bgcolor: 'white', borderRadius: 1.5, border: '1px solid #E2E8F0' }}><Typography sx={{ color: '#64748B', fontSize: 10 }}>{l}</Typography><Typography sx={{ fontWeight: 900, fontSize: 18 }}>{v}</Typography></Box></Grid>)}</Grid>{result.unresolved?.length > 0 && <Alert severity="warning" sx={{ mt: 1.2 }}>{result.unresolved.slice(0, 10).map((x: any, i: number) => <Typography key={i} sx={{ fontSize: 11 }}>• {x.traineeName || x.traineeId || 'متدرب'}{x.date ? ` — ${x.date}` : ''}: {x.reason}</Typography>)}</Alert>}</Box>}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </DialogContent><DialogActions sx={{ p: 2 }}><Button onClick={() => setOpen(false)}>إغلاق</Button></DialogActions></Dialog>
  </Box>;
};

export default SmartScheduleWorkspaceV4;
