// ============================================================================
// Capability model — the authorisation vocabulary of the training platform.
// ============================================================================

export type ContextType = 'platform' | 'cluster' | 'university' | 'hospital';

export const CAPABILITIES = {
  TRAINING_REQUEST_CREATE: 'training_request.create',
  TRAINING_REQUEST_VIEW: 'training_request.view',
  TRAINING_REQUEST_REVIEW: 'training_request.review',
  TRAINING_REQUEST_APPROVE: 'training_request.approve',
  TRAINING_REQUEST_RETURN: 'training_request.return',
  ACADEMIC_BATCH_CREATE_FROM_REQUEST: 'academic_batch.create_from_request',
  ACADEMIC_BATCH_MANAGE: 'academic_batch.manage',
  ALLOCATION_CLUSTER_AUTO: 'allocation.cluster.auto',
  ALLOCATION_CLUSTER_MANUAL: 'allocation.cluster.manual',
  ALLOCATION_CLUSTER_REASSIGN: 'allocation.cluster.reassign',
  ALLOCATION_HOSPITAL_ASSIGN: 'allocation.hospital.assign',
  ALLOCATION_HOSPITAL_REASSIGN: 'allocation.hospital.reassign',
  DEPARTMENT_MANAGE: 'department.manage',
  CAPACITY_VIEW: 'capacity.view',
  CAPACITY_MANAGE: 'capacity.manage',
  TRAINER_MANAGE: 'trainer.manage',
  TRAINING_OPERATE: 'training.operate',
  TRAINEE_VIEW_SCOPE: 'trainee.view.scope',
  TRAINEE_VIEW_HOSPITAL: 'trainee.view.hospital',
  TRAINEE_VIEW_DEPARTMENT: 'trainee.view.department',
  TRAINEE_VIEW_ASSIGNED: 'trainee.view.assigned',
  TRAINEE_VIEW_SPONSORED: 'trainee.view.sponsored',
  SELF_VIEW: 'self.view',
  LOGBOOK_VIEW: 'logbook.view',
  LOGBOOK_APPROVE: 'logbook.approve',
  LOGBOOK_SUBMIT: 'logbook.submit',
  EVALUATION_SUBMIT: 'evaluation.submit',
  GRADUATION_APPROVE: 'graduation.approve',
  TIMELINE_VIEW: 'timeline.view',
  SCHEDULE_CREATE: 'schedule.create',
  SCHEDULE_VIEW: 'schedule.view',
  SCHEDULE_UPDATE: 'schedule.update',
  SCHEDULE_DELETE: 'schedule.delete',
  SCHEDULE_PUBLISH: 'schedule.publish',
  DECLARATION_MANAGE: 'declaration.manage',
  ORG_VIEW: 'org.view',
  ORG_MEMBER_VIEW: 'org_member.view',
  ORG_MEMBER_MANAGE: 'org_member.manage',
  INCIDENT_VIEW: 'incident.view',
  INCIDENT_MANAGE: 'incident.manage',
  REPORT_VIEW: 'report.view',
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];
const C = CAPABILITIES;

export const CAPABILITY_CONTEXTS: Record<Capability, ContextType[]> = {
  [C.TRAINING_REQUEST_CREATE]: ['university', 'platform', 'cluster'],
  [C.TRAINING_REQUEST_VIEW]: ['university', 'cluster', 'platform', 'hospital'],
  [C.TRAINING_REQUEST_REVIEW]: ['cluster', 'platform'],
  [C.TRAINING_REQUEST_APPROVE]: ['cluster', 'platform'],
  [C.TRAINING_REQUEST_RETURN]: ['cluster', 'platform'],
  [C.ACADEMIC_BATCH_CREATE_FROM_REQUEST]: ['cluster', 'platform'],
  [C.ACADEMIC_BATCH_MANAGE]: ['cluster', 'platform'],
  [C.ALLOCATION_CLUSTER_AUTO]: ['cluster', 'platform'],
  [C.ALLOCATION_CLUSTER_MANUAL]: ['cluster', 'platform'],
  [C.ALLOCATION_CLUSTER_REASSIGN]: ['cluster', 'platform'],
  [C.ALLOCATION_HOSPITAL_ASSIGN]: ['hospital', 'platform'],
  [C.ALLOCATION_HOSPITAL_REASSIGN]: ['hospital', 'platform'],
  [C.DEPARTMENT_MANAGE]: ['hospital', 'platform'],
  [C.CAPACITY_VIEW]: ['cluster', 'hospital', 'platform'],
  [C.CAPACITY_MANAGE]: ['hospital', 'platform'],
  [C.TRAINER_MANAGE]: ['hospital', 'platform'],
  [C.TRAINING_OPERATE]: ['hospital', 'cluster', 'platform'],
  [C.TRAINEE_VIEW_SCOPE]: ['cluster', 'university', 'platform'],
  [C.TRAINEE_VIEW_HOSPITAL]: ['hospital', 'platform'],
  [C.TRAINEE_VIEW_DEPARTMENT]: ['hospital', 'platform'],
  [C.TRAINEE_VIEW_ASSIGNED]: ['hospital', 'platform'],
  [C.TRAINEE_VIEW_SPONSORED]: ['university', 'platform'],
  [C.SELF_VIEW]: ['platform', 'cluster', 'university', 'hospital'],
  [C.LOGBOOK_VIEW]: ['cluster', 'university', 'hospital', 'platform'],
  [C.LOGBOOK_APPROVE]: ['hospital', 'platform'],
  [C.LOGBOOK_SUBMIT]: ['hospital', 'platform'],
  [C.EVALUATION_SUBMIT]: ['hospital', 'platform'],
  [C.GRADUATION_APPROVE]: ['cluster', 'university', 'hospital', 'platform'],
  [C.TIMELINE_VIEW]: ['cluster', 'university', 'hospital', 'platform'],
  [C.SCHEDULE_CREATE]: ['hospital', 'platform'],
  [C.SCHEDULE_VIEW]: ['hospital', 'university', 'cluster', 'platform'],
  [C.SCHEDULE_UPDATE]: ['hospital', 'platform'],
  [C.SCHEDULE_DELETE]: ['hospital', 'platform'],
  [C.SCHEDULE_PUBLISH]: ['hospital', 'platform'],
  [C.DECLARATION_MANAGE]: ['hospital', 'platform'],
  [C.ORG_VIEW]: ['platform', 'cluster', 'university', 'hospital'],
  [C.ORG_MEMBER_VIEW]: ['platform', 'cluster', 'university', 'hospital'],
  [C.ORG_MEMBER_MANAGE]: ['platform', 'cluster', 'university', 'hospital'],
  [C.INCIDENT_VIEW]: ['platform', 'cluster', 'university', 'hospital'],
  [C.INCIDENT_MANAGE]: ['platform', 'cluster', 'hospital'],
  [C.REPORT_VIEW]: ['platform', 'cluster', 'university', 'hospital'],
};

