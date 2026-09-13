import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Edit, GraduationCap, KeyRound, ShieldAlert, UserCog, UsersRound } from 'lucide-react';
import { Alert, Button, Chip } from '@mui/material';
import { DataPageShell, EmptyState, EntityCard, Surface, TableCard, ViewToggle, Badge } from '../components/ui';
import { colour, font, radius, space } from '../components/ui/tokens';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface RoleDef { id: string; code: string; nameAr: string; nameEn?: string; }
interface DeptDef { id: string; code?: string; nameAr: string; nameEn?: string; }
interface TrainerDef {
  id: string;
  person?: { id?: string; nationalId?: string | null; nameAr?: string; nameEn?: string | null };
  department?: { id: string; nameAr: string } | null;
  departmentId?: string | null;
  organizationId?: string;
  titleAr?: string | null;
  maxTrainees?: number;
  isActive?: boolean;
}
interface OrgMember {
  id: string;
  email: string;
  username?: string;
  isActive: boolean;
  nameAr?: string;
  nameEn?: string;
  nationalId?: string;
  phone?: string;
  roles: Array<{ id: string; code: string; nameAr: string }>;
  isPrimary?: boolean;
  departmentId?: string | null;
  department?: { id: string; nameAr: string } | null;
}

const ROLE_LABELS: Record<string, string> = {
  org_manager: 'مدير الجهة',
  academic_supervisor: 'مشرف أكاديمي',
  trainer: 'مدرب',
  trainee: 'متدرب',
};
const ADD_MEMBER_ROLES = ['org_manager','platform_owner','cluster_administrator','cluster_manager','training_director','hospital_administrator','hospital_training_admin','university_administrator'];
const MANAGE_PERMISSIONS_ROLES = ['org_manager','platform_owner','cluster_administrator','cluster_manager','training_director','hospital_training_admin','university_administrator'];
const MANAGE_ACTIVE_ROLES = ['org_manager','platform_owner','cluster_administrator','hospital_administrator','hospital_training_admin'];

