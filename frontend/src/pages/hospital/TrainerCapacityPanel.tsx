import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, CircularProgress, IconButton, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { Trash2, UserCog } from 'lucide-react';
import { apiClient } from '../../api/client';

type Props = {
  hospitalId: string;
  trainerRules: Array<{ id: string; scopeId: string; totalCapacity: number; trainingPeriod: string }>;
  supervisors: Array<{ allocation: { id: string; scopeId: string; totalCapacity: number }; occupancy: { occupied: number; capacity: number; available: number } }>;
  onDeleteAllocation: (id: string) => void;
};

export const TrainerCapacityPanel: React.FC<Props> = ({ hospitalId, trainerRules, supervisors, onDeleteAllocation }) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['hospital-trainer-capacity', hospitalId],
    enabled: Boolean(hospitalId),
    queryFn: async () => (await apiClient.get('/trainers/workspace-cards', { params: { organizationId: hospitalId } })).data?.data ?? [],
    staleTime: 20_000,
  });

  const trainers = data ?? [];
  const ruleByTrainer = new Map(trainerRules.map((r) => [r.scopeId, r]));

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <UserCog size={18} />
        <Typography variant="subtitle1" fontWeight={700}>الطاقة لكل مشرف / مدرب</Typography>
      </Box>

      {isLoading ? <Box sx={{ py: 3, textAlign: 'center' }}><CircularProgress size={24} /></Box> : isError ? (
        <Alert severity="error">تعذر تحميل إشغال المدربين الفعلي.</Alert>
      ) : (
        <TableContainer component={Paper} className="glass-card table-scroll miran-trainer-capacity-table" sx={{ width: '100%', overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>المشرف / المدرب</TableCell>
                <TableCell>القسم</TableCell>
                <TableCell>المشغول فعلياً</TableCell>
                <TableCell>السعة</TableCell>
                <TableCell>المتاح</TableCell>
                <TableCell>الإشغال</TableCell>
                <TableCell>قاعدة سعة</TableCell>
                <TableCell aria-label="إجراءات" />
              </TableRow>
            </TableHead>
            <TableBody>
              {trainers.map((trainer: any) => {
                const rule = ruleByTrainer.get(trainer.id);
                const capacity = rule?.totalCapacity ?? trainer.maxTrainees ?? 0;
                const occupied = trainer.occupied ?? 0;
                const available = Math.max(0, capacity - occupied);
                const pct = capacity > 0 ? Math.min(100, Math.round((occupied / capacity) * 100)) : 0;
                return (
                  <TableRow key={trainer.id} hover>
                    <TableCell><Typography fontWeight={700}>{trainer.nameAr}</Typography></TableCell>
                    <TableCell>{trainer.department?.nameAr ?? 'بدون قسم'}</TableCell>
                    <TableCell sx={{ color: '#0284C7', fontWeight: 800, textAlign: 'center' }}>{occupied}</TableCell>
                    <TableCell sx={{ fontWeight: 800, textAlign: 'center' }}>{capacity}</TableCell>
                    <TableCell sx={{ color: available > 0 ? '#059669' : '#DC2626', fontWeight: 800, textAlign: 'center' }}>{available}</TableCell>
                    <TableCell sx={{ fontWeight: 800, textAlign: 'center' }}>{pct}%</TableCell>
                    <TableCell>{rule ? (rule.trainingPeriod || 'عامة') : 'السعة العامة للمدرب'}</TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>
                      {rule && <IconButton size="small" color="error" title="حذف قاعدة السعة" onClick={() => onDeleteAllocation(rule.id)}><Trash2 size={15} /></IconButton>}
                    </TableCell>
                  </TableRow>
                );
              })}
              {trainers.length === 0 && <TableRow><TableCell colSpan={8}><Typography color="text.secondary" sx={{ py: 2 }}>لا يوجد مدربون في المستشفى.</Typography></TableCell></TableRow>}
              {supervisors.map(({ allocation, occupancy }) => (
                <TableRow key={`supervisor-${allocation.id}`} hover>
                  <TableCell><Typography fontWeight={700}>مشرف {allocation.scopeId}</Typography></TableCell>
                  <TableCell>—</TableCell>
                  <TableCell sx={{ color: '#0284C7', fontWeight: 800, textAlign: 'center' }}>{occupancy.occupied}</TableCell>
                  <TableCell sx={{ fontWeight: 800, textAlign: 'center' }}>{occupancy.capacity}</TableCell>
                  <TableCell sx={{ color: occupancy.available > 0 ? '#059669' : '#DC2626', fontWeight: 800, textAlign: 'center' }}>{occupancy.available}</TableCell>
                  <TableCell sx={{ fontWeight: 800, textAlign: 'center' }}>{occupancy.capacity > 0 ? Math.min(100, Math.round((occupancy.occupied / occupancy.capacity) * 100)) : 0}%</TableCell>
                  <TableCell>قاعدة مشرف</TableCell>
                  <TableCell sx={{ textAlign: 'center' }}><IconButton size="small" color="error" title="حذف قاعدة السعة" onClick={() => onDeleteAllocation(allocation.id)}><Trash2 size={15} /></IconButton></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default TrainerCapacityPanel;
