import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://miran-backend.onrender.com/api/v1';

// A browser-only sentinel used for the allocation console's empty-state action.
// It is never sent to the backend: the request interceptor turns the action into
// a successful no-op so the existing success banner can tell the manager that
// there is simply nothing left to allocate.
const NO_PENDING_ALLOCATION_ID = '00000000-0000-4000-8000-000000000000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// The flag is deliberately kept outside React so the shared API layer can make
// the empty-state action a no-op without adding a second state path to the page.
let noPendingAllocationAction = false;

// ── Interceptor: Attach JWT Token & Active Org Context ──────────────────────
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    const orgId = localStorage.getItem('active_org_id');

    if (token) config.headers.Authorization = `Bearer ${token}`;
    if (orgId) config.headers['X-Organization-Id'] = orgId;

    // Training-request queues are live operational read models. Do not let the
    // browser/proxy keep a conditional GET alive after a new request is created:
    // Render/Nest can otherwise return 304 based on a stale entity tag and the
    // cluster screen keeps showing the previous list until a hard refresh.
    // A cache-buster makes every queue refresh read the current DB state.
    if (
      config.method?.toLowerCase() === 'get' &&
      (config.url === '/training-requests' || config.url?.endsWith('/training-requests'))
    ) {
      config.params = {
        ...(config.params || {}),
        _ts: Date.now(),
      };
      config.headers['Cache-Control'] = 'no-cache, no-store, max-age=0';
      config.headers.Pragma = 'no-cache';
    }

    // When the allocation console has no pending request, its existing button
    // still needs a meaningful action. The page reuses its normal mutation path;
    // here we convert that one sentinel call into a local successful no-op. This
    // is safer than calling the backend on an already-approved request, which
    // could otherwise attempt a second allocation run.
    if (
      noPendingAllocationAction &&
      config.method?.toLowerCase() === 'post' &&
      config.url?.includes('/training-requests/') &&
      config.url?.endsWith('/auto-allocate')
    ) {
      config.adapter = async () => ({
        data: {
          success: true,
          message: '✅ جميع المتدربين تم توزيعهم بالفعل — لا توجد حالياً طلبات أو متدربون بانتظار التوزيع الآلي.',
          rowResults: [],
          noPendingAllocation: true,
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });
      noPendingAllocationAction = false;
    }

    // Canonical hospital assignment contract:
    // the trainee-distribution screen and the trainer-card "إسناد متدرب"
    // action must both write through the same TraineeAllocation path.
    // Older trainer-card builds still call the legacy PATCH endpoint, so
    // transparently route it to the canonical POST endpoint.
    if (
      config.url?.includes('/training-requests/trainees/') &&
      config.url?.includes('/hospital-review/assignment')
    ) {
      config.url = config.url.replace('/hospital-review/assignment', '/allocations/department');
      config.method = 'post';
      config.headers['X-Miran-Assignment-Source'] = 'trainer-card-legacy';
    }

    // Department IDs are UUIDs. Never send legacy numeric department codes to
    // the canonical endpoint. The backend remains the authority for validating
    // the resulting department/trainer relationship.
    if (
      config.url?.includes('/training-requests/trainees/') &&
      config.url?.includes('/allocations/department') &&
      config.data &&
      typeof config.data === 'object'
    ) {
      const departmentId = config.data.departmentId;
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (departmentId && !uuid.test(String(departmentId))) {
        delete config.data.departmentId;
      }
      if (!config.data.reason) {
        config.data.reason = 'إسناد المتدرب لقسم ومدرب داخل المستشفى';
      }
    }

    if (import.meta.env.DEV) {
      console.debug(`[API Request] ${config.method?.toUpperCase()} ${config.url}`, {
        hasToken: Boolean(token),
        orgId,
      });
    }

    return config;
  },
  (error) => Promise.reject(error),
);

// Queue state for handling concurrent 401 requests during token refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else if (token) prom.resolve(token);
  });
  failedQueue = [];
};

