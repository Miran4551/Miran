import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit, Trash2, RefreshCw, AlertTriangle, Eye } from 'lucide-react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { apiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const EDITABLE_STATUSES = new Set([
  'draft',
  'submitted',
  'resubmitted',
  'under_cluster_review',
  'returned_to_university',
]);

const statusLabel: Record<string, string> = {
  draft: 'مسودة',
  submitted: 'وارد من الجامعة',
  resubmitted: 'معاد الإرسال',
  under_cluster_review: 'بانتظار التوزيع',
  returned_to_university: 'معاد للجامعة',
};

const statusColor: Record<string, 'default' | 'info' | 'warning'> = {
  draft: 'default',
  submitted: 'info',
  resubmitted: 'info',
  under_cluster_review: 'warning',
  returned_to_university: 'warning',
};

const dateValue = (value?: string | null) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

export const InactiveTrainingRequestsPanel: React.FC = () => {
  const { hasAnyRole } = useAuth();
  const queryClient = useQueryClient();
  const [editRequest, setEditRequest] = useState<any | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<any | null>(null);
  const [form, setForm] = useState({
    specialty: '',
    trainingStartDate: '',
    trainingEndDate: '',
    expectedGraduationDate: '',
    priority: 'normal',
    notes: '',
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const canManage = hasAnyRole([
    'university_administrator',
    'academic_affairs',
    'cluster_administrator',
    'training_director',
    'platform_owner',
    'system_admin',
  ]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['inactive-training-requests-panel'],
    queryFn: async () => {
      const res = await apiClient.get('/training-requests', { params: { limit: 100 } });
      const rows = res.data?.data ?? res.data ?? [];
      return Array.isArray(rows) ? rows : [];
    },
    enabled: canManage && window.location.pathname === '/affiliations',
  });

  const inactiveRequests = useMemo(
    () => (data ?? []).filter((r: any) => EDITABLE_STATUSES.has(r.status)),
    [data],
  );

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editRequest) return;
      const res = await apiClient.patch(`/training-requests/${editRequest.id}/manage`, {
        specialty: form.specialty,
        trainingStartDate: form.trainingStartDate || undefined,
        trainingEndDate: form.trainingEndDate || undefined,
        expectedGraduationDate: form.expectedGraduationDate || undefined,
        priority: form.priority,
        notes: form.notes,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inactive-training-requests-panel'] });
      queryClient.invalidateQueries({ queryKey: ['training-requests'] });
      queryClient.invalidateQueries({ queryKey: ['un-requests'] });
      queryClient.invalidateQueries({ queryKey: ['ac-requests'] });
      setEditRequest(null);
      setActionError(null);
      setActionSuccess('تم تعديل طلب التدريب بنجاح.');
    },
    onError: (err: any) => {
      setActionError(err?.response?.data?.message || err?.message || 'تعذر تعديل طلب التدريب');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!deleteRequest) return;
      const res = await apiClient.delete(`/training-requests/${deleteRequest.id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inactive-training-requests-panel'] });
      queryClient.invalidateQueries({ queryKey: ['training-requests'] });
      queryClient.invalidateQueries({ queryKey: ['un-requests'] });
      queryClient.invalidateQueries({ queryKey: ['ac-requests'] });
      setDeleteRequest(null);
      setActionError(null);
      setActionSuccess('تم حذف طلب التدريب غير المفعل وسجلاته المؤقتة.');
    },
    onError: (err: any) => {
      setActionError(err?.response?.data?.message || err?.message || 'تعذر حذف طلب التدريب');
    },
  });

  if (!canManage || window.location.pathname !== '/affiliations') return null;

  const openEdit = (req: any) => {
    setActionError(null);
    setActionSuccess(null);
    setEditRequest(req);
    setForm({
      specialty: req.specialty || '',
      trainingStartDate: dateValue(req.trainingStartDate),
      trainingEndDate: dateValue(req.trainingEndDate),
      expectedGraduationDate: dateValue(req.expectedGraduationDate),
      priority: req.priority || 'normal',
      notes: req.notes || '',
    });
  };

  return (
    <Paper
      className="glass-card"
      sx={{
        p: 2,
        border: inactiveRequests.length ? '1px solid #F59E0B' : '1px solid #D1FAE5',
        background: inactiveRequests.length ? '#FFFBEB' : '#F0FDF4',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
        <Box>
          <Typography sx={{ fontWeight: 900, color: '#0F172A' }}>
            إدارة طلبات التدريب غير المفعلة
          </Typography>
          <Typography variant="caption" sx={{ color: '#64748B' }}>
            هذه المنطقة تظهر الطلبات التي لم تتحول إلى تدريب نشط، حتى لو لم تظهر في تبويب الطلبات الحالي.
          </Typography>
        </Box>
        <Tooltip title="تحديث الطلبات غير المفعلة">
          <IconButton onClick={() => refetch()} disabled={isLoading}>
            {isLoading ? <CircularProgress size={18} /> : <RefreshCw size={18} />}
          </IconButton>
        </Tooltip>
      </Box>

      {actionSuccess && <Alert severity="success" onClose={() => setActionSuccess(null)} sx={{ mb: 1.5 }}>{actionSuccess}</Alert>}
      {actionError && <Alert severity="error" onClose={() => setActionError(null)} sx={{ mb: 1.5 }}>{actionError}</Alert>}

      {isError ? (
        <Alert severity="error">تعذر تحميل الطلبات غير المفعلة. اضغط تحديث لإعادة المحاولة.</Alert>
      ) : isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={24} /></Box>
      ) : inactiveRequests.length === 0 ? (
        <Alert severity="success" icon={<Eye size={18} />}>
          لا توجد حالياً طلبات تدريب غير مفعلة تحتاج إلى تعديل أو حذف.
        </Alert>
      ) : (
        <TableContainer sx={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: 1.5, background: '#fff' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 800 }}>رقم الطلب</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>الجهة</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>البرنامج / التخصص</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>المتدربون</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>الحالة</TableCell>
                <TableCell sx={{ fontWeight: 800, textAlign: 'center' }}>الإجراءات</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {inactiveRequests.map((req: any) => (
                <TableRow key={req.id} hover>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 800, color: '#0369A1' }}>{req.requestNumber}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{req.sourceOrg?.nameAr || '—'}</TableCell>
                  <TableCell>
                    <div style={{ fontWeight: 700 }}>{req.program?.nameAr || '—'}</div>
                    <div style={{ fontSize: 11, color: '#64748B' }}>{req.specialty || 'غير محدد'}</div>
                  </TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>{req.studentCount ?? 0}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={statusLabel[req.status] || req.status}
                      color={statusColor[req.status] || 'default'}
                      sx={{ fontWeight: 800 }}
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<Edit size={14} />}
                        onClick={() => openEdit(req)}
                        sx={{ fontWeight: 800, color: '#0F766E', borderColor: '#0F766E' }}
                      >
                        تعديل
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        startIcon={<Trash2 size={14} />}
                        onClick={() => { setActionError(null); setActionSuccess(null); setDeleteRequest(req); }}
                        sx={{ fontWeight: 800 }}
                      >
                        حذف
                      </Button>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={!!editRequest} onClose={() => setEditRequest(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 900 }}>تعديل طلب التدريب {editRequest?.requestNumber}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <Alert severity="info">
            التعديل هنا مخصص للطلب غير المفعل. لن نغيّر التوزيعات أو ملفات المتدربين أو حالة الطلب من هذه النافذة.
          </Alert>
          <TextField label="التخصص" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} fullWidth />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField label="بداية التدريب" type="date" value={form.trainingStartDate} onChange={(e) => setForm({ ...form, trainingStartDate: e.target.value })} InputLabelProps={{ shrink: true }} fullWidth />
            <TextField label="نهاية التدريب" type="date" value={form.trainingEndDate} onChange={(e) => setForm({ ...form, trainingEndDate: e.target.value })} InputLabelProps={{ shrink: true }} fullWidth />
          </Box>
          <TextField label="التخرج المتوقع" type="date" value={form.expectedGraduationDate} onChange={(e) => setForm({ ...form, expectedGraduationDate: e.target.value })} InputLabelProps={{ shrink: true }} fullWidth />
          <TextField label="الأولوية" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} helperText="normal / high / urgent" fullWidth />
          <TextField label="الملاحظات" multiline rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} fullWidth />
          {editMutation.isError && <Alert severity="error">{(editMutation.error as any)?.response?.data?.message || 'تعذر حفظ التعديل'}</Alert>}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setEditRequest(null)}>إلغاء</Button>
          <Button variant="contained" onClick={() => editMutation.mutate()} disabled={editMutation.isPending} sx={{ bgcolor: '#0F766E', fontWeight: 800 }}>
            {editMutation.isPending ? <CircularProgress size={20} color="inherit" /> : 'حفظ التعديل'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteRequest} onClose={() => setDeleteRequest(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 900, color: '#991B1B' }}>حذف طلب التدريب</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <Alert severity="warning" icon={<AlertTriangle size={20} />}>
            سيتم حذف الطلب <strong>{deleteRequest?.requestNumber}</strong> وسجلات المتدربين المؤقتة والمستندات المرتبطة بها. لا يمكن التراجع عن هذا الإجراء.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeleteRequest(null)}>إلغاء</Button>
          <Button variant="contained" color="error" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending} sx={{ fontWeight: 800 }}>
            {deleteMutation.isPending ? <CircularProgress size={20} color="inherit" /> : 'تأكيد الحذف'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};
