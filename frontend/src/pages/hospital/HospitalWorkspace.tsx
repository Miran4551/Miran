import React, { useMemo, Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, Tab, Box, CircularProgress } from '@mui/material';
import { Stethoscope } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PageHeader } from '../../components/ui';
import { WorkspaceOverview } from './WorkspaceOverview';
import { TrainerCards } from './TrainerCards';
import { EvaluationForms } from './EvaluationForms';
import { ScheduleBuilder } from './ScheduleBuilder';
const CallsHub = lazy(() => import('./CallsHub').then((m) => ({ default: m.CallsHub })));
import { HospitalCapacity } from '../HospitalCapacity';
import { TrainerReassignment } from '../TrainerReassignment';
import { TrainerLeaveManagement } from '../TrainerLeaveManagement';
import { LogbookPage } from '../Logbook';
import { Incidents } from '../Incidents';
import { Graduation } from '../Graduation';
import { Notifications } from '../Notifications';
import { HospitalAcceptance } from '../HospitalAcceptance';
interface Section { key: string; label: string; render: (goTo: (tab: string) => void) => React.ReactNode; }
const TAB_ALIASES: Record<string, string> = { distribution: 'requests', allocations: 'requests', interns: 'requests', acceptance: 'requests', trainers_cards: 'trainers', reassignments: 'reassignment', builder: 'schedules', schedule_builder: 'schedules' };
const SECTIONS: Section[] = [
 { key:'overview',label:'نظرة عامة',render:goTo=><WorkspaceOverview onNavigate={goTo}/> },
 { key:'requests',label:'طلبات التدريب والقبول',render:()=> <HospitalAcceptance/> },
 { key:'capacity',label:'الأقسام والسعة',render:()=> <HospitalCapacity/> },
 { key:'schedules',label:'منشئ الجداول والشفتات',render:()=> <ScheduleBuilder/> },
 { key:'trainers',label:'بطاقات المدربين',render:goTo=><TrainerCards onNavigate={goTo}/> },
 { key:'calls',label:'النداءات والفعاليات',render:()=> <CallsHub/> },
 { key:'reassignment',label:'إعادة إسناد المدربين',render:()=> <TrainerReassignment/> },
 { key:'leaves',label:'الإجازات والتغطيات',render:()=> <TrainerLeaveManagement/> },
 { key:'logbook',label:'السجل السريري',render:()=> <LogbookPage/> },
 { key:'eval-forms',label:'التقييمات',render:()=> <EvaluationForms/> },
 { key:'incidents',label:'البلاغات',render:()=> <Incidents/> },
 { key:'graduation',label:'التخرج والاعتماد',render:()=> <Graduation/> },
 { key:'notifications',label:'الإشعارات',render:()=> <Notifications/> },
];
export const HospitalWorkspace:React.FC=()=>{const{user}=useAuth();const[params,setParams]=useSearchParams();const raw=params.get('tab');const requested=raw?(TAB_ALIASES[raw]||raw):null;const isAdmin=user?.roles?.some(r=>['hospital_training_admin','org_manager'].includes(r));const available=useMemo(()=>isAdmin?SECTIONS.filter(s=>s.key!=='logbook'):SECTIONS,[isAdmin]);const initial=requested&&available.some(s=>s.key===requested)?requested:'overview';const[active,setActive]=React.useState(initial);React.useEffect(()=>{if(requested&&available.some(s=>s.key===requested))setActive(requested)},[requested,available]);const goTo=(tab:string)=>{const canonical=TAB_ALIASES[tab]||tab;setActive(canonical);setParams(prev=>{const next=new URLSearchParams(prev);next.set('tab',canonical);return next},{replace:true})};const section=available.find(s=>s.key===active)||available[0];return <div dir="rtl" style={{display:'flex',flexDirection:'column',gap:24,width:'100%',minWidth:0}}><PageHeader eyebrow="HOSPITAL OPERATIONAL WORKSPACE" icon={Stethoscope} title={user?.activeOrganization?.nameAr||'مساحة عمل المستشفى'} subtitle="مركز العمليات — استقبال الطلبات وقبول المتدربين ثم إسناد القسم والمدرب ومتابعة التدريب"/><Box sx={{borderBottom:1,borderColor:'#E2E8F0',maxWidth:'100%',overflowX:'auto'}}><Tabs value={active} onChange={(_,v)=>goTo(v)} variant="scrollable" scrollButtons="auto">{available.map(s=><Tab key={s.key} value={s.key} label={s.label}/>)}</Tabs></Box><div style={{width:'100%',minWidth:0}}><Suspense fallback={<div style={{display:'flex',justifyContent:'center',padding:48}}><CircularProgress size={32}/></div>}>{section.render(goTo)}</Suspense></div></div>};
export default HospitalWorkspace;
