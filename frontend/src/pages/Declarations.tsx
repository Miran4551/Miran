import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DataPageShell } from '../components/ui';
import { apiClient } from '../api/client';
import { FileSignature, CheckCircle2, Clock3, ShieldCheck, FileText, ChevronDown } from 'lucide-react';
import {
  Alert, Box, Button, Chip, Collapse, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, LinearProgress, Paper, Typography,
} from '@mui/material';

export const Declarations: React.FC = () => {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const {
    data: pendingDeclarations,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['declarations-pending'],
    queryFn: async () => {
      const res = await apiClient.get('/declarations/pending');
      return Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async (declaration: any) => {
      return apiClient.post('/declarations/accept', {
        declarationId: declaration.id,
        version: Number(declaration.version),
        deviceInfo: typeof navigator !== 'undefined'
          ? `${navigator.platform} / ${navigator.userAgent}`
          : undefined,
      });
    },
    onSuccess: () => {
      setSelected(null);
      setErrorMessage('');
      queryClient.invalidateQueries({ queryKey: ['declarations-pending'] });
      queryClient.invalidateQueries({ queryKey: ['declarations'] });
      queryClient.invalidateQueries({ queryKey: ['declarations-statistics'] });
    },
    onError: (err: any) => {
      setErrorMessage(
        err?.response?.data?.message || 'تعذر تسجيل الموافقة والتوقيع. حاول مرة أخرى.',
      );
    },
  });

  const pending: any[] = pendingDeclarations ?? [];
  const mandatoryCount = pending.filter((d) => d.isMandatory).length;

  return (
    <DataPageShell
      title="الإقرارات والتعهدات"
      subtitle="راجع الإقرارات المطلوبة منك، وافق عليها، ثم وقّعها رقميًا لإكمال متطلبات التدريب."
      loading={isLoading}
      stats={[
        { label: 'الإقرارات المطلوبة', value: mandatoryCount, icon: FileSignature, tone: mandatoryCount ? 'warning' : 'success' },
        { label: 'بانتظار توقيعك', value: pending.length, icon: Clock3, tone: pending.length ? 'warning' : 'success' },
        { label: 'الحالة', value: pending.length ? 'يتطلب إجراء' : 'مكتمل', icon: CheckCircle2, tone: pending.length ? 'warning' : 'success' },
      ]}
    >
      {isLoading && <LinearProgress sx={{ mb: 2, borderRadius: 2 }} />}

      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          تعذر تحميل الإقرارات المطلوبة من الخادم.
          {error instanceof Error ? ` ${error.message}` : ''}
        </Alert>
      )}

      {!isLoading && !isError && pending.length === 0 && (
        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, md: 5 },
            textAlign: 'center',
            borderRadius: 4,
            border: '1px solid #CFE8E3',
            background: 'linear-gradient(135deg, #F0FDFA 0%, #F8FAFC 100%)',
          }}
        >
          <Box sx={{ width: 64, height: 64, mx: 'auto', mb: 1.5, display: 'grid', placeItems: 'center', borderRadius: '50%', bgcolor: '#D1FAE5', color: '#047857' }}>
            <CheckCircle2 size={34} />
          </Box>
          <Typography sx={{ fontSize: 20, fontWeight: 900, color: '#0F172A' }}>
            لا توجد إقرارات معلقة
          </Typography>
          <Typography sx={{ mt: .7, color: '#64748B', fontSize: 13 }}>
            تم إكمال جميع الإقرارات الإلزامية المتاحة لحسابك حاليًا.
          </Typography>
        </Paper>
      )}

      {!isLoading && !isError && pending.length > 0 && (
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          <Alert severity="info" icon={<ShieldCheck size={20} />} sx={{ borderRadius: 2.5 }}>
            هذه الإقرارات مرتبطة بحسابك التدريبي. اقرأ النص كاملًا قبل اختيار «أوافق وأوقّع».
          </Alert>

          {pending.map((declaration) => (
            <Paper
              key={declaration.id}
              elevation={0}
              sx={{
                overflow: 'hidden',
                borderRadius: 3,
                border: '1px solid #DDE7EE',
                background: '#FFF',
                boxShadow: '0 5px 18px rgba(15, 118, 110, .06)',
              }}
            >
              <Box sx={{ p: { xs: 1.75, md: 2.25 }, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                  <Box sx={{ flex: '0 0 auto', width: 44, height: 44, display: 'grid', placeItems: 'center', borderRadius: 2, bgcolor: '#ECFDF5', color: '#0F766E' }}>
                    <FileText size={22} />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 900, fontSize: 15, color: '#0F172A' }}>{declaration.titleAr}</Typography>
                    <Box sx={{ display: 'flex', gap: .7, mt: .5, flexWrap: 'wrap' }}>
                      <Chip size="small" label={`الإصدار v${declaration.version}`} sx={{ fontWeight: 800, bgcolor: '#F0FDFA', color: '#0F766E' }} />
                      {declaration.isMandatory && <Chip size="small" label="إلزامي" color="warning" sx={{ fontWeight: 800 }} />}
                    </Box>
                  </Box>
                </Box>
                <Button
                  variant="contained"
                  onClick={() => { setErrorMessage(''); setSelected(declaration); }}
                  endIcon={<ChevronDown size={17} />}
                  sx={{ borderRadius: 2.2, px: 2.2, fontWeight: 900, background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)' }}
                >
                  قراءة الإقرار والموافقة
                </Button>
              </Box>

              <Divider />
              <Box sx={{ px: { xs: 1.75, md: 2.25 }, py: 1.2, bgcolor: '#F8FAFC' }}>
                <Typography sx={{ color: '#64748B', fontSize: 11.5 }}>
                  يتطلب هذا الإقرار موافقة وتوقيعًا رقميًا قبل اكتمال المتطلب.
                </Typography>
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      <Dialog open={Boolean(selected)} onClose={() => !acceptMutation.isPending && setSelected(null)} fullWidth maxWidth="md" dir="rtl">
        {selected && (
          <>
            <DialogTitle sx={{ fontWeight: 900, color: '#0F172A' }}>
              {selected.titleAr}
              <Typography component="div" sx={{ color: '#64748B', fontSize: 11.5, mt: .4 }}>
                الإصدار v{selected.version} · {selected.isMandatory ? 'إقرار إلزامي' : 'إقرار'}
              </Typography>
            </DialogTitle>
            <DialogContent dividers sx={{ bgcolor: '#F8FAFC' }}>
              <Paper elevation={0} sx={{ p: { xs: 2, md: 3 }, borderRadius: 2.5, border: '1px solid #DDE7EE', bgcolor: '#FFF' }}>
                <Typography sx={{ whiteSpace: 'pre-wrap', lineHeight: 2, fontSize: 14, color: '#1E293B' }}>
                  {selected.contentAr || 'لا يوجد نص متاح لهذا الإقرار.'}
                </Typography>
              </Paper>
              {errorMessage && <Alert severity="error" sx={{ mt: 2 }}>{errorMessage}</Alert>}
              <Alert severity="warning" sx={{ mt: 2, borderRadius: 2 }}>
                بالضغط على «أوافق وأوقّع» سيتم تسجيل موافقتك على الإصدار الحالي مع وقت الموافقة ومعلومات الجهاز لأغراض التوثيق.
              </Alert>
            </DialogContent>
            <DialogActions sx={{ p: 2, gap: 1 }}>
              <Button disabled={acceptMutation.isPending} onClick={() => setSelected(null)}>إلغاء</Button>
              <Button
                variant="contained"
                disabled={acceptMutation.isPending}
                onClick={() => acceptMutation.mutate(selected)}
                startIcon={<FileSignature size={17} />}
                sx={{ fontWeight: 900, borderRadius: 2, background: 'linear-gradient(135deg, #0F766E 0%, #0D9488 100%)' }}
              >
                {acceptMutation.isPending ? 'جارٍ تسجيل التوقيع...' : 'أوافق وأوقّع رقميًا'}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </DataPageShell>
  );
};

export default Declarations;
