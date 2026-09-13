import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { DataPageShell } from '../components/ui';
import { CheckCircle2, Clock3, FileSignature, Layers, PauseCircle, PlayCircle, Plus, RefreshCw } from 'lucide-react';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, MenuItem, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';

export const DeclarationsAdmin: React.FC = () => {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('academic_affairs');
  const [titleAr, setTitleAr] = useState('');
  const [contentAr, setContentAr] = useState('');
  const [mandatory, setMandatory] = useState(true);
  const [activate, setActivate] = useState(false);
  const [error, setError] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['declarations'],
    queryFn: async () => (await apiClient.get('/declarations')).data,
  });
  const declarations: any[] = Array.isArray(data) ? data : (data?.data ?? []);

  const create = useMutation({
    mutationFn: () => apiClient.post('/declarations', { type, titleAr, contentAr, isMandatory: mandatory, isActive: activate }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['declarations'] }); setOpen(false); setTitleAr(''); setContentAr(''); setError(''); setActivate(false); },
    onError: (e: any) => setError(e?.response?.data?.message || 'تعذر إنشاء الإقرار'),
  });
  const status = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => apiClient.patch(`/declarations/${id}/status`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['declarations'] }),
    onError: (e: any) => setError(e?.response?.data?.message || 'تعذر تغيير حالة الإقرار'),
  });
  const version = useMutation({
    mutationFn: ({ declaration, activate }: { declaration: any; activate: boolean }) => apiClient.post(`/declarations/${declaration.id}/version`, { activate }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['declarations'] }),
    onError: (e: any) => setError(e?.response?.data?.message || 'تعذر إنشاء الإصدار الجديد'),
  });

  const active = declarations.filter((d) => d.isActive).length;
  const signed = declarations.reduce((n, d) => n + Number(d._count?.acceptances || 0), 0);
  const drafts = declarations.filter((d) => !d.isActive).length;
  const types = new Set(declarations.map((d) => d.type)).size;

  return <DataPageShell title="إدارة الإقرارات والتعهدات" subtitle="إنشاء الإقرار واعتماده وإيقافه وإصدار نسخ جديدة للمتدربين" loading={isLoading} actions={<Button variant="contained" startIcon={<Plus size={17} />} onClick={() => { setError(''); setOpen(true); }} sx={{ borderRadius: 2, fontWeight: 900, background: 'linear-gradient(135deg,#0F766E,#0D9488)' }}>إنشاء إقرار جديد</Button>} stats={[
    { label: 'الإقرارات', value: declarations.length, icon: FileSignature, tone: 'primary' },
    { label: 'مفعّلة', value: active, icon: PlayCircle, tone: 'success' },
    { label: 'مسودات / متوقفة', value: drafts, icon: Clock3, tone: 'warning' },
    { label: 'إجمالي التوقيعات', value: signed, icon: CheckCircle2, tone: 'success' },
  ]}>
    {(isLoading || status.isPending || version.isPending) && <LinearProgress sx={{ mb: 2 }} />}
    {isError && <Alert severity="error">تعذر تحميل إقرارات الجهة.</Alert>}
    {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

    <Paper elevation={0} sx={{ p: 2, mb: 2, border: '1px solid #DDE7EE', borderRadius: 3, background: 'linear-gradient(135deg,#F0FDFA,#FFFFFF)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: .5 }}><Layers size={18} color="#0F766E" /><Typography fontWeight={900}>مسار الإقرار</Typography></Box>
      <Typography sx={{ color: '#64748B', fontSize: 13 }}>المسؤول ينشئ الإقرار → يتركه مسودة أو يفعّله → يظهر تلقائيًا للمتدربين المؤهلين → يوقّع المتدرب → تتابع عدد الموافقات هنا.</Typography>
    </Paper>

    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #DDE7EE', borderRadius: 3, overflow: 'hidden' }}>
      <Table><TableHead><TableRow sx={{ background: '#F0FDFA' }}>
        <TableCell sx={{ fontWeight: 900 }}>الإقرار</TableCell><TableCell sx={{ fontWeight: 900 }}>النوع</TableCell><TableCell sx={{ fontWeight: 900 }}>الإصدار</TableCell><TableCell sx={{ fontWeight: 900 }}>الموافقات</TableCell><TableCell sx={{ fontWeight: 900 }}>الحالة</TableCell><TableCell sx={{ fontWeight: 900 }}>الإجراءات</TableCell>
      </TableRow></TableHead><TableBody>
        {declarations.map((d) => <TableRow key={d.id} hover>
          <TableCell><Typography fontWeight={900}>{d.titleAr}</Typography><Typography sx={{ color:'#64748B', fontSize:11 }}>{d.isMandatory ? 'إلزامي' : 'اختياري'}</Typography></TableCell>
          <TableCell><Chip size="small" label={d.type === 'joining' ? 'انضمام' : d.type === 'ethics' ? 'أخلاقيات' : 'شؤون أكاديمية'} /></TableCell>
          <TableCell sx={{ fontWeight: 900, color:'#0891B2' }}>v{d.version}</TableCell>
          <TableCell sx={{ fontWeight: 900, color:'#047857' }}>{d._count?.acceptances || 0}</TableCell>
          <TableCell><Chip size="small" label={d.isActive ? 'مفعّل — يظهر للمتدربين' : 'مسودة / متوقف'} color={d.isActive ? 'success' : 'default'} /></TableCell>
          <TableCell><Box sx={{ display:'flex', gap:.7, flexWrap:'wrap' }}>
            <Button size="small" variant="outlined" startIcon={d.isActive ? <PauseCircle size={15}/> : <PlayCircle size={15}/>} onClick={() => status.mutate({ id:d.id, isActive:!d.isActive })}>{d.isActive ? 'إيقاف' : 'تفعيل'}</Button>
            <Button size="small" variant="outlined" startIcon={<RefreshCw size={15}/>} onClick={() => version.mutate({ declaration:d, activate:true })}>إصدار جديد</Button>
          </Box></TableCell>
        </TableRow>)}
        {declarations.length === 0 && <TableRow><TableCell colSpan={6} align="center">لا توجد إقرارات حتى الآن.</TableCell></TableRow>}
      </TableBody></Table>
    </TableContainer>

    <Dialog open={open} onClose={() => !create.isPending && setOpen(false)} fullWidth maxWidth="sm" dir="rtl">
      <DialogTitle sx={{ fontWeight:900 }}>إنشاء إقرار وتعهد</DialogTitle>
      <DialogContent sx={{ display:'grid', gap:1.5, pt:'16px !important' }}>
        <TextField select label="نوع الإقرار" value={type} onChange={(e)=>setType(e.target.value)} fullWidth><MenuItem value="joining">إقرار الانضمام والمباشرة</MenuItem><MenuItem value="academic_affairs">إقرار الشؤون الأكاديمية</MenuItem><MenuItem value="ethics">تعهد السرية وأخلاقيات الممارسة</MenuItem></TextField>
        <TextField label="العنوان" value={titleAr} onChange={(e)=>setTitleAr(e.target.value)} required fullWidth />
        <TextField label="نص الإقرار" value={contentAr} onChange={(e)=>setContentAr(e.target.value)} required multiline minRows={7} fullWidth />
        <TextField select label="الطبيعة" value={mandatory ? 'mandatory':'optional'} onChange={(e)=>setMandatory(e.target.value==='mandatory')} fullWidth><MenuItem value="mandatory">إلزامي</MenuItem><MenuItem value="optional">اختياري</MenuItem></TextField>
        <TextField select label="حالة النشر" value={activate ? 'active':'draft'} onChange={(e)=>setActivate(e.target.value==='active')} fullWidth><MenuItem value="draft">مسودة — لا يظهر للمتدربين</MenuItem><MenuItem value="active">مفعّل — يظهر تلقائيًا للمتدربين</MenuItem></TextField>
      </DialogContent>
      <DialogActions sx={{ p:2 }}><Button onClick={()=>setOpen(false)}>إلغاء</Button><Button variant="contained" disabled={create.isPending || !titleAr.trim() || !contentAr.trim()} onClick={()=>create.mutate()} sx={{ fontWeight:900, background:'linear-gradient(135deg,#0F766E,#0D9488)' }}>{create.isPending ? 'جارٍ الحفظ...' : 'حفظ الإقرار'}</Button></DialogActions>
    </Dialog>
  </DataPageShell>;
};

export default DeclarationsAdmin;
