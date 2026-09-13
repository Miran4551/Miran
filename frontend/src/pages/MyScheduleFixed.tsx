import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays, Clock3, Building2, Plus, ChevronLeft, ChevronRight,
  List, LayoutGrid, CheckCircle2,
} from 'lucide-react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, IconButton, InputLabel, MenuItem, Paper, Select, TextField, Typography,
} from '@mui/material';
import { apiClient } from '../api/client';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const DAYS = [
  { id: 0, label: 'الأحد' },
  { id: 1, label: 'الإثنين' },
  { id: 2, label: 'الثلاثاء' },
  { id: 3, label: 'الأربعاء' },
  { id: 4, label: 'الخميس' },
];
const SLOTS = ['08:00 - 10:00', '10:00 - 12:00', '12:00 - 14:00', '14:00 - 16:00', '16:00 - 18:00'];
const shiftLabels: Record<string, string> = { morning: 'صباحية', evening: 'مسائية', night: 'ليلية', '24h': '24 ساعة' };

function formatDate(value: any) {
  if (!value) return 'غير محدد';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'غير محدد' : d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
}
function toDate(value: any) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function toIso(value: Date) { return value.toISOString().slice(0, 10); }
function startOfWeek(value: Date) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}
function timeToMinutes(value?: string | null) {
  if (!value) return 0;
  const [h, m] = value.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function overlaps(aStart?: string | null, aEnd?: string | null, bStart?: string | null, bEnd?: string | null) {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return Math.max(timeToMinutes(aStart), timeToMinutes(bStart)) < Math.min(timeToMinutes(aEnd), timeToMinutes(bEnd));
}

export const MyScheduleFixed: React.FC = () => {
  const navigate = useNavigate();
  const { primaryRole } = useAuth();
  const qc = useQueryClient();
  const isTrainer = primaryRole === 'trainer';
  const [createOpen, setCreateOpen] = React.useState(false);
  const [view, setView] = React.useState<'calendar' | 'list'>('calendar');
  const [weekStart, setWeekStart] = React.useState(() => startOfWeek(new Date()));
  const [traineeId, setTraineeId] = React.useState('');
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = React.useState('08:00');
  const [endTime, setEndTime] = React.useState('10:00');
  const [sessionType, setSessionType] = React.useState('clinical_round');
  const [message, setMessage] = React.useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: [isTrainer ? 'trainer-schedules' : 'trainee-training-overview-schedule-page'],
    queryFn: async () => (await apiClient.get(isTrainer ? '/schedules' : '/trainees/me/training-overview')).data,
  });

  const { data: assigned } = useQuery({
    queryKey: ['trainer-assigned-interns-for-schedule'],
    enabled: isTrainer && createOpen,
    queryFn: async () => (await apiClient.get('/operations/trainer/assigned-interns')).data?.data ?? [],
  });

  const createSchedule = useMutation({
    mutationFn: async () => {
      const trainee = (assigned ?? []).find((t: any) => t.id === traineeId);
      const rotation = trainee?.rotations?.find((r: any) => ['active', 'scheduled', 'pending_acceptance'].includes(r.status));
      if (!rotation?.departmentId) throw new Error('لا يوجد قسم تدريبي نشط للمتدرب المحدد');
      return apiClient.post('/schedules', {
        titleAr: `جدول تدريبي — ${trainee?.person?.nameAr || 'متدرب'}`,
        startDate: date, endDate: date, departmentId: rotation.departmentId,
        traineeProfileIds: [traineeId],
        sessions: [{
          date, startTime, endTime, departmentId: rotation.departmentId,
          trainerProfileId: rotation.trainerProfileId || trainee?.rotation?.trainerProfileId,
          traineeProfileId: traineeId, sessionType, shiftType: 'morning',
        }],
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trainer-schedules'] });
      setCreateOpen(false);
      setMessage('تم إنشاء مسودة الجدول بنجاح، وتبقى عملية النشر والاعتماد لدى الجهة المخولة.');
      setTraineeId('');
    },
    onError: (e: any) => setMessage(e.response?.data?.message || e.message || 'تعذر إنشاء الجدول'),
  });

  const schedules: any[] = isTrainer ? (data?.data ?? []) : (data?.schedules ?? []);
  const shifts: any[] = isTrainer ? [] : (data?.shifts ?? []);
  const allocation = data?.training?.allocation;
  const rotation = data?.training?.activeRotation;
  const rows = isTrainer
    ? schedules.flatMap((schedule: any) => (schedule.sessions ?? []).map((session: any) => ({ ...session, scheduleTitle: schedule.titleAr })))
    : schedules.flatMap((schedule: any) =>
        (schedule.sessions?.length ? schedule.sessions : [{ date: schedule.startDate, startTime: null, endTime: null, shiftType: null, department: schedule.department }])
          .map((session: any) => ({ ...session, scheduleTitle: schedule.titleAr })),
      );

  const calendarRows = React.useMemo(() => [...rows, ...shifts.map((shift: any) => ({
    ...shift, scheduleTitle: 'مناوبة مسجلة', isShift: true,
  }))], [rows, shifts]);

  const weekDays = React.useMemo(() => DAYS.map((day) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + day.id);
    return { ...day, date: d, iso: toIso(d) };
  }), [weekStart]);

  const visibleCount = calendarRows.filter((row: any) => {
    const d = row.date ? toDate(row.date) : null;
    return d && d >= weekDays[0].date && d <= new Date(weekDays[4].date.getTime() + 86399999);
  }).length;

  const moveWeek = (amount: number) => {
    setWeekStart((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + amount * 7);
      return next;
    });
  };

  return (
    <Box dir="rtl" sx={{ width: '100%', p: { xs: 1.5, md: 3 }, textAlign: 'right' }}>
      <Box sx={{ maxWidth: 1380, mx: 'auto' }}>
        <Box sx={{ mb: 2.5, display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <Box>
            <Typography sx={{ color: '#64748B', fontSize: 12.5, fontWeight: 700 }}>رحلتي التدريبية</Typography>
            <Typography sx={{ color: '#0F172A', fontSize: { xs: 22, md: 28 }, fontWeight: 900 }}>جدولي ومناوباتي التدريبية</Typography>
            <Typography sx={{ color: '#64748B', fontSize: 13, mt: .5 }}>
              {isTrainer ? 'إنشاء ومتابعة الجلسات للمتدربين المسندين إليك.' : 'الجداول المنشورة لك، مع المناوبات والروتيشن الحالي.'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Box className="miran-view-toggle">
              <Button size="small" variant={view === 'calendar' ? 'contained' : 'text'} startIcon={<LayoutGrid size={15} />} onClick={() => setView('calendar')}>أسبوعي</Button>
              <Button size="small" variant={view === 'list' ? 'contained' : 'text'} startIcon={<List size={15} />} onClick={() => setView('list')}>قائمة</Button>
            </Box>
            {isTrainer && <Button variant="contained" startIcon={<Plus size={17} />} onClick={() => { setMessage(''); setCreateOpen(true); }}>إنشاء جدول تدريبي</Button>}
          </Box>
        </Box>

        {message && <Alert severity={message.startsWith('تم') ? 'success' : 'error'} sx={{ mb: 2 }} onClose={() => setMessage('')}>{message}</Alert>}
        {isError && <Alert severity="error" sx={{ mb: 2 }}>تعذر تحميل الجداول التدريبية من الخادم.</Alert>}

        {!isTrainer && (
          <Paper className="miran-panel" sx={{ p: { xs: 1.5, md: 2 }, mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}><Building2 size={18} /><Typography sx={{ fontWeight: 900, fontSize: 15 }}>الإسناد الحالي</Typography></Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', lg: 'repeat(4,1fr)' }, gap: 1.2 }}>
              <Mini label="المستشفى" value={data?.training?.hospital?.nameAr || 'غير محدد'} />
              <Mini label="القسم" value={rotation?.department?.nameAr || allocation?.department?.nameAr || 'غير معين'} />
              <Mini label="المدرب" value={rotation?.trainerProfile?.person?.nameAr || allocation?.trainerProfile?.person?.nameAr || 'غير معين'} />
              <Mini label="البرنامج" value={data?.training?.programNameAr || 'غير محدد'} />
            </Box>
          </Paper>
        )}

        <Paper className="miran-panel" sx={{ overflow: 'hidden' }}>
          <Box sx={{ p: { xs: 1.5, md: 2 }, borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CalendarDays size={19} />
              <Box>
                <Typography sx={{ fontWeight: 900, fontSize: 16 }}>الجلسات والمناوبات المجدولة</Typography>
                <Typography sx={{ color: '#64748B', fontSize: 11.5 }}>{visibleCount} نشاط هذا الأسبوع · {calendarRows.length} إجمالاً</Typography>
              </Box>
            </Box>
            {view === 'calendar' && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: .5 }}>
                <IconButton size="small" onClick={() => moveWeek(1)} title="الأسبوع التالي"><ChevronRight size={18} /></IconButton>
                <Chip size="small" label={`${weekDays[0].date.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' })} — ${weekDays[4].date.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short', year: 'numeric' })}`} />
                <IconButton size="small" onClick={() => moveWeek(-1)} title="الأسبوع السابق"><ChevronLeft size={18} /></IconButton>
                <Button size="small" onClick={() => setWeekStart(startOfWeek(new Date()))}>هذا الأسبوع</Button>
              </Box>
            )}
          </Box>

          {isLoading ? <Typography sx={{ textAlign: 'center', py: 6, color: '#64748B' }}>جارٍ تحميل الجداول...</Typography>
          : calendarRows.length === 0 ? (
            <Box sx={{ textAlign: 'center', p: 6, bgcolor: '#F8FAFC' }}>
              <CalendarDays size={34} />
              <Typography sx={{ fontWeight: 900, mt: 1 }}>{isTrainer ? 'لا توجد جلسات أو مناوبات مسندة إليك حاليًا.' : 'لا توجد جداول أو مناوبات منشورة لك حاليًا.'}</Typography>
            </Box>
          ) : view === 'calendar' ? (
            <Box className="miran-calendar-scroll">
              <Box sx={{ minWidth: 980 }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: '130px repeat(5,minmax(170px,1fr))', bgcolor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <Box sx={{ p: 1.25, fontWeight: 900, fontSize: 11.5 }}>الفترة الزمنية</Box>
                  {weekDays.map((day) => <Box key={day.iso} sx={{ p: 1.25, textAlign: 'center', borderRight: '1px solid #E2E8F0' }}><Typography sx={{ fontWeight: 900, fontSize: 12 }}>{day.label}</Typography><Typography sx={{ color: '#64748B', fontSize: 10.5 }}>{day.date.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' })}</Typography></Box>)}
                </Box>
                {SLOTS.map((slot) => {
                  const [slotStart, slotEnd] = slot.split(' - ');
                  return <Box key={slot} sx={{ display: 'grid', gridTemplateColumns: '130px repeat(5,minmax(170px,1fr))', minHeight: 128, borderBottom: '1px solid #E2E8F0' }}>
                    <Box sx={{ p: 1.25, bgcolor: '#FBFDFF', display: 'flex', alignItems: 'center', gap: .7, borderLeft: '1px solid #E2E8F0' }}><Clock3 size={14} /><Typography sx={{ fontSize: 11, fontWeight: 800 }}>{slot}</Typography></Box>
                    {weekDays.map((day) => {
                      const cell = calendarRows.filter((row: any) => { const d = row.date ? toDate(row.date) : null; return d && toIso(d) === day.iso && (row.isShift || !row.startTime || overlaps(slotStart, slotEnd, row.startTime, row.endTime)); });
                      return <Box key={day.iso} sx={{ p: .75, borderRight: '1px solid #E2E8F0', bgcolor: '#fff' }}>
                        {cell.slice(0, 4).map((row: any, index: number) => <Box key={`${row.id || row.scheduleTitle}-${index}`} sx={{ mb: .6, p: .85, border: '1px solid #D9E8FF', borderRadius: 1.7, bgcolor: '#F7FAFF' }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: .5, alignItems: 'center' }}><Typography sx={{ fontSize: 10.5, fontWeight: 900 }} noWrap>{row.scheduleTitle || 'جدول تدريبي'}</Typography>{row.isShift && <CheckCircle2 size={13} />}</Box>
                          <Typography sx={{ fontSize: 10, color: '#334155', mt: .2 }} noWrap>{row.department?.nameAr || rotation?.department?.nameAr || 'القسم السريري'}</Typography>
                          <Typography sx={{ fontSize: 9.5, color: '#64748B', mt: .2 }} noWrap>{row.startTime && row.endTime ? `${row.startTime} — ${row.endTime}` : (shiftLabels[row.shiftType] || 'مناوبة')}</Typography>
                          <Typography sx={{ fontSize: 9.5, color: '#64748B' }} noWrap>{row.trainerProfile?.person?.nameAr || rotation?.trainerProfile?.person?.nameAr || 'غير معين'}</Typography>
                        </Box>)}
                        {cell.length > 4 && <Typography sx={{ fontSize: 9.5, color: '#0F766E', fontWeight: 800, textAlign: 'center' }}>+{cell.length - 4} أخرى</Typography>}
                      </Box>;
                    })}
                  </Box>;
                })}
              </Box>
            </Box>
          ) : (
            <Box className="table-scroll">
              <table className="miran-data-table">
                <thead><tr><th>#</th><th>الجدول</th><th>القسم</th><th>التاريخ</th><th>الوقت</th><th>المدرب</th><th>الحالة</th></tr></thead>
                <tbody>{calendarRows.map((row: any, index: number) => <tr key={`${row.id || row.scheduleTitle}-${index}`}><td>{index + 1}</td><td>{row.scheduleTitle || 'جدول تدريبي'}</td><td>{row.department?.nameAr || rotation?.department?.nameAr || '—'}</td><td>{formatDate(row.date)}</td><td>{row.startTime && row.endTime ? `${row.startTime} — ${row.endTime}` : (shiftLabels[row.shiftType] || 'مناوبة')}</td><td>{row.trainerProfile?.person?.nameAr || rotation?.trainerProfile?.person?.nameAr || '—'}</td><td><Chip size="small" label={row.isShift ? 'مناوبة' : 'مجدولة'} color={row.isShift ? 'warning' : 'success'} /></td></tr>)}</tbody>
              </table>
            </Box>
          )}
        </Paper>

        <Button sx={{ mt: 2, fontWeight: 800 }} variant="outlined" onClick={() => navigate('/profile')}>العودة إلى الملف الشخصي</Button>
      </Box>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="sm" dir="rtl">
        <DialogTitle sx={{ fontWeight: 900 }}>إنشاء جدول تدريبي — للمدرب</DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }}>يمكنك إنشاء المسودة للمتدربين المسندين إليك فقط. النشر النهائي يبقى لدى إدارة التدريب.</Alert>
          <FormControl fullWidth sx={{ mb: 2 }}><InputLabel>المتدرب</InputLabel><Select value={traineeId} label="المتدرب" onChange={e => setTraineeId(e.target.value)}>{(assigned ?? []).map((t: any) => <MenuItem key={t.id} value={t.id}>{t.person?.nameAr || t.nameAr || 'متدرب'}</MenuItem>)}</Select></FormControl>
          <TextField fullWidth type="date" label="التاريخ" value={date} onChange={e => setDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ mb: 2 }} />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 2 }}><TextField type="time" label="من" value={startTime} onChange={e => setStartTime(e.target.value)} InputLabelProps={{ shrink: true }} /><TextField type="time" label="إلى" value={endTime} onChange={e => setEndTime(e.target.value)} InputLabelProps={{ shrink: true }} /></Box>
          <FormControl fullWidth><InputLabel>نوع الجلسة</InputLabel><Select value={sessionType} label="نوع الجلسة" onChange={e => setSessionType(e.target.value)}><MenuItem value="clinical_round">مرور سريري</MenuItem><MenuItem value="lecture">محاضرة</MenuItem><MenuItem value="workshop">ورشة</MenuItem><MenuItem value="emergency_shift">مناوبة طوارئ</MenuItem></Select></FormControl>
        </DialogContent>
        <DialogActions><Button onClick={() => setCreateOpen(false)}>إلغاء</Button><Button variant="contained" disabled={!traineeId || createSchedule.isPending} onClick={() => createSchedule.mutate()}>{createSchedule.isPending ? 'جارٍ الإنشاء...' : 'إنشاء المسودة'}</Button></DialogActions>
      </Dialog>
    </Box>
  );
};

const Mini: React.FC<{ label: string; value: string }> = ({ label, value }) => <Box sx={{ p: 1.5, border: '1px solid #E2E8F0', borderRadius: 2.2, backgroundColor: '#F8FAFC' }}><Typography sx={{ color: '#64748B', fontSize: 11 }}>{label}</Typography><Typography sx={{ color: '#0F172A', fontWeight: 800, fontSize: 13, mt: .4 }}>{value}</Typography></Box>;

export default MyScheduleFixed;
