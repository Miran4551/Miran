import fs from 'node:fs';

const path = new URL('../src/pages/ClusterTrainees.impl.tsx', import.meta.url);
let source = fs.readFileSync(path, 'utf8');

const oldActive = `  const requestsList: any[] = requestsData?.data || [];
  const activeRequest = requestsList[0];`;

const newActive = `  const requestsList: any[] = requestsData?.data || [];
  // Smart allocation must only consider requests that are actually waiting for
  // allocation. Approved/sent/active requests are deliberately excluded so the
  // action can explain that there is nothing left to distribute.
  const ALLOCATABLE_REQUEST_STATUSES = new Set(['submitted', 'under_cluster_review', 'resubmitted']);
  const allocatableRequests = requestsList.filter((request: any) =>
    ALLOCATABLE_REQUEST_STATUSES.has(request?.status),
  );
  const activeRequest = allocatableRequests[0];`;

if (source.includes(oldActive)) {
  source = source.replace(oldActive, newActive);
} else if (!source.includes(newActive)) {
  throw new Error(
    'ClusterTrainees active request marker not found; refusing partial patch.',
  );
}

const oldModal = `          {activeRequest && (
            <div style={{ backgroundColor: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '13px', color: '#0F172A' }}>
                رقم الطلب النشط: <strong>{activeRequest.requestNumber}</strong>
              </div>
              <div style={{ fontSize: '13px', color: '#0F172A', marginTop: '4px' }}>
                عدد الطلاب المطلوب توزيعهم: <strong>{activeRequest.studentCount} طالب</strong>
              </div>
            </div>
          )}`;

const newModal = `          {!activeRequest ? (
            <Alert severity="success" style={{ borderRadius: '10px', fontWeight: 700 }}>
              ✅ جميع المتدربين تم توزيعهم بالفعل — لا توجد حالياً طلبات أو متدربون بانتظار التوزيع الآلي.
            </Alert>
          ) : (
            <div style={{ backgroundColor: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '13px', color: '#0F172A' }}>
                رقم الطلب قيد التوزيع: <strong>{activeRequest.requestNumber}</strong>
              </div>
              <div style={{ fontSize: '13px', color: '#0F172A', marginTop: '4px' }}>
                عدد الطلاب المطلوب توزيعهم: <strong>{activeRequest.studentCount} طالب</strong>
              </div>
            </div>
          )}`;

if (source.includes(oldModal)) {
  source = source.replace(oldModal, newModal);
} else if (!source.includes(newModal)) {
  throw new Error(
    'ClusterTrainees auto-allocation modal marker not found; refusing partial patch.',
  );
}

const oldActions = `          <Button
            variant="contained"
            onClick={() => activeRequest && autoAllocateMutation.mutate(activeRequest.id)}
            disabled={autoAllocateMutation.isPending || !activeRequest}
            style={{ backgroundColor: '#0F766E', fontWeight: 800 }}
          >
            {autoAllocateMutation.isPending ? <CircularProgress size={20} /> : 'تأكيد التوزيع الآلي الذكي'}
          </Button>`;

const newActions = `          {activeRequest && (
            <Button
              variant="contained"
              onClick={() => autoAllocateMutation.mutate(activeRequest.id)}
              disabled={autoAllocateMutation.isPending}
              style={{ backgroundColor: '#0F766E', fontWeight: 800 }}
            >
              {autoAllocateMutation.isPending ? <CircularProgress size={20} /> : 'تأكيد التوزيع الآلي الذكي'}
            </Button>
          )}`;

if (source.includes(oldActions)) {
  source = source.replace(oldActions, newActions);
} else if (!source.includes(newActions)) {
  throw new Error(
    'ClusterTrainees auto-allocation action marker not found; refusing partial patch.',
  );
}

fs.writeFileSync(path, source);
console.log('Smart allocation empty-state patch verified/applied.');