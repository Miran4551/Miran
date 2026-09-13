import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, Grid, InputLabel, MenuItem, Select, Step, StepLabel, Stepper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import { ArrowRightLeft, CheckCircle2, Clock3, Edit3, Eye, Inbox, PauseCircle, PlayCircle, UsersRound, XCircle } from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { DataPageShell, EmptyState } from '../components/ui';

const STATUS: Record<string, { label: string; color: 'success' | 'warning' | 'error' | 'info' | 'default' }> = {
  allocated: { label: 'مُسند للمستشفى — بانتظار المراجعة', color: 'info' },
  hospital_review: { label: 'قيد مراجعة المستشفى', color: 'warning' },
  hospital_accepted: { label: 'مقبول — بانتظار إسناد القسم والمدرب', color: 'success' },
  active: { label: 'تدريب نشط', color: 'success' },
  on_hold: { label: 'موقوف مؤقتاً', color: 'default' },
  hospital_returned_to_cluster: { label: 'مُعاد للتجمع', color: 'error' },
  rejected: { label: 'مرفوض', color: 'error' },
};
const PROCEDURE_STEPS = ['استلام من التجمع', 'مراجعة المستشفى', 'قبول المتدرب', 'إسناد القسم والمدرب'];

export const HospitalAcceptance: React.FC = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const orgId = user?.activeOrganization?.id;
  const [filter, setFilter] = useState<'all' | 'pending' | 'accepted' | 'active' | 'rejected'>('pending');
  const [selected, setSelected] = useState<any>(null);
  const [dialog, setDialog] = useState<'details' | 'assign' | 'reject' | 'return' | 'hold' | null>(null);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [deptId, setDeptId] = useState('');
  const [trainerId, setTrainerId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [query, setQuery] = useState('');

  const reviewQuery = useQuery({ queryKey: ['hospital-acceptance-unified', orgId], queryFn: async () => (await apiClient.get('/training-requests/hospital-review')).data, enabled: !!orgId });
  const capacityQuery = useQuery({ queryKey: ['hospital-acceptance-capacity', orgId], queryFn: async () => (await apiClient.get(`/organizations/${orgId}/capacity`)).data, enabled: !!orgId });
  const trainerQuery = useQuery({ queryKey: ['hospital-acceptance-trainers', orgId], queryFn: async () => (await apiClient.get('/trainers/workspace-cards')).data?.data ?? [], enabled: !!orgId });
  const rows: any[] = reviewQuery.data?.data ?? [];
  const departments: any[] = capacityQuery.data?.departments ?? [];
  const trainers: any[] = trainerQuery.data ?? [];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['hospital-acceptance-unified'] });
    qc.invalidateQueries({ queryKey: ['hospital-acceptance-capacity'] });
    qc.invalidateQueries({ queryKey: ['hospital-acceptance-trainers'] });
    qc.invalidateQueries({ queryKey: ['hospital-schedules'] });
    qc.invalidateQueries({ queryKey: ['hospital-schedule-detail'] });
  };
  const startReview = useMutation({ mutationFn: (id: string) => apiClient.post(`/training-requests/trainees/${id}/hospital-review/start`), onSuccess: refresh });
  const accept = useMutation({ mutationFn: (id: string) => apiClient.post(`/training-requests/trainees/${id}/hospital-review/accept`, {}), onSuccess: refresh });
  const reject = useMutation({ mutationFn: () => apiClient.post(`/training-requests/trainees/${selected?.id}/hospital-review/reject`, { reason, notes }), onSuccess: () => { refresh(); setDialog(null); } });
  const returnToCluster = useMutation({ mutationFn: () => apiClient.post(`/training-requests/trainees/${selected?.id}/hospital-review/return-to-cluster`, { reason, notes }), onSuccess: () => { refresh(); setDialog(null); } });
  const hold = useMutation({ mutationFn: () => apiClient.post(`/training-requests/trainees/${selected?.id}/hospital-review/hold`, { notes }), onSuccess: () => { refresh(); setDialog(null); } });
  const resume = useMutation({ mutationFn: (id: string) => apiClient.post(`/training-requests/trainees/${id}/hospital-review/resume`), onSuccess: refresh });
  const assign = useMutation({ mutationFn: () => apiClient.post(`/training-requests/trainees/${selected?.id}/allocations/department`, { departmentId: deptId, trainerProfileId: trainerId || undefined, startDate: startDate || undefined, endDate: endDate || undefined, reason: notes || 'إسناد المتدرب للقسم والمدرب داخل المستشفى' }), onSuccess: () => { refresh(); setDialog(null); } });

  const open = (row: any, type: typeof dialog) => {
    setSelected(row); setDialog(type); setReason(''); setNotes('');
    setDeptId(row?.assignedDepartment?.id || ''); setTrainerId(row?.assignedTrainer?.id || '');
    setStartDate(row?.startDate ? String(row.startDate).slice(0, 10) : ''); setEndDate(row?.endDate ? String(row.endDate).slice(0, 10) : '');
  };
  const filtered = useMemo(() => rows.filter((r: any) => {
    const haystack = `${r.nameAr || ''} ${r.nationalId || ''} ${r.trainingRequest?.requestNumber || ''}`.toLowerCase();
    if (query.trim() && !haystack.includes(query.trim().toLowerCase())) return false;
    if (filter === 'pending') return ['allocated', 'hospital_review', 'on_hold'].includes(r.status);
    if (filter === 'accepted') return ['hospital_accepted', 'accepted'].includes(r.status);
    if (filter === 'active') return r.status === 'active';
    if (filter === 'rejected') return ['rejected', 'hospital_returned_to_cluster'].includes(r.status);
    return true;
  }), [rows, filter, query]);
  const counts = {
    all: rows.length,
    pending: rows.filter((r) => ['allocated', 'hospital_review', 'on_hold'].includes(r.status)).length,
    accepted: rows.filter((r) => ['hospital_accepted', 'accepted'].includes(r.status)).length,
    active: rows.filter((r) => r.status === 'active').length,
    rejected: rows.filter((r) => ['rejected', 'hospital_returned_to_cluster'].includes(r.status)).length,
  };
  const stepFor = (row: any) => {
    if (row.status === 'allocated') return 0;
    if (row.status === 'hospital_review') return 1;
    if (['hospital_accepted', 'accepted'].includes(row.status)) return 2;
    if (row.status === 'active' || row.assignedDepartment?.id) return 3;
    return 1;
  };
  const eligibleTrainers = trainers.filter((t: any) => {
    if (!deptId) return true;
    if (t.departmentId === deptId || t.department?.id === deptId || (t.departmentIds ?? []).includes(deptId)) return true;
    const name = departments.find((d: any) => d.id === deptId)?.nameAr?.trim();
    return name ? (t.currentTrainees ?? []).some((x: any) => String(x.departmentNameAr ?? '').trim() === name) : false;
  });

  const rowActions = (row: any) => {
    const actions: React.ReactNode[] = [<Button key="details" size="small" variant="outlined" onClick={() => open(row, 'details')} startIcon={<Eye size={15} />}>التفاصيل</Button>];
    if (['allocated', 'on_hold'].includes(row.status)) actions.push(<Button key="start" size="small" variant="contained" onClick={() => startReview.mutate(row.id)} startIcon={<PlayCircle size={15} />} disabled={startReview.isPending}>بدء المراجعة</Button>);
    if (row.status === 'hospital_review') actions.push(<Button key="accept" size="small" color="success" variant="contained" onClick={() => accept.mutate(row.id)} startIcon={<CheckCircle2 size={15} />} disabled={accept.isPending}>قبول المتدرب</Button>);
    if (['hospital_accepted', 'accepted'].includes(row.status)) actions.push(<Button key="assign" size="small" color="primary" variant="contained" onClick={() => open(row, 'assign')} startIcon={<Edit3 size={15} />}>إسناد القسم والمدرب</Button>);
    if (['hospital_review', 'on_hold'].includes(row.status)) actions.push(<Button key="return" size="small" color="warning" variant="outlined" onClick={() => open(row, 'return')} startIcon={<ArrowRightLeft size={15} />}>إعادة للتجمع</Button>);
    if (row.status === 'hospital_review') actions.push(<Button key="reject" size="small" color="error" variant="outlined" onClick={() => open(row, 'reject')} startIcon={<XCircle size={15} />}>رفض</Button>);
    if (['allocated', 'hospital_review'].includes(row.status)) actions.push(<Button key="hold" size="small" variant="outlined" onClick={() => open(row, 'hold')} startIcon={<PauseCircle size={15} />}>إيقاف مؤقت</Button>);
    if (row.status === 'on_hold') actions.push(<Button key="resume" size="small" color="success" variant="outlined" onClick={() => resume.mutate(row.id)} startIcon={<PlayCircle size={15} />}>استئناف</Button>);
    return actions;
  };

  const renderStepper = (row: any) => (
    <Stepper activeStep={stepFor(row)} alternativeLabel>
      {PROCEDURE_STEPS.map((label) => (
        <Step key={label}><StepLabel>{label}</StepLabel></Step>
      ))}
    </Stepper>
  );

  return (
    <>
      <DataPageShell title="طلبات التدريب والقبول" subtitle="استقبال الطلب الرسمي من التجمع ثم مراجعة وقبول المتدرب وإسناده داخل المستشفى." loading={reviewQuery.isLoading} stats={[
        { label: 'إجمالي المتدربين الواردين', value: counts.all, icon: Inbox, tone: 'primary' },
        { label: 'بانتظار إجراء المستشفى', value: counts.pending, icon: Clock3, tone: counts.pending ? 'warning' : 'success' },
        { label: 'مقبولون بانتظار الإسناد', value: counts.accepted, icon: CheckCircle2, tone: 'success' },
        { label: 'تدريب نشط', value: counts.active, icon: UsersRound, tone: 'success' },
        { label: 'مرفوضون أو مُعادون', value: counts.rejected, icon: XCircle, tone: counts.rejected ? 'danger' : 'neutral' },
      ]}>
        <Card sx={{ mb: 2, borderRadius: 3 }}><CardContent sx={{ p: { xs: 1.5, md: 2 } }}><Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          {(['pending', 'accepted', 'active', 'rejected', 'all'] as const).map((key) => <Button key={key} size="small" variant={filter === key ? 'contained' : 'outlined'} color={key === 'rejected' ? 'error' : key === 'accepted' || key === 'active' ? 'success' : 'primary'} onClick={() => setFilter(key)}>{key === 'pending' ? 'بانتظار إجراء المستشفى' : key === 'accepted' ? 'مقبولون' : key === 'active' ? 'نشطون' : key === 'rejected' ? 'مرفوضون/معادون' : 'الكل'} ({counts[key]})</Button>)}
          <TextField size="small" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث بالاسم أو رقم الطلب..." sx={{ minWidth: { xs: '100%', sm: 280 } }} />
        </Box></CardContent></Card>

        {filtered.length === 0 ? <Box className="glass-card" sx={{ p: 5 }}><EmptyState icon={Inbox} title="لا توجد طلبات في هذا المسار" subtitle="ستظهر هنا الطلبات الرسمية التي اعتمدها التجمع وأرسلها إلى المستشفى." /></Box> : isMobile ? (
          <Grid container spacing={1.5}>{filtered.map((row: any) => { const st = STATUS[row.status] ?? { label: row.status, color: 'default' as const }; const req = row.trainingRequest; return <Grid item xs={12} key={row.id}><Card sx={{ borderRadius: 3 }}><CardContent sx={{ p: 2 }}><Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}><Box><Typography sx={{ fontWeight: 700 }}>{row.nameAr}</Typography><Typography variant="body2" color="text.secondary" dir="ltr">{row.nationalId || '—'}</Typography></Box><Chip size="small" label={st.label} color={st.color} sx={{ fontWeight: 800 }} /></Box><Typography sx={{ mt: 1, fontSize: 12.5 }}>الطلب: <strong dir="ltr">{req?.requestNumber || '—'}</strong></Typography><Typography sx={{ fontSize: 12.5 }}>التخصص: <strong>{row.specialty || req?.specialtyAr || '—'}</strong></Typography><Typography sx={{ fontSize: 12.5 }}>القسم: <strong>{row.assignedDepartment?.nameAr || 'لم يُحدد بعد'}</strong></Typography><Typography sx={{ fontSize: 12.5, mb: 1.2 }}>المدرب: <strong>{row.assignedTrainer?.person?.nameAr || 'لم يُحدد بعد'}</strong></Typography>{renderStepper(row)}<Box sx={{ display: 'flex', gap: .7, flexWrap: 'wrap', mt: 1 }}>{rowActions(row)}</Box></CardContent></Card></Grid>; })}</Grid>
        ) : <TableContainer component={Card} className="table-responsive miran-hospital-requests-table"><Table className="miran-hospital-requests-table-root" sx={{ minWidth: 900 }}><TableHead><TableRow><TableCell sx={{ width: '18% !important' }}>المتدرب</TableCell><TableCell sx={{ width: '16% !important' }}>الطلب والتخصص</TableCell><TableCell sx={{ width: '14% !important' }}>المستشفى</TableCell><TableCell sx={{ width: '10% !important' }}>القسم</TableCell><TableCell sx={{ width: '12% !important' }}>المدرب</TableCell><TableCell sx={{ width: '12% !important' }}>الحالة</TableCell><TableCell sx={{ width: '18% !important' }}>الإجراءات</TableCell></TableRow></TableHead><TableBody>{filtered.map((row: any) => { const st = STATUS[row.status] ?? { label: row.status, color: 'default' as const }; const req = row.trainingRequest; return <TableRow key={row.id} hover><TableCell sx={{ width: '18% !important' }}><Typography sx={{ fontWeight: 500 }} noWrap>{row.nameAr}</Typography><Typography variant="caption" dir="ltr" noWrap>{row.nationalId || '—'}</Typography></TableCell><TableCell sx={{ width: '16% !important' }}><Typography dir="ltr" sx={{ fontWeight: 500 }}>{req?.requestNumber || '—'}</Typography><Typography sx={{ fontSize: 12, fontWeight: 400 }}>{row.specialty || req?.specialtyAr || 'غير محدد'}</Typography></TableCell><TableCell sx={{ width: '14% !important', fontWeight: 400 }}>{user?.activeOrganization?.nameAr || 'المستشفى الحالي'}</TableCell><TableCell sx={{ width: '10% !important', fontWeight: 400 }}>{row.assignedDepartment?.nameAr || 'لم يُحدد بعد'}</TableCell><TableCell sx={{ width: '12% !important', fontWeight: 400 }}>{row.assignedTrainer?.person?.nameAr || 'لم يُحدد بعد'}</TableCell><TableCell sx={{ width: '12% !important' }}><Chip size="small" label={st.label} color={st.color} sx={{ fontWeight: 700 }} /></TableCell><TableCell sx={{ width: '18% !important' }}><Box sx={{ display: 'flex', gap: .7, flexWrap: 'wrap', minWidth: 0 }}>{rowActions(row)}</Box></TableCell></TableRow>})}</TableBody></Table></TableContainer>}
      </DataPageShell>

      <Dialog open={dialog === 'details'} onClose={() => setDialog(null)} fullWidth maxWidth="lg" dir="rtl"><DialogTitle>تفاصيل ومسار قبول المتدرب</DialogTitle><DialogContent dividers>{selected && <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}><Box><Typography sx={{ fontWeight: 900, fontSize: 20 }}>{selected.nameAr}</Typography><Typography color="text.secondary">رقم الطلب: <span dir="ltr">{selected.trainingRequest?.requestNumber || '—'}</span></Typography></Box>{renderStepper(selected)}<Grid container spacing={2}><Grid item xs={12} md={4}><Typography variant="caption" color="text.secondary">الجهة المرسلة</Typography><Typography fontWeight={800}>{selected.trainingRequest?.sourceOrg?.nameAr || 'التجمع الصحي'}</Typography></Grid><Grid item xs={12} md={4}><Typography variant="caption" color="text.secondary">التخصص</Typography><Typography fontWeight={800}>{selected.specialty || selected.trainingRequest?.specialtyAr || '—'}</Typography></Grid><Grid item xs={12} md={4}><Typography variant="caption" color="text.secondary">المستشفى</Typography><Typography fontWeight={800}>{user?.activeOrganization?.nameAr || '—'}</Typography></Grid><Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">القسم</Typography><Typography fontWeight={800}>{selected.assignedDepartment?.nameAr || 'لم يُحدد بعد'}</Typography></Grid><Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">المدرب</Typography><Typography fontWeight={800}>{selected.assignedTrainer?.person?.nameAr || 'لم يُحدد بعد'}</Typography></Grid></Grid></Box>}</DialogContent><DialogActions><Button onClick={() => setDialog(null)}>إغلاق</Button></DialogActions></Dialog>

      <Dialog open={dialog === 'assign'} onClose={() => setDialog(null)} fullWidth maxWidth="lg" dir="rtl"><DialogTitle>إسناد المتدرب للقسم والمدرب</DialogTitle><DialogContent dividers><Alert severity="info" sx={{ mb: 2 }}>هذا الإجراء خاص بإدارة التدريب بالمستشفى بعد قبول المتدرب. التجمع لا يحدد القسم أو المدرب.</Alert><Grid container spacing={2}><Grid item xs={12}><Typography sx={{ fontWeight: 900 }}>{selected?.nameAr}</Typography></Grid><Grid item xs={12} md={6}><FormControl fullWidth><InputLabel>القسم السريري *</InputLabel><Select value={deptId} label="القسم السريري *" onChange={(e) => { const next = e.target.value; setDeptId(next); if (trainerId) { const valid = trainers.find((t: any) => t.id === trainerId); const ok = valid && (valid.departmentId === next || valid.department?.id === next || (valid.departmentIds ?? []).includes(next)); if (!ok) setTrainerId(''); } }}>{departments.map((d: any) => { const cap = d.occupancy?.capacity ?? d.capacity ?? 0; const occ = d.occupancy?.occupied ?? 0; const available = d.occupancy?.available ?? Math.max(0, cap - occ); return <MenuItem key={d.id} value={d.id} disabled={available <= 0}>{d.nameAr} — المتاح: {available}</MenuItem>; })}</Select></FormControl></Grid><Grid item xs={12} md={6}><FormControl fullWidth><InputLabel>المدرب السريري *</InputLabel><Select value={trainerId} label="المدرب السريري *" onChange={(e) => setTrainerId(e.target.value)} disabled={!deptId}><MenuItem value="">— اختر المدرب —</MenuItem>{eligibleTrainers.map((t: any) => { const disabled = !t.isActive || Boolean(t.onLeave) || (t.available ?? 0) <= 0; return <MenuItem key={t.id} value={t.id} disabled={disabled}>{t.nameAr} — المتاح: {t.available ?? 0}</MenuItem>; })}</Select></FormControl></Grid><Grid item xs={12} md={6}><TextField fullWidth type="date" label="بداية التدريب" value={startDate} onChange={(e) => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} /></Grid><Grid item xs={12} md={6}><TextField fullWidth type="date" label="نهاية التدريب" value={endDate} onChange={(e) => setEndDate(e.target.value)} InputLabelProps={{ shrink: true }} /></Grid><Grid item xs={12}><TextField fullWidth multiline rows={3} label="ملاحظات الإسناد" value={notes} onChange={(e) => setNotes(e.target.value)} /></Grid></Grid></DialogContent><DialogActions><Button onClick={() => setDialog(null)}>إلغاء</Button><Button variant="contained" color="success" onClick={() => assign.mutate()} disabled={assign.isPending || !deptId || !trainerId}>{assign.isPending ? <CircularProgress size={20} /> : 'حفظ الإسناد'}</Button></DialogActions></Dialog>

      <Dialog open={dialog === 'reject'} onClose={() => setDialog(null)} fullWidth maxWidth="lg" dir="rtl"><DialogTitle>رفض المتدرب</DialogTitle><DialogContent dividers><Alert severity="warning">سيتم إشعار التجمع بسبب الرفض.</Alert><TextField fullWidth required label="سبب الرفض" value={reason} onChange={(e) => setReason(e.target.value)} multiline rows={3} sx={{ mt: 2 }} /></DialogContent><DialogActions><Button onClick={() => setDialog(null)}>إلغاء</Button><Button color="error" variant="contained" onClick={() => reject.mutate()} disabled={reject.isPending || !reason}>تأكيد الرفض</Button></DialogActions></Dialog>
      <Dialog open={dialog === 'return'} onClose={() => setDialog(null)} fullWidth maxWidth="lg" dir="rtl"><DialogTitle>إعادة المتدرب للتجمع</DialogTitle><DialogContent dividers><TextField fullWidth required label="سبب الإعادة" value={reason} onChange={(e) => setReason(e.target.value)} multiline rows={3} /></DialogContent><DialogActions><Button onClick={() => setDialog(null)}>إلغاء</Button><Button color="warning" variant="contained" onClick={() => returnToCluster.mutate()} disabled={returnToCluster.isPending || !reason}>إعادة للتجمع</Button></DialogActions></Dialog>
      <Dialog open={dialog === 'hold'} onClose={() => setDialog(null)} fullWidth maxWidth="lg" dir="rtl"><DialogTitle>إيقاف المراجعة مؤقتاً</DialogTitle><DialogContent dividers><TextField fullWidth label="سبب الإيقاف" value={notes} onChange={(e) => setNotes(e.target.value)} multiline rows={3} /></DialogContent><DialogActions><Button onClick={() => setDialog(null)}>إلغاء</Button><Button variant="contained" onClick={() => hold.mutate()} disabled={hold.isPending}>تأكيد الإيقاف</Button></DialogActions></Dialog>
    </>
  );
};
export default HospitalAcceptance;