export const OrgMembersFixed: React.FC = () => {
  const { primaryRole } = useAuth();
  const canAdd = ADD_MEMBER_ROLES.includes(primaryRole);
  const canEdit = ADD_MEMBER_ROLES.includes(primaryRole);
  const canManagePermissions = MANAGE_PERMISSIONS_ROLES.includes(primaryRole);
  const canManageActive = MANAGE_ACTIVE_ROLES.includes(primaryRole);

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [departments, setDepartments] = useState<DeptDef[]>([]);
  const [trainers, setTrainers] = useState<TrainerDef[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [editMember, setEditMember] = useState<OrgMember | null>(null);
  const [permissionsMember, setPermissionsMember] = useState<OrgMember | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [m, r, d, t] = await Promise.all([
        apiClient.get('/org-members'),
        apiClient.get('/org-members/roles/available'),
        apiClient.get('/org-members/departments'),
        apiClient.get('/trainers'),
      ]);
      setMembers(m.data?.data ?? m.data ?? []);
      setRoles(r.data?.data ?? []);
      setDepartments(d.data?.data ?? []);
      setTrainers(t.data?.data ?? []);
    } catch (e: any) {
      setError(e.response?.data?.message || 'فشل تحميل بيانات أعضاء الجهة');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => members.filter((m) => {
    const roleOk = !filterRole || m.roles.some((r) => r.code === filterRole);
    const q = search.trim();
    const searchOk = !q || [m.nameAr, m.email, m.nationalId, m.phone].filter(Boolean).some((v) => String(v).includes(q));
    return roleOk && searchOk;
  }), [members, search, filterRole]);

  const active = members.filter((m) => m.isActive).length;
  const trainerCount = members.filter((m) => m.roles.some((r) => r.code === 'trainer')).length;
  const traineeCount = members.filter((m) => m.roles.some((r) => r.code === 'trainee')).length;
  const noDept = members.filter((m) => m.roles.some((r) => r.code === 'trainer') && !m.departmentId && !m.department).length;

  const deactivate = async (id: string) => {
    if (!window.confirm('هل تريد تعطيل هذا الحساب؟')) return;
    try { await apiClient.delete(`/org-members/${id}`); setSuccess('تم تعطيل الحساب'); await load(); }
    catch (e: any) { setError(e.response?.data?.message || 'فشل التعطيل'); }
  };
  const activate = async (id: string) => {
    try { await apiClient.patch(`/org-members/${id}/activate`); setSuccess('تم تفعيل الحساب'); await load(); }
    catch (e: any) { setError(e.response?.data?.message || 'فشل التفعيل'); }
  };

  return <DataPageShell
    icon={UsersRound}
    title="أعضاء الجهة"
    subtitle="إدارة الأعضاء والأدوار والقسم السريري للمدربين"
    stats={[
      { label: 'إجمالي الأعضاء', value: members.length, icon: UsersRound, tone: 'primary' },
      { label: 'أعضاء نشطون', value: active, icon: CheckCircle2, tone: 'success' },
      { label: 'المدربون', value: trainerCount, icon: UserCog, tone: 'violet' },
      { label: 'المتدربون', value: traineeCount, icon: GraduationCap, tone: 'info' },
      { label: 'مدربون بلا قسم', value: noDept, icon: ShieldAlert, tone: noDept ? 'warning' : 'success' },
    ]}
    toolbar={<div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap', width:'100%' }}>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>{[['','الكل'],['org_manager','مدير الجهة'],['academic_supervisor','مشرف أكاديمي'],['trainer','مدرب'],['trainee','متدرب']].map(([v,l]) => <button key={v} onClick={()=>setFilterRole(v)} style={{ padding:'6px 14px', border:0, borderRadius:radius.md, cursor:'pointer', fontWeight:700, fontFamily:'inherit', background:filterRole===v?colour.primary:colour.canvas, color:filterRole===v?'#fff':colour.muted }}>{l}</button>)}</div>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث بالاسم أو الهوية أو البريد..." style={{ flex:'1 1 220px', padding:'10px 14px', background:colour.canvas, border:`1px solid ${colour.border}`, borderRadius:radius.md, fontFamily:'inherit', outline:'none' }} />
      <ViewToggle value={view} onChange={setView}/>
      {canAdd && <Button variant="contained" onClick={()=>setShowAdd(true)} sx={{ background:colour.primary, fontWeight:800 }}>إضافة عضو جديد +</Button>}
    </div>}
  >
    {error && <Alert severity="error" sx={{ mb: 2 }} onClose={()=>setError('')}>{error}</Alert>}
    {success && <Alert severity="success" sx={{ mb: 2 }} onClose={()=>setSuccess('')}>{success}</Alert>}
    {loading ? <Surface><div style={{ padding:40, textAlign:'center', color:colour.muted }}>⏳ جاري التحميل...</div></Surface>
      : filtered.length===0 ? <Surface><EmptyState icon={UsersRound} title="لا يوجد أعضاء مطابقون" hint="جرّب تغيير الفلتر أو البحث."/></Surface>
      : view==='cards' ? <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))', gap:16 }}>
        {filtered.map(m => {
          const role = m.roles[0]?.code || 'trainee';
          const trainer = role==='trainer' ? trainers.find(t => t.person?.nationalId && t.person.nationalId===m.nationalId) : null;
          return <EntityCard key={m.id} icon={role==='trainer'?UserCog:role==='academic_supervisor'?GraduationCap:UsersRound} tone={role==='trainer'?'violet':'info'} title={m.nameAr||m.email} subtitle={m.email}
            badges={[{label:m.isActive?'نشط':'معطل', tone:m.isActive?'success':'danger'}, ...m.roles.map(r=>({label:ROLE_LABELS[r.code]||r.nameAr,tone:'info' as const}))]}
            metrics={[{label:'الهوية الوطنية',value:m.nationalId||'—',tone:'neutral'},{label:'القسم السريري',value:m.department?.nameAr || trainer?.department?.nameAr || 'غير معين',tone:'neutral'}]}
            actions={[...(canEdit?[{label:'تعديل',icon:Edit,tone:'warning' as const,onClick:()=>setEditMember(m)}]:[]),...(canManagePermissions?[{label:'إدارة الصلاحيات',icon:KeyRound,tone:'primary' as const,onClick:()=>setPermissionsMember(m)}]:[]),...(canManageActive?[{label:m.isActive?'تعطيل':'تفعيل',icon:m.isActive?ShieldAlert:CheckCircle2,tone:(m.isActive?'danger':'success') as any,onClick:()=>m.isActive?deactivate(m.id):activate(m.id)}]:[])]}
          />;
        })}
      </div>
      : <TableCard><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr style={{background:colour.subtle}}>{['الاسم','البريد','الدور','القسم السريري','الحالة','الإجراءات'].map(h=><th key={h} style={{padding:'12px 16px',textAlign:'right',fontSize:font.caption,color:colour.muted}}>{h}</th>)}</tr></thead><tbody>{filtered.map(m=>{const trainer=m.roles.some(r=>r.code==='trainer')?trainers.find(t=>t.person?.nationalId===m.nationalId):null;return <tr key={m.id} style={{borderBottom:`1px solid ${colour.border}`}}><td style={{padding:'12px 16px',fontWeight:700}}>{m.nameAr||'—'}</td><td style={{padding:'12px 16px',color:colour.muted}}>{m.email}</td><td style={{padding:'12px 16px'}}>{m.roles.map(r=><Chip key={r.id} size="small" label={ROLE_LABELS[r.code]||r.nameAr} />)}</td><td style={{padding:'12px 16px',color:m.department||trainer?.department?colour.text:colour.muted}}>{m.department?.nameAr||trainer?.department?.nameAr||'غير معين'}</td><td style={{padding:'12px 16px'}}><Badge label={m.isActive?'نشط':'معطل'} tone={m.isActive?'success':'danger'}/></td><td style={{padding:'12px 16px'}}><div style={{display:'flex',gap:8}}>{canEdit&&<Button size="small" variant="outlined" onClick={()=>setEditMember(m)}>تعديل</Button>}{canManagePermissions&&<Button size="small" variant="outlined" onClick={()=>setPermissionsMember(m)}>الصلاحيات</Button>}{canManageActive&&<Button size="small" variant="outlined" onClick={()=>m.isActive?deactivate(m.id):activate(m.id)}>{m.isActive?'تعطيل':'تفعيل'}</Button>}</div></td></tr>})}</tbody></table></TableCard>}

    {showAdd && <AddMemberModal roles={roles} departments={departments} onClose={()=>setShowAdd(false)} onSuccess={async()=>{setShowAdd(false);setSuccess('تم إضافة العضو بنجاح');await load();}}/>}
    {editMember && <EditMemberModal member={editMember} roles={roles} departments={departments} trainer={trainers.find(t=>t.person?.nationalId===editMember.nationalId) || null} onClose={()=>setEditMember(null)} onSuccess={async()=>{setEditMember(null);setSuccess('تم تعديل بيانات العضو بنجاح');await load();}}/>}
    {permissionsMember && <MemberPermissionsModal member={permissionsMember} onClose={()=>setPermissionsMember(null)}/>} 
  </DataPageShell>;
};