// ── Interceptor: Read-model guards & 401 refresh ────────────────────────────
apiClient.interceptors.response.use(
  (response) => {
    const url = response.config.url || '';

    // The ClusterTrainees workspace is an allocation console. It needs a pending
    // request first when one exists, but when there are zero pending requests it
    // must still have a real interaction target so the existing mutation can show
    // its success banner instead of presenting a blank modal.
    //
    // Keep the general /training-requests response untouched everywhere else;
    // only narrow the read model while this specific workspace is mounted.
    if (
      window.location.pathname === '/cluster-trainees' &&
      (url === '/training-requests' || url.endsWith('/training-requests')) &&
      response.data && Array.isArray(response.data.data)
    ) {
      const allocatableStatuses = new Set(['submitted', 'under_cluster_review', 'resubmitted']);
      const allRequests = response.data.data;
      const allocatable = allRequests.filter((request: any) =>
        allocatableStatuses.has(request?.status),
      );

      if (allocatable.length > 0) {
        noPendingAllocationAction = false;
        response.data = {
          ...response.data,
          data: allocatable,
        };
      } else {
        // Keep a real recent request as the visual target when the archive is not
        // empty; otherwise use a browser-only sentinel. Neither path calls the
        // backend when the manager confirms the empty-state action.
        noPendingAllocationAction = true;
        const visualTarget = allRequests[0] || {
          id: NO_PENDING_ALLOCATION_ID,
          requestNumber: 'لا توجد طلبات بانتظار التوزيع',
          studentCount: 0,
          status: 'no_pending_allocation',
          sourceOrg: null,
          targetOrg: null,
        };
        response.data = {
          ...response.data,
          data: [visualTarget],
        };
      }
    }

    // Notify mounted training screens that the canonical allocation changed.
    if (
      url.includes('/training-requests/trainees/') &&
      url.includes('/allocations/department')
    ) {
      const match = url.match(/\/training-requests\/trainees\/([^/]+)\//);
      if (match?.[1]) {
        window.dispatchEvent(
          new CustomEvent('miran:training-assignment-changed', {
            detail: { traineeRowId: match[1] },
          }),
        );
      }
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const endpoint = originalRequest?.url || '';

    if (import.meta.env.DEV) {
      console.debug(`[API Status] ${status} on ${endpoint}`, {
        refreshed: Boolean(originalRequest?._retry),
      });
    }

    if (
      endpoint.includes('/auth/login') ||
      endpoint.includes('/auth/refresh-token') ||
      endpoint.includes('/auth/activate')
    ) {
      return Promise.reject(error);
    }

    if (status === 401 && originalRequest && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;
      const refreshToken = localStorage.getItem('refresh_token');
      const authorization = originalRequest.headers?.Authorization;
      const originalAccessToken = typeof authorization === 'string'
        ? authorization.replace(/^Bearer\s+/i, '')
        : null;

      if (refreshToken) {
        try {
          // Standard post to refresh-token without passing auth header
          const res = await axios.post(`${API_BASE_URL}/auth/refresh-token`, { refreshToken }, {
            headers: { 'Content-Type': 'application/json' },
          });

          const data = res.data?.data || res.data;
          const newAccessToken = data?.accessToken || data?.tokens?.accessToken;
          const newRefreshToken = data?.refreshToken || data?.tokens?.refreshToken;

          if (!newAccessToken) {
            throw new Error('No access token returned from refresh endpoint');
          }

          if (import.meta.env.DEV) {
            console.debug(`[Auth Refresh] Token successfully refreshed for ${endpoint}`);
          }

          localStorage.setItem('access_token', newAccessToken);
          if (newRefreshToken) {
            localStorage.setItem('refresh_token', newRefreshToken);
          }
          apiClient.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`;
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

          processQueue(null, newAccessToken);
          isRefreshing = false;
          return apiClient(originalRequest);
        } catch (refreshErr) {
          // Refresh tokens are rotated by the backend. Multiple Miran tabs share
          // localStorage, so another tab may have completed the refresh just before
          // this request failed with the old refresh token. In that case the latest
          // access token is valid and must win; do not log the whole browser out.
          const latestAccessToken = localStorage.getItem('access_token');
          if (latestAccessToken && latestAccessToken !== originalAccessToken) {
            if (import.meta.env.DEV) {
              console.debug(`[Auth Refresh] Another tab refreshed the session; reusing the latest access token for ${endpoint}`);
            }
            processQueue(null, latestAccessToken);
            isRefreshing = false;
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${latestAccessToken}`;
            return apiClient(originalRequest);
          }

          processQueue(refreshErr, null);
          isRefreshing = false;

          // Clear auth tokens only on definitive refresh failure.
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('active_org_id');
          localStorage.removeItem('user_profile');
          delete apiClient.defaults.headers.common.Authorization;

          window.dispatchEvent(new Event('auth:logout'));
          if (window.location.pathname !== '/login' && window.location.pathname !== '/activate') {
            window.location.href = '/login';
          }
          return Promise.reject(refreshErr);
        }
      }

      isRefreshing = false;
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('active_org_id');
      localStorage.removeItem('user_profile');
      delete apiClient.defaults.headers.common.Authorization;

      window.dispatchEvent(new Event('auth:logout'));
      if (window.location.pathname !== '/login' && window.location.pathname !== '/activate') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  },
);
