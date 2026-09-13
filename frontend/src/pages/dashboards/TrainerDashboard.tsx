import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { AlertTriangle, BookOpen, CalendarDays, CheckSquare, ClipboardCheck, Inbox, Megaphone, UserCog, Users, Zap } from 'lucide-react';
import { PageHeader, Panel, PanelGrid, SplitGrid, ListRow, EmptyState, KpiCard, KpiGrid, QuickActions } from '../../components/ui';
import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export const TrainerDashboard: React.FC = () => {
  const { user } = useAuth(); const navigate = useNavigate(); const qc = useQueryClient();
  const { data: dash, isLoading } = useQuery({ queryKey: ['tr-dashboard'], queryFn: async () => (await apiClient.get('/operations/trainer/dashboard')).data?.data ?? null });
  const { data: trainees } = useQuery({ queryKey: ['tr-interns'], queryFn: async () => (await apiClient.get('/operations/trainer/assigned-interns')).data?.data ?? [] });
  const { data: requests } = useQuery({ queryKey: ['tr-assignment-requests'], queryFn: async () => (await apiClient.get('/operations/trainer/assignment-requests')).data?.data ?? [] });
  const accept = useMutation({ mutationFn: (id: string) => apiClient.post(`/operations/trainer/assignment-requests/${id}/accept`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['tr-assignment-requests'] }); qc.invalidateQueries({ queryKey: ['tr-interns'] }); qc.invalidateQueries({ queryKey: ['tr-dashboard'] }); qc.invalidateQueries({ queryKey: ['notifications-unread-count'] }); qc.invalidateQueries({ queryKey: ['notifications-list'] }); } });
  const reject = useMutation({ mutationFn: ({ id, reason }: { id:string; reason:string }) => apiClient.post(`/operations/trainer/assignment-requests/${id}/reject`, { reason }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['tr-assignment-requests'] }); qc.invalidateQueries({ queryKey: ['notifications-unread-count'] }); qc.invalidateQueries({ queryKey: ['notifications-list'] }); } });
  const [selected, setSelected] = React.useState<any>(null);
  return <div style={{display:'flex',flexDirection:'column',gap:24,width:'100%'}}>
    <PageHeader eyebrow="المدرب السريري الميداني" icon={UserCog} title="لوحة المدرب السريري" subtitle={`${user?.nameAr ?? ''} — متابعة المتدربين المسندين إليك فقط`} />
    <KpiGrid min={200}><KpiCard label="أطباء الامتياز المسندون" value={trainees?.length ?? 0} icon={Users} tone="primary"/><KpiCard label="سجلات بانتظار الاعتماد" value={dash?.pendingLogbook ?? 0} icon={BookOpen} tone="warning" onClick={()=>navigate('/logbook')}/><KpiCard label="تقييمات سريرية مطلوبة" value={dash?.pendingEvaluations ?? 0} icon={ClipboardCheck} tone="violet" onClick={()=>navigate('/logbook?tab=evaluations')}/><KpiCard label="طلبات إسناد جديدة" value={requests?.length ?? 0} icon={Inbox} tone="info"/></KpiGrid>
    {(requests?.length ?? 0) > 0 && <Alert severity="warning" icon={<AlertTriangle size={18}/>}>لديك {requests.length} طلب إسناد بانتظار قرارك.</Alert>}
    <SplitGrid>
      <Panel title="أطباء الامتياز تحت إشرافي" icon={Users} action={<Button size="small" variant="outlined" onClick={()=>navigate('/logbook')}>فتح السجل السريري</Button>}>
        {isLoading ? <CircularProgress/> : (trainees?.length ?? 0) === 0 ? <EmptyState icon={Users} title="لا يوجد متدربون مسندون" hint="سيظهر المتدرب هنا بعد اعتماد إسناده لك."/> : trainees.slice(0,12).map((t:any)=><ListRow key={t.id} title={t.person?.nameAr ?? t.nameAr ?? 'طبيب امتياز'} meta={`الرقم: ${t.traineeNumber ?? '—'} · الروتيشن: ${t.rotations?.find((r:any)=>r.status==='active')?.department?.nameAr ?? 'غير محدد'}`} trailing={<Chip size="small" color="success" label="مسند إليك"/>} onClick={()=>setSelected(t)}/>)}
      </Panel>
      <Panel title="الإجراءات السريعة" icon={Zap}><QuickActions items={[{label:'السجل السريري والكفاءات',icon:BookOpen,onClick:()=>navigate('/logbook'),tone:'success',hint:'اعتماد السجلات وتحديث الكفاءات'},{label:'الفعاليات الواردة',icon:Inbox,onClick:()=>navigate('/my-training-events'),tone:'primary',hint:'قبول أو رفض فعالياتك'},{label:'إنشاء فعالية تدريبية',icon:Megaphone,onClick:()=>navigate('/training-events'),tone:'info',hint:'إرسالها للمتدربين المسندين'},{label:'الجدول والشفتات',icon:CalendarDays,onClick:()=>navigate('/schedules'),tone:'violet',hint:'متابعة جدولك التدريبي'}]}/></Panel>
    </SplitGrid>
    <PanelGrid><Panel title="طلبات الإسناد الجديدة" icon={CheckSquare} tone="warning">{(requests?.length ?? 0)===0?<EmptyState icon={CheckSquare} title="لا توجد طلبات"/>:requests.map((r:any)=><ListRow key={r.id} title={r.traineeProfile?.person?.nameAr ?? 'متدرب'} meta={`${r.department?.nameAr ?? ''} · ${String(r.startDate).slice(0,10)} — ${String(r.endDate).slice(0,10)}`} trailing={<Box sx={{display:'flex',gap:1}}><Button size="small" variant="contained" color="success" disabled={accept.isPending} onClick={()=>accept.mutate(r.id)}>قبول</Button><Button size="small" variant="outlined" color="error" disabled={reject.isPending} onClick={()=>{const reason=window.prompt('سبب الرفض:');if(reason?.trim())reject.mutate({id:r.id,reason:reason.trim()});}}>رفض</Button></Box>}/>)}</Panel><Panel title="نطاق الوصول" icon={Users} tone="info"><Typography variant="body2" sx={{color:'#475569'}}>هذه الواجهة لا تعرض «أعضاء الجهة». صلاحية المدرب محصورة بالمتدربين المسندين إليه، وتقييماتهم وسجلاتهم وفعالياتهم.</Typography></Panel></PanelGrid>
    <Dialog open={!!selected} onClose={()=>setSelected(null)} maxWidth="sm" fullWidth><DialogTitle sx={{fontWeight:800}}>{selected?.person?.nameAr ?? selected?.nameAr}</DialogTitle><DialogContent dividers><Typography variant="body2" sx={{color:'#64748B'}}>رقم المتدرب: {selected?.traineeNumber ?? '—'}</Typography><Typography variant="body2" sx={{mt:1,color:'#64748B'}}>يمكنك فتح «السجل السريري» لعرض الحالات والكفاءات والتقييمات لهذا المتدرب.</Typography></DialogContent><DialogActions><Button onClick={()=>setSelected(null)}>إغلاق</Button><Button variant="contained" onClick={()=>navigate('/logbook')}>فتح السجل</Button></DialogActions></Dialog>
  </div>;
};
export default TrainerDashboard;
