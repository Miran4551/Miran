import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BookOpen, ClipboardCheck, GraduationCap, Users, FolderGit2, Zap } from 'lucide-react';
import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Badge, EmptyState, KpiCard, KpiGrid, ListRow, Panel, PanelGrid, PanelLink, PanelSkeleton, PageHeader, QuickActions, SplitGrid, StatBar, space } from '../../components/ui';

export const AcademicDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const organizationId = user?.activeOrganization?.id;

  const { data: timeline, isLoading } = useQuery({
    queryKey: ['ac-timeline', organizationId],
    queryFn: async () => {
      const res = await apiClient.get('/timeline/dashboard', {
        params: { scope: 'university', organizationId, limit: 200 },
      }).catch(() => ({ data: { data: null } }));
      return res.data?.data ?? null;
    },
    enabled: !!organizationId,
  });

  const { data: intakes, isLoading: intakesLoading } = useQuery({
    queryKey: ['ac-academic-intakes', organizationId],
    queryFn: async () => {
      const res = await apiClient.get('/academic-intakes');
      return Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
    },
    enabled: !!organizationId,
  });

  const { data: pendingLogsData, isLoading: logsLoading } = useQuery({
    queryKey: ['ac-pending-logbook-cases', organizationId],
    queryFn: async () => {
      const res = await apiClient.get('/logbook/cases').catch(() => ({ data: { data: [] } }));
      return res.data?.data ?? [];
    },
    enabled: !!organizationId,
  });

  const pendingLogsList: any[] = (pendingLogsData ?? []).filter((l: any) => ['submitted', 'pending', 'pending_review', 'awaiting_approval'].includes(l.status ?? 'submitted'));
  const batchList: any[] = intakes ?? [];
  const batchTrainees = batchList.reduce((sum, batch) => sum + Number(batch.requestedCount ?? batch._count?.traineeProfiles ?? 0), 0);
  const totalTrainees = timeline?.traineeCount ?? batchTrainees;
  const readyGrad = timeline?.readyForGraduation ?? 0;
  const atRiskCount = (timeline?.atRisk ?? 0) + (timeline?.offTrack ?? 0);

  const traineesNeedingFollowup = (timeline?.trainees ?? [])
    .filter((t: any) => ['at_risk', 'off_track'].includes(t.readiness?.expectedGraduationStatus))
    .slice(0, 7);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space['2xl'], width: '100%' }}>
      <PageHeader eyebrow="الإشراف الأكاديمي والتقييم السريري" icon={GraduationCap} title="لوحة تحكم المشرف الأكاديمي" subtitle={`${user?.nameAr ?? ''} — متابعة أطباء الامتياز، اعتماد النتائج والسجلات الأكاديمية`} />
      <KpiGrid>
        <KpiCard label="متدربون بحاجة لمتابعة" value={atRiskCount} icon={AlertTriangle} tone={atRiskCount > 0 ? 'danger' : 'success'} loading={isLoading} />
        <KpiCard label="الدفعات الأكاديمية" value={batchList.length} icon={FolderGit2} tone="info" loading={intakesLoading} onClick={() => navigate('/intakes')} />
        <KpiCard label="سجلات تحتاج مراجعة" value={pendingLogsList.length} icon={BookOpen} tone="warning" loading={logsLoading} onClick={() => navigate('/logbook')} />
        <KpiCard label="مستوفو شروط التخرج" value={readyGrad} icon={GraduationCap} tone="success" loading={isLoading} />
        <KpiCard label="إجمالي الطلاب المتابعين" value={totalTrainees} icon={Users} tone="primary" loading={isLoading && !batchTrainees} />
      </KpiGrid>
      {atRiskCount > 0 && (
        <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '14px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><div style={{ padding: '8px', borderRadius: '10px', backgroundColor: '#FEE2E2', color: '#DC2626' }}><AlertTriangle size={20} /></div><div><div style={{ fontSize: '14px', fontWeight: 800, color: '#991B1B' }}>متابعة أكاديمية عاجلة: يوجد {atRiskCount} طبيب امتياز يواجه مخاطر تأخير في التخرج</div><div style={{ fontSize: '12px', color: '#B91C1C', marginTop: '2px' }}>يرجى متابعة المستشفى والمدرب لتصحيح المسار الأكاديمي.</div></div></div>
          <button onClick={() => navigate('/corrections')} style={{ padding: '8px 16px', borderRadius: '8px', backgroundColor: '#DC2626', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '12px' }}>التدخل الأكاديمي</button>
        </div>
      )}
      <SplitGrid>
        <Panel title="أطباء الامتياز المتأخرون وبحاجة لمتابعة" icon={AlertTriangle} tone={traineesNeedingFollowup.length ? 'danger' : 'success'} action={<PanelLink label="التقرير الأكاديمي" onClick={() => navigate('/reports')} />}>
          {isLoading ? <PanelSkeleton rows={5} /> : traineesNeedingFollowup.length === 0 ? <EmptyState icon={GraduationCap} title="جميع المتدربين في المسار الأكاديمي المعتمد" hint="لا يوجد طلاب يواجهون مخاطر تأخير تخرج." /> : traineesNeedingFollowup.map((t: any) => <ListRow key={t.trainee?.id || t.id} title={t.trainee?.nameAr || 'طبيب امتياز'} meta={`الجامعة: ${t.trainee?.sponsorOrganization?.nameAr || '—'} · نسبة الإنجاز: ${t.completionPercentage || 0}% · المستشفى: ${t.current?.hospitalNameAr || '—'}`} trailing={<Badge label={t.readiness?.expectedGraduationStatus === 'off_track' ? 'خارج المسار' : 'متأخر'} tone="danger" />} />)}
        </Panel>
        <Panel title="الدفعات الأكاديمية" icon={FolderGit2} tone="info">
          {intakesLoading ? <PanelSkeleton rows={4} /> : batchList.length === 0 ? <EmptyState icon={FolderGit2} title="لا توجد دفعات أكاديمية" hint="يمكنك مراجعة الدفعات الأكاديمية من القائمة." /> : batchList.slice(0, 6).map((batch: any) => <ListRow key={batch.id} title={batch.nameAr || batch.titleAr || `دفعة ${batch.code || batch.id}`} meta={`السنة الأكاديمية: ${batch.academicYear || '—'} · عدد الطلاب: ${batch.requestedCount ?? batch._count?.traineeProfiles ?? 0}`} trailing={<Badge label={['approved', 'active', 'ongoing'].includes(batch.status) ? 'معتمد' : 'قيد المتابعة'} tone={['approved', 'active', 'ongoing'].includes(batch.status) ? 'success' : 'warning'} />} onClick={() => navigate('/intakes')} />)}
        </Panel>
      </SplitGrid>
      <Panel title="الإجراءات السريعة للمشرف الأكاديمي" icon={Zap} tone="primary"><QuickActions items={[{ label: 'اعتماد Logbook والتقييمات', icon: BookOpen, onClick: () => navigate('/logbook'), tone: 'primary', hint: 'مراجعة السجلات والمهارات الأكاديمية' }, { label: 'الدفعات الأكاديمية', icon: FolderGit2, onClick: () => navigate('/intakes'), tone: 'info', hint: 'متابعة الدفعات التدريبية' }, { label: 'معالجة التظلمات والتصحيحات', icon: AlertTriangle, onClick: () => navigate('/corrections'), tone: 'warning', hint: 'متابعة الملفات المعادة' }, { label: 'تقارير الجاهزية للتخرج', icon: GraduationCap, onClick: () => navigate('/reports'), tone: 'violet', hint: 'تحليل الأداء الأكاديمي' }]} /></Panel>
      <PanelGrid>
        <Panel title="السجلات والتقييمات الأكاديمية" icon={BookOpen} action={<PanelLink label="جميع السجلات" onClick={() => navigate('/logbook')} />}>
          {logsLoading ? <PanelSkeleton rows={4} /> : pendingLogsList.length === 0 ? <EmptyState icon={BookOpen} title="لا توجد سجلات تحتاج مراجعة" hint="لا توجد حالات سريرية بانتظار الإجراء الأكاديمي حالياً." /> : pendingLogsList.slice(0, 5).map((l: any) => <ListRow key={l.id} title={l.diagnosis || 'حالة سريرية'} meta={`المتدرب: ${l.traineeProfile?.person?.nameAr || l.trainee?.nameAr || '—'} · التاريخ: ${String(l.createdAt || '').slice(0, 10)}`} trailing={<Badge label="مراجعة مطلوبة" tone="warning" />} onClick={() => navigate('/logbook')} />)}
        </Panel>
        <Panel title="مؤشرات إنجاز الدفعات الأكاديمية" icon={ClipboardCheck} tone="success">{timeline ? <><StatBar label="متوسط الإنجاز الأكاديمي الكلي" value={timeline.averageCompletion} max={100} tone="primary" /><StatBar label="نسبة الجاهزية للتخرج الأكاديمي" value={timeline.averageGraduationProgress} max={100} tone="info" /></> : <EmptyState icon={ClipboardCheck} title="لا توجد بيانات زمنية كافية" />}</Panel>
      </PanelGrid>
    </div>
  );
};

export default AcademicDashboard;