const modalStyle: React.CSSProperties = { position:'fixed', inset:0, background:'rgba(15,23,42,.5)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1300, padding:20 };
const panelStyle: React.CSSProperties = { background:'#fff', borderRadius:18, width:'min(560px,100%)', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 24px 60px rgba(15,23,42,.22)' };
const inputStyle: React.CSSProperties = { width:'100%', padding:'10px 14px', border:'1px solid #E2E8F0', background:'#F8FAFC', borderRadius:10, boxSizing:'border-box', fontFamily:'inherit', outline:'none' };

const AddMemberModal: React.FC<{ roles:RoleDef[]; departments:DeptDef[]; onClose:()=>void; onSuccess:()=>void }> = ({roles,departments,onClose,onSuccess}) => {
  const [form,setForm]=useState({nameAr:'',nationalId:'',email:'',phone:'',roleCode:'trainer',departmentId:'',password:''});
  const [error,setError]=useState(''); const [saving,setSaving]=useState(false);
  const submit=async(e:React.FormEvent)=>{e.preventDefault();setSaving(true);setError('');try{if(!form.nameAr||!form.nationalId||!form.email)throw new Error('الاسم والهوية والبريد الإلكتروني حقول مطلوبة');if(form.roleCode==='trainer'&&form.password.trim().length<8)throw new Error('كلمة مرور المدرب يجب أن تكون 8 أحرف على الأقل');await apiClient.post('/org-members',{...form,departmentId:form.departmentId||undefined,password:form.roleCode==='trainer'?form.password:undefined});onSuccess();}catch(err:any){setError(err.response?.data?.message||err.message||'فشل إضافة العضو');}finally{setSaving(false);}};
  return <div style={modalStyle}><div style={panelStyle}><div style={{padding:'22px 26px',borderBottom:'1px solid #E2E8F0',display:'flex',justifyContent:'space-between'}}><h2 style={{margin:0,fontSize:19}}>إضافة عضو جديد للجهة</h2><button onClick={onClose} style={{border:0,background:'none',fontSize:22,cursor:'pointer'}}>✕</button></div><form onSubmit={submit} style={{padding:26,display:'grid',gap:15}}>
    <input style={inputStyle} placeholder="الاسم بالعربية *" value={form.nameAr} onChange={e=>setForm({...form,nameAr:e.target.value})}/><input style={inputStyle} placeholder="رقم الهوية *" value={form.nationalId} onChange={e=>setForm({...form,nationalId:e.target.value})}/><input style={inputStyle} type="email" placeholder="البريد الإلكتروني *" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/><input style={inputStyle} placeholder="رقم الجوال" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/>
    <select style={inputStyle} value={form.roleCode} onChange={e=>setForm({...form,roleCode:e.target.value})}>{roles.filter(r=>r.code!=='trainee').map(r=><option key={r.id} value={r.code}>{r.nameAr}</option>)}</select>
    {form.roleCode==='trainer'&&<><select style={inputStyle} value={form.departmentId} onChange={e=>setForm({...form,departmentId:e.target.value})}><option value="">القسم السريري — غير معين</option>{departments.map(d=><option key={d.id} value={d.id}>{d.nameAr}</option>)}</select><input style={inputStyle} type="password" autoComplete="new-password" placeholder="كلمة المرور الابتدائية للمدرب *" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></>}
    {error&&<div style={{padding:12,borderRadius:10,background:'#FEE2E2',color:'#B91C1C',fontWeight:700,fontSize:13}}>{error}</div>}<div style={{display:'flex',gap:10}}><Button onClick={onClose} variant="outlined" fullWidth>إلغاء</Button><Button type="submit" variant="contained" disabled={saving} fullWidth sx={{background:colour.primary,fontWeight:800}}>{saving?'جاري الحفظ...':'إضافة العضو'}</Button></div>
  </form></div></div>;
};

const EditMemberModal: React.FC<{ member:OrgMember; roles:RoleDef[]; departments:DeptDef[]; trainer:TrainerDef|null; onClose:()=>void; onSuccess:()=>void }> = ({member,roles,departments,trainer,onClose,onSuccess}) => {
  const initialRole=member.roles[0]?.code||'';
  const [nameAr,setNameAr]=useState(member.nameAr||''); const [phone,setPhone]=useState(member.phone||''); const [roleCode,setRoleCode]=useState(initialRole); const [departmentId,setDepartmentId]=useState(member.departmentId||trainer?.departmentId||trainer?.department?.id||''); const [password,setPassword]=useState(''); const [saving,setSaving]=useState(false); const [error,setError]=useState('');
  const submit=async(e:React.FormEvent)=>{e.preventDefault();setSaving(true);setError('');try{
    const roleChanged=roleCode!==initialRole;
    const promoteToTrainer=roleCode==='trainer'&&initialRole!=='trainer';
    const payload:any={nameAr,phone};
    // Do not resend an unchanged trainer role. This avoids the legacy/new role-model
    // mismatch where a trainer with an OrganizationAssignment role but no UserRole
    // row was incorrectly treated as a promotion and rejected for a new password.
    if(roleChanged) payload.roleCode=roleCode;
    if(promoteToTrainer){if(password.trim().length<8)throw new Error('كلمة المرور مطلوبة عند ترقية العضو إلى مدرب (8 أحرف على الأقل)');payload.password=password;}
    await apiClient.patch(`/org-members/${member.id}`,payload);
    if(roleCode==='trainer' && trainer?.id){
      await apiClient.patch(`/trainers/${trainer.id}`,{departmentId:departmentId||undefined});
    }
    onSuccess();
  }catch(err:any){setError(err.response?.data?.message||err.message||'فشل تعديل البيانات');}finally{setSaving(false);}};
  return <div style={modalStyle}><div style={panelStyle}><div style={{padding:'22px 26px',borderBottom:'1px solid #E2E8F0',display:'flex',justifyContent:'space-between'}}><h2 style={{margin:0,fontSize:19}}>تعديل بيانات العضو</h2><button onClick={onClose} style={{border:0,background:'none',fontSize:22,cursor:'pointer'}}>✕</button></div><form onSubmit={submit} style={{padding:26,display:'grid',gap:15}}>
    <label style={{fontSize:12,color:'#64748B'}}>البريد الإلكتروني<input style={{...inputStyle,marginTop:5,opacity:.7}} value={member.email} disabled/></label>
    <label style={{fontSize:12,color:'#0F766E'}}>الاسم بالعربية<input style={{...inputStyle,marginTop:5}} value={nameAr} onChange={e=>setNameAr(e.target.value)} required/></label>
    <label style={{fontSize:12,color:'#64748B'}}>رقم الجوال<input style={{...inputStyle,marginTop:5}} value={phone} onChange={e=>setPhone(e.target.value)}/></label>
    <label style={{fontSize:12,color:'#7E22CE'}}>الدور في الجهة<select style={{...inputStyle,marginTop:5}} value={roleCode} onChange={e=>setRoleCode(e.target.value)}>{roles.filter(r=>r.code!=='trainee').map(r=><option key={r.id} value={r.code}>{r.nameAr}</option>)}</select></label>
    {roleCode==='trainer'&&<>
      <label style={{fontSize:12,color:'#0F766E'}}>القسم السريري<select style={{...inputStyle,marginTop:5}} value={departmentId} onChange={e=>setDepartmentId(e.target.value)}><option value="">غير معين</option>{departments.map(d=><option key={d.id} value={d.id}>{d.nameAr}</option>)}</select></label>
      {initialRole!=='trainer'&&<label style={{fontSize:12,color:'#7E22CE'}}>كلمة المرور الابتدائية<input style={{...inputStyle,marginTop:5}} type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="8 أحرف على الأقل"/></label>}
    </>}
    {error&&<Alert severity="error">{error}</Alert>}<div style={{display:'flex',gap:10}}><Button onClick={onClose} variant="outlined" fullWidth>إلغاء</Button><Button type="submit" variant="contained" disabled={saving} fullWidth sx={{background:colour.primary,fontWeight:800}}>{saving?'جاري الحفظ...':'حفظ التعديلات'}</Button></div>
  </form></div></div>;
};

interface PermissionRow { code:string; nameAr:string; module:string; inherited:boolean; granted:boolean; denied:boolean; effective:boolean; source:'role'|'user_grant'|'user_deny'|'none'; }
const MemberPermissionsModal: React.FC<{member:OrgMember;onClose:()=>void}> = ({member,onClose}) => {
  const [rows,setRows]=useState<PermissionRow[]>([]); const [error,setError]=useState(''); const [saving,setSaving]=useState(''); const [effectiveOnly,setEffectiveOnly]=useState(false);
  const load=async()=>{try{const r=await apiClient.get(`/org-members/${member.id}/permissions`);setRows(r.data?.data?.permissions||[]);}catch(e:any){setError(e.response?.data?.message||'تعذر تحميل الصلاحيات');}};
  useEffect(()=>{load();},[member.id]);
  const setMode=async(code:string,mode:'grant'|'deny'|'inherit')=>{setSaving(code);try{await apiClient.patch(`/org-members/${member.id}/permissions`,{permissionCode:code,mode});await load();}catch(e:any){setError(e.response?.data?.message||'تعذر حفظ الصلاحية');}finally{setSaving('');}};
  return <div style={modalStyle}><div style={{...panelStyle,width:'min(920px,100%)'}}><div style={{padding:'20px 24px',borderBottom:'1px solid #E2E8F0',display:'flex',justifyContent:'space-between'}}><div><h2 style={{margin:0,fontSize:18}}>إدارة صلاحيات — {member.nameAr||member.email}</h2><div style={{marginTop:6,color:'#64748B',fontSize:12}}>{member.email}</div></div><button onClick={onClose} style={{border:0,background:'none',fontSize:22,cursor:'pointer'}}>✕</button></div><div style={{padding:24,maxHeight:'72vh',overflowY:'auto'}}>{error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}<label style={{display:'flex',gap:8,alignItems:'center',fontSize:12,color:'#64748B',marginBottom:15}}><input type="checkbox" checked={effectiveOnly} onChange={e=>setEffectiveOnly(e.target.checked)}/> عرض الصلاحيات الفعلية فقط</label>{rows.filter(p=>effectiveOnly?p.effective:true).map(p=><div key={p.code} style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',padding:'10px 0',borderBottom:'1px solid #E2E8F0'}}><div><div style={{fontWeight:700}}>{p.nameAr}</div><div style={{fontSize:11,color:'#64748B',fontFamily:'monospace'}}>{p.code}</div></div><div style={{display:'flex',gap:8,alignItems:'center'}}><Badge label={p.source==='role'?'موروثة من الدور':p.source==='user_grant'?'منح خاص':p.source==='user_deny'?'مسحوبة':'غير ممنوحة'} tone={p.source==='role'?'success':p.source==='user_grant'?'info':p.source==='user_deny'?'danger':'neutral'}/>{p.denied?<Button size="small" disabled={saving===p.code} onClick={()=>setMode(p.code,'inherit')}>استعادة</Button>:p.inherited?<Button size="small" disabled={saving===p.code} onClick={()=>setMode(p.code,'deny')}>سحب</Button>:p.granted?<Button size="small" disabled={saving===p.code} onClick={()=>setMode(p.code,'inherit')}>إلغاء المنح</Button>:<Button size="small" disabled={saving===p.code} onClick={()=>setMode(p.code,'grant')}>منح</Button>}</div></div>)}</div><div style={{padding:'14px 24px',borderTop:'1px solid #E2E8F0',textAlign:'left'}}><Button onClick={onClose}>إغلاق</Button></div></div></div>;
};

export default OrgMembersFixed;
