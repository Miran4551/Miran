import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { notificationTarget } from '../utils/notificationTarget';
import { Bell, CheckCheck } from 'lucide-react';
import { Badge, IconButton, Popover, Button, CircularProgress, Tooltip } from '@mui/material';

export const NotificationCenter: React.FC = () => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isAuthenticated, hasAnyRole } = useAuth();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  const { data: unreadData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => (await apiClient.get('/notifications/my-unread-count')).data?.data ?? { count: 0 },
    enabled: isAuthenticated,
    refetchInterval: (q) => (q.state.status === 'error' || !isAuthenticated ? false : 5000),
  });

  const { data: listData, isLoading, error, refetch } = useQuery({
    queryKey: ['notifications-list'],
    queryFn: async () => (await apiClient.get('/notifications/my-feed')).data?.data ?? [],
    enabled: open && isAuthenticated,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const isUniversity = hasAnyRole(['university_administrator', 'academic_affairs']);
  const isCluster = hasAnyRole(['cluster_manager', 'cluster_administrator', 'training_director']);
  const isHospital = hasAnyRole(['hospital_training_admin']);
  const unreadCount = unreadData?.count ?? 0;
  const notifications = listData ?? [];

  const markRead = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/notifications/${id}/read`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications-unread-count'] }); qc.invalidateQueries({ queryKey: ['notifications-list'] }); },
  });
  const markAll = useMutation({
    mutationFn: () => apiClient.patch('/notifications/read-all'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications-unread-count'] }); qc.invalidateQueries({ queryKey: ['notifications-list'] }); },
  });

  const age = (value: string) => {
    const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
    if (minutes < 1) return 'الآن';
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    return `منذ ${Math.floor(hours / 24)} يوم`;
  };
  const color = (type: string) => ({ trainee_assignment_request: '#0F766E', trainee_assignment_accepted: '#16A34A', trainee_assignment_rejected: '#DC2626', training_event: '#0891B2', logbook_approval_required: '#D97706', logbook_approved: '#16A34A', logbook_rejected: '#DC2626', call_alert: '#DC2626' } as Record<string, string>)[type] ?? '#64748B';

  return <>
    <Tooltip title="الإشعارات"><IconButton onClick={(e) => setAnchorEl(e.currentTarget)}><Badge badgeContent={unreadCount} color="error" max={99}><Bell size={20}/></Badge></IconButton></Tooltip>
    <Popover open={open} anchorEl={anchorEl} onClose={() => setAnchorEl(null)} disableRestoreFocus anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} transformOrigin={{ vertical: 'top', horizontal: 'left' }} PaperProps={{ style: { width: 380, maxHeight: 500, borderRadius: 16 } }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>الإشعارات {unreadCount > 0 ? `(${unreadCount} جديد)` : ''}</strong>
        {unreadCount > 0 && <Button size="small" startIcon={<CheckCheck size={14}/>} onClick={() => markAll.mutate()}>قراءة الكل</Button>}
      </div>
      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        {isLoading ? <div style={{ padding: 32, textAlign: 'center' }}><CircularProgress size={24}/></div> : error ? <div style={{ padding: 32, textAlign: 'center' }}>تعذر تحميل الإشعارات <Button onClick={() => refetch()}>إعادة المحاولة</Button></div> : notifications.length === 0 ? <div style={{ padding: 32, textAlign: 'center', color: '#64748B' }}>لا توجد إشعارات حالياً</div> : notifications.map((n: any) => {
          const target = notificationTarget(n, isUniversity, isCluster, isHospital);
          return <div key={n.id} onClick={() => { if (!n.isRead) markRead.mutate(n.id); if (target) { setAnchorEl(null); navigate(target); } }} style={{ padding: 12, borderBottom: '1px solid #F8FAFC', cursor: target ? 'pointer' : 'default', background: n.isRead ? '#fff' : '#F0FDF4' }}>
            <div style={{ display: 'flex', gap: 10 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: n.isRead ? 'transparent' : color(n.type), marginTop: 6 }}/><div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: 13 }}>{n.titleAr}</div>{n.bodyAr && <div style={{ color: '#475569', fontSize: 12, marginTop: 3 }}>{n.bodyAr}</div>}<div style={{ color: '#94A3B8', fontSize: 10, marginTop: 4 }}>{age(n.createdAt)}</div></div></div>
          </div>;
        })}
      </div>
    </Popover>
  </>;
};