const ALL_CAPABILITIES = Object.values(C) as Capability[];
const READ_ONLY_CAPABILITIES: Capability[] = [C.TRAINING_REQUEST_VIEW, C.CAPACITY_VIEW, C.TRAINEE_VIEW_SCOPE, C.LOGBOOK_VIEW, C.TIMELINE_VIEW, C.ORG_VIEW, C.ORG_MEMBER_VIEW, C.INCIDENT_VIEW, C.REPORT_VIEW];

export const ROLE_CAPABILITIES: Record<string, Capability[]> = {
  platform_owner: ALL_CAPABILITIES,
  system_admin: ALL_CAPABILITIES,
  holding_administrator: READ_ONLY_CAPABILITIES,
  cluster_manager: [C.TRAINING_OPERATE,C.TRAINING_REQUEST_CREATE,C.TRAINING_REQUEST_VIEW,C.TRAINING_REQUEST_REVIEW,C.TRAINING_REQUEST_APPROVE,C.TRAINING_REQUEST_RETURN,C.ACADEMIC_BATCH_CREATE_FROM_REQUEST,C.ACADEMIC_BATCH_MANAGE,C.ALLOCATION_CLUSTER_AUTO,C.ALLOCATION_CLUSTER_MANUAL,C.ALLOCATION_CLUSTER_REASSIGN,C.CAPACITY_VIEW,C.TRAINEE_VIEW_SCOPE,C.LOGBOOK_VIEW,C.TIMELINE_VIEW,C.ORG_VIEW,C.ORG_MEMBER_VIEW,C.ORG_MEMBER_MANAGE,C.INCIDENT_VIEW,C.INCIDENT_MANAGE,C.REPORT_VIEW],
  training_director: [C.TRAINING_REQUEST_CREATE,C.TRAINING_REQUEST_VIEW,C.TRAINING_REQUEST_REVIEW,C.TRAINING_REQUEST_APPROVE,C.TRAINING_REQUEST_RETURN,C.ACADEMIC_BATCH_CREATE_FROM_REQUEST,C.ACADEMIC_BATCH_MANAGE,C.ALLOCATION_CLUSTER_AUTO,C.ALLOCATION_CLUSTER_MANUAL,C.ALLOCATION_CLUSTER_REASSIGN,C.CAPACITY_VIEW,C.TRAINEE_VIEW_SCOPE,C.LOGBOOK_VIEW,C.TIMELINE_VIEW,C.ORG_VIEW,C.ORG_MEMBER_VIEW,C.ORG_MEMBER_MANAGE,C.INCIDENT_VIEW,C.INCIDENT_MANAGE,C.REPORT_VIEW],
  cluster_administrator: [C.TRAINING_REQUEST_CREATE,C.TRAINING_REQUEST_VIEW,C.TRAINING_REQUEST_REVIEW,C.TRAINING_REQUEST_APPROVE,C.TRAINING_REQUEST_RETURN,C.ACADEMIC_BATCH_CREATE_FROM_REQUEST,C.ACADEMIC_BATCH_MANAGE,C.ALLOCATION_CLUSTER_AUTO,C.ALLOCATION_CLUSTER_MANUAL,C.ALLOCATION_CLUSTER_REASSIGN,C.CAPACITY_VIEW,C.TRAINEE_VIEW_SCOPE,C.LOGBOOK_VIEW,C.TIMELINE_VIEW,C.ORG_VIEW,C.ORG_MEMBER_VIEW,C.ORG_MEMBER_MANAGE,C.INCIDENT_VIEW,C.REPORT_VIEW],
  hospital_training_admin: [C.TRAINING_REQUEST_VIEW,C.DEPARTMENT_MANAGE,C.CAPACITY_VIEW,C.CAPACITY_MANAGE,C.TRAINER_MANAGE,C.ALLOCATION_HOSPITAL_ASSIGN,C.ALLOCATION_HOSPITAL_REASSIGN,C.TRAINEE_VIEW_HOSPITAL,C.TRAINING_OPERATE,C.LOGBOOK_VIEW,C.TIMELINE_VIEW,C.SCHEDULE_CREATE,C.SCHEDULE_VIEW,C.SCHEDULE_UPDATE,C.SCHEDULE_DELETE,C.SCHEDULE_PUBLISH,C.DECLARATION_MANAGE,C.ORG_VIEW,C.ORG_MEMBER_VIEW,C.ORG_MEMBER_MANAGE,C.INCIDENT_VIEW,C.INCIDENT_MANAGE,C.REPORT_VIEW],
  hospital_administrator: [C.ORG_VIEW,C.ORG_MEMBER_VIEW,C.ORG_MEMBER_MANAGE,C.INCIDENT_VIEW,C.INCIDENT_MANAGE,C.REPORT_VIEW],
  trainer: [C.TRAINING_OPERATE,C.TRAINEE_VIEW_ASSIGNED,C.LOGBOOK_VIEW,C.LOGBOOK_APPROVE,C.EVALUATION_SUBMIT,C.TIMELINE_VIEW,C.SCHEDULE_CREATE,C.SCHEDULE_VIEW,C.SCHEDULE_UPDATE,C.INCIDENT_VIEW],
  academic_supervisor: [C.TRAINEE_VIEW_SCOPE,C.GRADUATION_APPROVE,C.LOGBOOK_VIEW,C.TIMELINE_VIEW,C.SCHEDULE_VIEW,C.ORG_VIEW,C.INCIDENT_VIEW,C.REPORT_VIEW],
  university_administrator: [C.TRAINING_REQUEST_CREATE,C.TRAINING_REQUEST_VIEW,C.TRAINEE_VIEW_SPONSORED,C.LOGBOOK_VIEW,C.TIMELINE_VIEW,C.SCHEDULE_VIEW,C.ORG_VIEW,C.ORG_MEMBER_VIEW,C.ORG_MEMBER_MANAGE,C.INCIDENT_VIEW,C.REPORT_VIEW],
  academic_affairs: [C.TRAINING_REQUEST_CREATE,C.TRAINING_REQUEST_VIEW,C.TRAINEE_VIEW_SPONSORED,C.LOGBOOK_VIEW,C.TIMELINE_VIEW,C.SCHEDULE_VIEW,C.ORG_VIEW,C.INCIDENT_VIEW,C.REPORT_VIEW],
  trainee: [C.SELF_VIEW,C.LOGBOOK_SUBMIT,C.LOGBOOK_VIEW,C.TIMELINE_VIEW,C.SCHEDULE_VIEW,C.INCIDENT_VIEW],
  org_manager: [C.ORG_VIEW,C.ORG_MEMBER_VIEW,C.ORG_MEMBER_MANAGE,C.REPORT_VIEW],
};

