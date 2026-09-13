import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, Grid, IconButton, InputLabel, MenuItem, Select, Step, StepLabel, Stepper, TextField, Typography } from '@mui/material';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Eye, Plus, RefreshCw, Send, ShieldAlert, Trash2, Users, UserCog, Building2, Wand2 } from 'lucide-react';
import { apiClient } from '../../api/client';

const DAYS = [{ id: 0, label: 'الأحد' }, { id: 1, label: 'الإثنين' }, { id: 2, label: 'الثلاثاء' }, { id: 3, label: 'الأربعاء' }, { id: 4, label: 'الخميس' }];
const SLOTS = ['08:00 - 10:00', '10:00 - 12:00', '12:00 - 14:00', '14:00 - 16:00', '16:00 - 18:00'];
const ACTIVE_ROTATION_STATUSES = ['active', 'scheduled', 'pending_acceptance'];
type AssignmentMap = Record<string, string[]>;
type PlanMap = Record<string, { days: number[]; slot: string }>;

const nameOf = (value: any, fallback = 'غير محدد') => value?.person?.nameAr || value?.nameAr || fallback;
const toDateOnly = (value: any) => String(value ?? '').slice(0, 10);
const timeToMinutes = (value: string) => { const [h, m] = String(value || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => Math.max(timeToMinutes(aStart), timeToMinutes(bStart)) < Math.min(timeToMinutes(aEnd), timeToMinutes(bEnd));
const startOfWeek = (value: Date) => { const d = new Date(value); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return d; };

export const SmartScheduleWorkspaceV2: React.FC = () => {
  const queryClient = useQueryClient();
  const [builderOpen, setBuilderOpen] = useState(false), [detailsOpen, setDetailsOpen] = useState(false), [step, setStep] = useState(0), [expandedTrainer, setExpandedTrainer] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<AssignmentMap>({}), [plans, setPlans] = useState<PlanMap>({}), [generated, setGenerated] = useState<any[]>([]), [conflicts, setConflicts] = useState<any[]>([]);
  const [message, setMessage] = useState(''), [error, setError] = useState('');
  const [title, setTitle] = useState('الجدول التدريبي الموحد للمستشفى');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));

  const schedules = useQuery({ queryKey: ['schedules-list'], queryFn: async () => (await apiClient.get('/schedules')).data?.data ?? [] });
  const departments = useQuery({ queryKey: ['smart-schedule-departments'], queryFn: async () => (await apiClient.get('/rotations/departments')).data?.data ?? [] });
  const trainers = useQuery({ queryKey: ['smart-schedule-trainers'], queryFn: async () => (await apiClient.get('/trainers/workspace-cards')).data?.data ?? [] });
  const trainees = useQuery({ queryKey: ['smart-schedule-trainees'], queryFn: async () => (await apiClient.get('/trainees/incoming')).data?.data ?? [] });

  const schedule = schedules.data?.[0];
  const detail = useQuery({ queryKey: ['schedule-detail', schedule?.id], enabled: Boolean(schedule?.id), queryFn: async () => (await apiClient.get(`/schedules/${schedule.id}`)).data?.data });
  const activeSchedule = detail.data ?? schedule;
  const activeDepartments = useMemo(() => (departments.data ?? []).filter((x: any) => x.isActive !== false), [departments.data]);
  const activeTrainers = useMemo(() => (trainers.data ?? []).filter((x: any) => x.isActive !== false), [trainers.data]);
  const activeTrainees = useMemo(() => (trainees.data ?? []).filter((t: any) => (t.rotations ?? []).some((r: any) => ACTIVE_ROTATION_STATUSES.includes(r.status))), [trainees.data]);
  const sessions = activeSchedule?.sessions ?? [];

  const stats = useMemo(() => ({
    trainees: new Set(sessions.map((x: any) => x.traineeProfileId).filter(Boolean)).size,
    trainers: new Set(sessions.map((x: any) => x.trainerProfileId).filter(Boolean)).size,
    departments: new Set(sessions.map((x: any) => x.departmentId).filter(Boolean)).size,
    sessions: sessions.length,
  }), [sessions]);

  const departmentForTrainer = (trainer: any) => activeDepartments.find((d: any) => d.id === trainer?.department?.id || d.id === trainer?.departmentId);
  const rotationFor = (trainee: any, departmentId?: string, trainerId?: string) => (trainee?.rotations ?? []).find((r: any) => ACTIVE_ROTATION_STATUSES.includes(r.status) && (!departmentId || r.departmentId === departmentId) && (!trainerId || r.trainerProfileId === trainerId));
  const assignedTo = useMemo(() => { const map = new Map<string, string>(); Object.entries(assignments).forEach(([trainerId, ids]) => ids.forEach(id => map.set(id, trainerId))); return map; }, [assignments]);
  const assignedCount = Object.values(assignments).reduce((n, ids) => n + ids.length, 0);

  const resetBuilder = () => {
    const next: AssignmentMap = {};
    activeSchedule?.sessions?.forEach((s: any) => { if (s.trainerProfileId && s.traineeProfileId) next[s.trainerProfileId] = [...new Set([...(next[s.trainerProfileId] ?? []), s.traineeProfileId])]; });
    setAssignments(next); setPlans({}); setGenerated([]); setConflicts([]); setError(''); setMessage(''); setStep(0); setExpandedTrainer(null);
    setTitle(activeSchedule?.titleAr || 'الجدول التدريبي الموحد للمستشفى');
    setStartDate(toDateOnly(activeSchedule?.startDate) || new Date().toISOString().slice(0, 10));
    setEndDate(toDateOnly(activeSchedule?.endDate) || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
    setBuilderOpen(true);
  };

  const toggleAssignment = (trainerId: string, traineeId: string) => {
    const previous = assignedTo.get(traineeId);
    setAssignments(current => {
      const next = { ...current };
      if (previous) next[previous] = (next[previous] ?? []).filter(id => id !== traineeId);
      if (previous === trainerId) return next;
      const trainer = activeTrainers.find((x: any) => x.id === trainerId);
      const capacity = trainer?.available ?? trainer?.maxTrainees ?? 5;
      if ((next[trainerId]?.length ?? 0) >= capacity) return current;
      next[trainerId] = [...(next[trainerId] ?? []), traineeId];
      return next;
    });
  };

  /**
   * IMPORTANT: a trainee's current Rotation trainer is a preference/history,
   * not a command to put every generated session on that trainer. The scheduler
   * first builds the eligible trainer pool for the trainee's department/program,
   * then chooses the least-loaded available trainer. The rotation trainer is used
   * only as a tie-breaker. This prevents the previous "everyone = Fawaz" result.
   */
  const autoDistribute = () => {
    const next: AssignmentMap = {};
    activeTrainers.forEach((t: any) => { next[t.id] = []; });

    // Include existing real occupancy and current schedule occupancy in the score.
    const existingScheduleLoad = new Map<string, number>();
    sessions.forEach((s: any) => { if (s.trainerProfileId) existingScheduleLoad.set(s.trainerProfileId, (existingScheduleLoad.get(s.trainerProfileId) ?? 0) + 1); });
    const baseLoad = (t: any) => Number(t.occupied ?? 0) + Number(existingScheduleLoad.get(t.id) ?? 0);

    [...activeTrainees]
      .sort((a: any, b: any) => {
        const ar = rotationFor(a); const br = rotationFor(b);
        const ac = activeTrainers.filter((t: any) => trainerEligible(t, ar)).length;
        const bc = activeTrainers.filter((t: any) => trainerEligible(t, br)).length;
        return ac - bc;
      })
      .forEach((trainee: any) => {
        const rotation = rotationFor(trainee);
        const candidates = activeTrainers
          .filter((trainer: any) => trainerEligible(trainer, rotation))
          .filter((trainer: any) => {
            const cap = Number(trainer.maxTrainees ?? 5);
            return !trainer.onLeave && baseLoad(trainer) + (next[trainer.id]?.length ?? 0) < cap;
          })
          .sort((a: any, b: any) => {
            const aLoad = baseLoad(a) + (next[a.id]?.length ?? 0);
            const bLoad = baseLoad(b) + (next[b.id]?.length ?? 0);
            if (aLoad !== bLoad) return aLoad - bLoad;
            const aPreferred = a.id === rotation?.trainerProfileId ? 0 : 1;
            const bPreferred = b.id === rotation?.trainerProfileId ? 0 : 1;
            if (aPreferred !== bPreferred) return aPreferred - bPreferred;
            return String(a.id).localeCompare(String(b.id));
          });
        if (candidates[0]) next[candidates[0].id].push(trainee.id);
      });

    setAssignments(next);
    setGenerated([]);
    setConflicts([]);
  };

  const trainerEligible = (trainer: any, rotation: any) => {
    if (!rotation || trainer.onLeave || trainer.isActive === false) return false;
    const trainerDepartmentId = trainer?.department?.id || trainer?.departmentId;
    if (trainerDepartmentId && rotation.departmentId && trainerDepartmentId !== rotation.departmentId) return false;
    if (!trainerDepartmentId && rotation.departmentId) return false;
    const qualifications = trainer.qualifiedPrograms ?? [];
    if (rotation.programId && qualifications.length > 0 && !qualifications.some((q: any) => q.id === rotation.programId || q.programId === rotation.programId || q.program?.id === rotation.programId)) return false;
    return true;
  };

  const buildSessions = () => {
    const output: any[] = [];
    Object.entries(assignments).forEach(([trainerId, traineeIds]) => {
      const trainer = activeTrainers.find((x: any) => x.id === trainerId);
      const departmentId = departmentForTrainer(trainer)?.id || trainer?.departmentId;
      if (!trainer || !departmentId) return;
      const plan = plans[trainerId] ?? { days: [0, 2, 4], slot: SLOTS[0] };
      const [sessionStart, sessionEnd] = plan.slot.split(' - ');
      traineeIds.forEach(traineeId => {
        const trainee = activeTrainees.find((x: any) => x.id === traineeId);
        const rotation = rotationFor(trainee, departmentId, trainerId) ?? rotationFor(trainee, departmentId);
        if (!rotation || !trainerEligible(trainer, rotation)) return;
        const from = Math.max(new Date(`${startDate}T00:00:00`).getTime(), new Date(rotation.startDate).getTime());
        const to = Math.min(new Date(`${endDate}T00:00:00`).getTime(), new Date(rotation.endDate).getTime());
        for (let cursor = new Date(from); cursor.getTime() <= to; cursor.setDate(cursor.getDate() + 1)) {
          if (!plan.days.includes(cursor.getDay())) continue;
          output.push({ date: cursor.toISOString().slice(0, 10), startTime: sessionStart, endTime: sessionEnd, departmentId, trainerProfileId: trainerId, traineeProfileId: traineeId, sessionType: 'clinical_round', shiftType: 'morning' });
        }
      });
    });
    return output;
  };

  const checkConflicts = async () => {
    const proposed = buildSessions(); setGenerated(proposed);
    if (!proposed.length) { setConflicts([{ messageAr: 'لا توجد جلسات قابلة للتوليد. تحقق من التوزيع والتواريخ.' }]); return false; }
    try {
      const response = await apiClient.post('/schedules/check-conflicts', { sessions: proposed.map(s => ({ ...s, traineeProfileIds: [s.traineeProfileId] })), scheduleId: activeSchedule?.id });
      const result = response.data?.data ?? response.data;
      const next = result?.hasConflict ? result.conflicts ?? [] : [];
      setConflicts(next); return next.length === 0;
    } catch (e: any) {
      const next = e.response?.data?.conflicts ?? [{ messageAr: e.response?.data?.message ?? 'تعذر فحص التعارضات' }];
      setConflicts(next); return false;
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = { titleAr: title.trim(), startDate, endDate, traineeProfileIds: Array.from(new Set(Object.values(assignments).flat())), sessions: generated.length ? generated : buildSessions() };
      return activeSchedule?.id ? apiClient.patch(`/schedules/${activeSchedule.id}`, body) : apiClient.post('/schedules', body);
    },
    onSuccess: async response => { await queryClient.invalidateQueries({ queryKey: ['schedules-list'] }); const id = response.data?.data?.id; if (id) await queryClient.invalidateQueries({ queryKey: ['schedule-detail', id] }); setBuilderOpen(false); setMessage('تم حفظ الجدول التدريبي الموحد بنجاح.'); },
    onError: (e: any) => setConflicts(e.response?.data?.conflicts ?? [{ messageAr: e.response?.data?.message ?? 'تعذر حفظ الجدول' }]),
  });
  const deleteMutation = useMutation({ mutationFn: async (id: string) => apiClient.delete(`/schedules/${id}`), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['schedules-list'] }); setDetailsOpen(false); setMessage('تم حذف مسودة الجدول.'); }, onError: (e: any) => setError(e.response?.data?.message ?? 'تعذر حذف الجدول') });
  const publishMutation = useMutation({ mutationFn: async (id: string) => apiClient.post(`/schedules/${id}/publish`, { changeReason: 'اعتماد ونشر الجدول التدريبي الموحد للمستشفى' }), onSuccess: async (_r, id) => { await queryClient.invalidateQueries({ queryKey: ['schedules-list'] }); await queryClient.invalidateQueries({ queryKey: ['schedule-detail', id] }); setMessage('تم اعتماد ونشر الجدول التدريبي الموحد.'); }, onError: (e: any) => setError(e.response?.data?.message ?? 'تعذر نشر الجدول') });

  const week = useMemo(() => { const base = startOfWeek(new Date(activeSchedule?.startDate ?? startDate)); return DAYS.map(day => { const date = new Date(base); date.setDate(base.getDate() + day.id); return { ...day, date, iso: date.toISOString().slice(0, 10) }; }); }, [activeSchedule?.startDate, startDate]);

  if (schedules.isLoading) return <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box>;

  return <Box dir="rtl" sx={{ width: '100%', maxWidth: 1600, mx: 'auto', p: { xs: 1, md: 2.5 } }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap', mb: 2.5 }}>
      <Box><Typography sx={{ color: '#64748B', fontSize: 12, fontWeight: 800 }}>إدارة الجداول التدريبية</Typography><Typography sx={{ fontSize: { xs: 24, md: 30 }, fontWeight: 900 }}>الجداول التدريبية</Typography><Typography sx={{ color: '#64748B', fontSize: 13, mt: .5 }}>جدول تدريبي موحد للمستشفى — توزيع متوازن للمتدربين على المدربين المؤهلين</Typography></Box>
      <Box sx={{ display: 'flex', gap: 1 }}><Button variant="outlined" startIcon={<RefreshCw size={16} />} onClick={() => queryClient.invalidateQueries()}>تحديث</Button><Button variant="contained" startIcon={<Plus size={16} />} onClick={resetBuilder}>{activeSchedule ? 'إعادة تنظيم الجدول' : 'إنشاء الجدول الموحد'}</Button></Box>
    </Box>
    {(message || error) && <Alert severity={error ? 'error' : 'success'} sx={{ mb: 2 }} onClose={() => error ? setError('') : setMessage('')}>{error || message}</Alert>}
    <Grid container spacing={1.5} sx={{ mb: 2 }}>{[['المتدربون', stats.trainees, Users], ['المدربون المستخدمون', stats.trainers, UserCog], ['الأقسام', stats.departments, Building2], ['الجلسات', stats.sessions, CalendarDays]].map(([label, value, Icon]: any) => <Grid item xs={6} md={3} key={label}><Card><CardContent sx={{ p: '14px !important' }}><Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Box><Typography sx={{ color: '#64748B', fontSize: 11.5, fontWeight: 800 }}>{label}</Typography><Typography sx={{ fontSize: 25, fontWeight: 900 }}>{value}</Typography></Box><Icon size={20} /></Box></CardContent></Card></Grid>)}</Grid>

    <Card sx={{ mb: 2, overflow: 'hidden' }}><CardContent sx={{ p: 0 }}><Box sx={{ p: 2, borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between' }}><Box><Typography sx={{ fontWeight: 900, fontSize: 17 }}>عرض الأسبوع</Typography><Typography sx={{ color: '#64748B', fontSize: 11.5 }}>اليوم ← الفترة ← القسم ← المدرب ← المتدرب</Typography></Box>{activeSchedule?.status && <Chip label={activeSchedule.status === 'published' ? 'منشور' : 'مسودة'} color={activeSchedule.status === 'published' ? 'success' : 'warning'} />}</Box><Box sx={{ overflowX: 'auto' }}><Box sx={{ minWidth: 980 }}><Box sx={{ display: 'grid', gridTemplateColumns: '125px repeat(5,minmax(165px,1fr))', bgcolor: '#F8FAFC' }}><Box sx={{ p: 1.25, fontWeight: 900 }}>الفترة الزمنية</Box>{week.map(d => <Box key={d.iso} sx={{ p: 1.25, textAlign: 'center', borderRight: '1px solid #E2E8F0' }}><Typography sx={{ fontWeight: 900, fontSize: 12 }}>{d.label}</Typography><Typography sx={{ color: '#64748B', fontSize: 10.5 }}>{d.date.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' })}</Typography></Box>)}</Box>{SLOTS.map(slot => { const [ss, se] = slot.split(' - '); return <Box key={slot} sx={{ display: 'grid', gridTemplateColumns: '125px repeat(5,minmax(165px,1fr))', minHeight: 105, borderTop: '1px solid #E2E8F0' }}><Box sx={{ p: 1.25, display: 'flex', alignItems: 'center', gap: .7 }}><Clock3 size={14} /><Typography sx={{ fontSize: 11, fontWeight: 800 }}>{slot}</Typography></Box>{week.map(day => { const cell = sessions.filter((s: any) => toDateOnly(s.date) === day.iso && overlaps(ss, se, s.startTime, s.endTime)); return <Box key={day.iso} sx={{ p: .75, borderRight: '1px solid #E2E8F0' }}>{cell.slice(0, 4).map((s: any) => <Box key={s.id} sx={{ mb: .55, p: .8, border: '1px solid #D9E8FF', borderRadius: 1.7, bgcolor: '#F7FAFF' }}><Typography sx={{ fontSize: 10.5, fontWeight: 900 }} noWrap>{s.department?.nameAr || activeDepartments.find((d: any) => d.id === s.departmentId)?.nameAr || 'قسم غير محدد'}</Typography><Typography sx={{ fontSize: 10 }} noWrap>{nameOf(s.trainerProfile, 'مدرب')}</Typography><Typography sx={{ fontSize: 9.5, color: '#64748B' }} noWrap>{nameOf(s.traineeProfile, 'متدرب')}</Typography></Box>)}{cell.length > 4 && <Typography sx={{ fontSize: 9.5, textAlign: 'center' }}>+{cell.length - 4} جلسات</Typography>}</Box>})}</Box> })}</Box></Box></CardContent></Card>

    <Card><CardContent><Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', gap: 1 }}><Box><Typography sx={{ fontWeight: 900, fontSize: 17 }}>قائمة الجدول الموحد</Typography><Typography sx={{ color: '#64748B', fontSize: 11.5 }}>التوزيع الفعلي المحفوظ في قاعدة البيانات</Typography></Box><Box sx={{ display: 'flex', gap: .8 }}>{activeSchedule && activeSchedule.status !== 'published' && <Button size="small" color="success" variant="contained" startIcon={<Send size={15} />} disabled={publishMutation.isPending} onClick={() => publishMutation.mutate(activeSchedule.id)}>{publishMutation.isPending ? 'جارٍ النشر...' : 'اعتماد ونشر'}</Button>}<Button size="small" startIcon={<Eye size={15} />} onClick={() => setDetailsOpen(true)} disabled={!activeSchedule}>التفاصيل</Button>{activeSchedule && activeSchedule.status !== 'published' && <Button size="small" color="error" startIcon={<Trash2 size={15} />} onClick={() => window.confirm('سيتم حذف المسودة وجميع جلساتها. هل تريد المتابعة؟') && deleteMutation.mutate(activeSchedule.id)}>حذف</Button>}</Box></Box><Box sx={{ overflowX: 'auto' }}><table className="miran-data-table" style={{ width: '100%' }}><thead><tr><th>#</th><th>القسم</th><th>المدرب</th><th>المتدرب</th><th>التاريخ</th><th>الوقت</th><th>النوع</th></tr></thead><tbody>{sessions.slice(0, 200).map((s: any, i: number) => <tr key={s.id || i}><td>{i + 1}</td><td>{s.department?.nameAr || activeDepartments.find((d: any) => d.id === s.departmentId)?.nameAr || '—'}</td><td>{nameOf(s.trainerProfile)}</td><td>{nameOf(s.traineeProfile)}</td><td>{toDateOnly(s.date)}</td><td>{s.startTime} — {s.endTime}</td><td>{s.sessionType === 'clinical_round' ? 'جولة سريرية' : s.sessionType || 'تدريب'}</td></tr>)}{!sessions.length && <tr><td colSpan={7}><Box sx={{ py: 5, textAlign: 'center', color: '#64748B' }}>لا توجد جلسات منشأة بعد.</Box></td></tr>}</tbody></table></Box></CardContent></Card>

    <Dialog open={builderOpen} onClose={() => setBuilderOpen(false)} maxWidth="lg" fullWidth dir="rtl"><DialogTitle sx={{ fontWeight: 900 }}>منشئ الجدول التدريبي الموحد</DialogTitle><DialogContent dividers><Stepper activeStep={step} sx={{ mb: 3 }}>{['المعلومات الأساسية', 'الأقسام والمدربون', 'الأيام والأوقات', 'المراجعة'].map(x => <Step key={x}><StepLabel>{x}</StepLabel></Step>)}</Stepper>
      {conflicts.length > 0 && <Alert severity="error" icon={<ShieldAlert />} sx={{ mb: 2 }}>{conflicts.slice(0, 8).map((c: any, i: number) => <Typography key={i} sx={{ fontSize: 12 }}>• {c.messageAr || c.message || c.type || 'يوجد تعارض'}</Typography>)}</Alert>}
      {step === 0 && <Grid container spacing={2}><Grid item xs={12}><TextField fullWidth label="اسم الجدول الموحد" value={title} onChange={e => setTitle(e.target.value)} /></Grid><Grid item xs={12} md={6}><TextField fullWidth type="date" label="من" value={startDate} onChange={e => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} /></Grid><Grid item xs={12} md={6}><TextField fullWidth type="date" label="إلى" value={endDate} onChange={e => setEndDate(e.target.value)} InputLabelProps={{ shrink: true }} /></Grid><Grid item xs={12}><Alert severity="info">سيتم جمع <b>{activeDepartments.length}</b> أقسام، <b>{activeTrainers.length}</b> مدربين، و<b>{activeTrainees.length}</b> متدربًا. التوزيع الذكي يوازن الحمل ولا يفرض مدرب الـRotation.</Alert></Grid></Grid>}
      {step === 1 && <Box><Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5, gap: 1, flexWrap: 'wrap' }}><Box><Typography sx={{ fontWeight: 900 }}>توزيع المتدربين على المدربين</Typography><Typography sx={{ color: '#64748B', fontSize: 11.5 }}>يتم اختيار المدرب الأقل إشغالًا من المدربين المؤهلين للقسم/البرنامج، ومدرب الـRotation يستخدم كأفضلية عند التعادل فقط.</Typography></Box><Button variant="contained" startIcon={<Wand2 size={16} />} onClick={autoDistribute}>توزيع ذكي متوازن</Button></Box><Grid container spacing={1.3}>{activeDepartments.map((department: any) => { const dTrainers = activeTrainers.filter((t: any) => departmentForTrainer(t)?.id === department.id); const dTrainees = activeTrainees.filter((t: any) => Boolean(rotationFor(t, department.id))); return <Grid item xs={12} md={6} key={department.id}><Card variant="outlined"><CardContent><Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}><Box><Typography sx={{ fontWeight: 900 }}>{department.nameAr}</Typography><Typography sx={{ color: '#64748B', fontSize: 10.5 }}>{dTrainers.length} مدربين · {dTrainees.length} متدربين</Typography></Box><Chip size="small" label={`سعة ${department.capacity ?? '—'}`} /></Box>{dTrainers.map((trainer: any) => { const ids = assignments[trainer.id] ?? []; const cap = trainer.maxTrainees ?? 5; const open = expandedTrainer === trainer.id; const eligible = dTrainees.filter((t: any) => trainerEligible(trainer, rotationFor(t, department.id))); return <Box key={trainer.id} sx={{ borderTop: '1px solid #EEF2F7', pt: 1, mt: 1 }}><Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Box><Typography sx={{ fontWeight: 800, fontSize: 12.5 }}>{nameOf(trainer)}</Typography><Typography sx={{ color: '#64748B', fontSize: 10 }}>{trainer.titleAr || 'مدرب سريري'} · إشغال حالي {trainer.occupied ?? 0}/{cap}</Typography></Box><Box sx={{ display: 'flex', alignItems: 'center' }}><Chip size="small" label={`${ids.length}/${Math.max(0, (trainer.available ?? cap) - (ids.length ? 0 : 0))}`} color={ids.length >= cap ? 'warning' : 'success'} /><IconButton size="small" onClick={() => setExpandedTrainer(open ? null : trainer.id)}>{open ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}</IconButton></Box></Box>{open && <Box sx={{ mt: .6, maxHeight: 220, overflowY: 'auto', bgcolor: '#FAFCFF' }}>{eligible.map((t: any) => { const current = assignedTo.get(t.id); const checked = current === trainer.id; const full = ids.length + Number(trainer.occupied ?? 0) >= cap; return <Box key={t.id} sx={{ display: 'flex', justifyContent: 'space-between', px: 1, py: .6, borderBottom: '1px solid #EEF2F7' }}><Typography sx={{ fontSize: 11 }}>{nameOf(t)}{current && current !== trainer.id ? ` · مسند إلى ${nameOf(activeTrainers.find((x: any) => x.id === current), 'مدرب آخر')}` : ''}</Typography><Button size="small" variant={checked ? 'contained' : 'outlined'} disabled={!checked && full} onClick={() => toggleAssignment(trainer.id, t.id)}>{checked ? 'مُسند' : 'إسناد'}</Button></Box>})}</Box>}</Box>})}</CardContent></Card></Grid>; })}</Grid>{assignedCount < activeTrainees.length && <Alert severity="warning" sx={{ mt: 1.5 }}>بقي {activeTrainees.length - assignedCount} متدربًا بدون إسناد. قد يعني ذلك عدم وجود مدرب مؤهل/متاح في القسم أو امتلاء السعة.</Alert>}</Box>}
      {step === 2 && <Grid container spacing={1.5}>{activeTrainers.filter((t: any) => (assignments[t.id] ?? []).length).map((trainer: any) => { const plan = plans[trainer.id] ?? { days: [0, 2, 4], slot: SLOTS[0] }; return <Grid item xs={12} md={6} key={trainer.id}><Card variant="outlined"><CardContent><Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}><Box><Typography sx={{ fontWeight: 900 }}>{nameOf(trainer)}</Typography><Typography sx={{ color: '#64748B', fontSize: 10.5 }}>{departmentForTrainer(trainer)?.nameAr} · {assignments[trainer.id].length} متدربين</Typography></Box><FormControl size="small" sx={{ minWidth: 175 }}><InputLabel>الفترة</InputLabel><Select value={plan.slot} label="الفترة" onChange={e => setPlans(c => ({ ...c, [trainer.id]: { ...plan, slot: e.target.value } }))}>{SLOTS.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}</Select></FormControl></Box><Box sx={{ display: 'flex', gap: .5, flexWrap: 'wrap', mt: 1.2 }}>{DAYS.map(day => { const selected = plan.days.includes(day.id); return <Chip key={day.id} clickable label={day.label} color={selected ? 'primary' : 'default'} variant={selected ? 'filled' : 'outlined'} onClick={() => setPlans(c => ({ ...c, [trainer.id]: { ...plan, days: selected ? plan.days.filter(x => x !== day.id) : [...plan.days, day.id].sort() } }))} />; })}</Box></CardContent></Card></Grid>})}</Grid>}
      {step === 3 && <Box><Grid container spacing={1.5} sx={{ mb: 2 }}>{[['الأقسام', activeDepartments.length], ['المدربون المستخدمون', Object.values(assignments).filter(ids => ids.length).length], ['المتدربون الموزعون', assignedCount], ['الجلسات المتوقعة', generated.length || buildSessions().length]].map(([l, v]) => <Grid item xs={6} md={3} key={l as string}><Box sx={{ p: 1.4, border: '1px solid #E2E8F0', borderRadius: 2, bgcolor: '#F8FAFC' }}><Typography sx={{ color: '#64748B', fontSize: 10.5 }}>{l}</Typography><Typography sx={{ fontWeight: 900, fontSize: 18 }}>{v}</Typography></Box></Grid>)}</Grid><Alert severity={conflicts.length ? 'error' : 'success'} icon={conflicts.length ? <ShieldAlert /> : <CheckCircle2 />}>{conflicts.length ? 'حل التعارضات قبل الحفظ.' : 'الجدول جاهز للمراجعة. تم فحص التعارضات قبل الحفظ.'}</Alert></Box>}
    </DialogContent><DialogActions sx={{ justifyContent: 'space-between', p: 2 }}><Button disabled={step === 0} onClick={() => setStep(x => x - 1)}>السابق</Button><Box sx={{ display: 'flex', gap: .8 }}><Button onClick={() => setBuilderOpen(false)}>إلغاء</Button>{step < 2 ? <Button variant="contained" disabled={step === 0 && (!title.trim() || !startDate || !endDate || startDate > endDate)} onClick={() => setStep(x => x + 1)}>التالي</Button> : step === 2 ? <Button variant="contained" onClick={async () => { const ok = await checkConflicts(); if (ok) setStep(3); }}>فحص التعارضات</Button> : <Button variant="contained" color="success" disabled={saveMutation.isPending || conflicts.length > 0} onClick={() => saveMutation.mutate()}>حفظ الجدول الموحد</Button>}</Box></DialogActions></Dialog>

    <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} fullWidth maxWidth="md" dir="rtl"><DialogTitle sx={{ fontWeight: 900 }}>تفاصيل الجدول الموحد</DialogTitle><DialogContent dividers>{activeSchedule ? <Box><Grid container spacing={1.5}>{[['اسم الجدول', activeSchedule.titleAr], ['من', toDateOnly(activeSchedule.startDate)], ['إلى', toDateOnly(activeSchedule.endDate)], ['الحالة', activeSchedule.status === 'published' ? 'منشور' : 'مسودة']].map(([l, v]) => <Grid item xs={12} sm={6} md={3} key={l as string}><Box sx={{ p: 1.4, border: '1px solid #E2E8F0', borderRadius: 2, bgcolor: '#F8FAFC' }}><Typography sx={{ color: '#64748B', fontSize: 10.5 }}>{l}</Typography><Typography sx={{ fontWeight: 900, fontSize: 13 }}>{v}</Typography></Box></Grid>)}</Grid><Divider sx={{ my: 1.5 }} /><Typography sx={{ fontWeight: 900, mb: 1 }}>التوزيع حسب القسم والمدرب</Typography>{activeDepartments.map((d: any) => { const rows = sessions.filter((s: any) => s.departmentId === d.id); if (!rows.length) return null; return <Box key={d.id} sx={{ p: 1.2, mb: .7, bgcolor: '#F8FAFC', borderRadius: 2 }}><Typography sx={{ fontWeight: 800, fontSize: 12.5 }}>{d.nameAr}</Typography><Typography sx={{ color: '#64748B', fontSize: 11 }}>{new Set(rows.map((r: any) => r.trainerProfileId).filter(Boolean)).size} مدربين · {new Set(rows.map((r: any) => r.traineeProfileId).filter(Boolean)).size} متدربين · {rows.length} جلسة</Typography></Box>})}</Box> : <Alert severity="info">لا يوجد جدول محفوظ حاليًا.</Alert>}</DialogContent><DialogActions><Button onClick={() => setDetailsOpen(false)}>إغلاق</Button></DialogActions></Dialog>
  </Box>;
};

export default SmartScheduleWorkspaceV2;