export function capabilitiesForRoles(roleCodes: string[]): Capability[] { const set = new Set<Capability>(); for (const code of roleCodes) for (const cap of ROLE_CAPABILITIES[code] ?? []) set.add(cap); return Array.from(set); }
export function capabilityAllowedInContext(cap: Capability, context: ContextType): boolean { return (CAPABILITY_CONTEXTS[cap] ?? []).includes(context); }
export function rolesWithCapability(cap: Capability): string[] { return Object.entries(ROLE_CAPABILITIES).filter(([, caps]) => caps.includes(cap)).map(([role]) => role); }
export const TRAINING_CAPABILITIES: Capability[] = [C.TRAINING_REQUEST_CREATE,C.TRAINING_REQUEST_REVIEW,C.TRAINING_REQUEST_APPROVE,C.TRAINING_REQUEST_RETURN,C.ACADEMIC_BATCH_CREATE_FROM_REQUEST,C.ACADEMIC_BATCH_MANAGE,C.ALLOCATION_CLUSTER_AUTO,C.ALLOCATION_CLUSTER_MANUAL,C.ALLOCATION_CLUSTER_REASSIGN,C.ALLOCATION_HOSPITAL_ASSIGN,C.ALLOCATION_HOSPITAL_REASSIGN,C.DEPARTMENT_MANAGE,C.CAPACITY_MANAGE,C.TRAINER_MANAGE,C.TRAINING_OPERATE];
