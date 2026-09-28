/** Declarative state machines. Services call assertTransition() before persisting a status change. */
export interface Transition<S extends string> { from: S | '*'; to: S; permission: string; }
export interface Machine<S extends string> { name: string; states: readonly S[]; transitions: Transition<S>[]; }

export function hasPermission(granted: string[], required: string): boolean {
  if (granted.includes('*') || granted.includes(required)) return true;
  const parts = required.split(':');
  for (let i = parts.length - 1; i > 0; i--) {
    if (granted.includes(parts.slice(0, i).join(':') + ':*')) return true;
  }
  return false;
}

export function allowedTransitions<S extends string>(m: Machine<S>, from: S, perms: string[]): S[] {
  return m.transitions.filter(t => (t.from === from || t.from === '*') && t.to !== from && hasPermission(perms, t.permission)).map(t => t.to);
}

export class TransitionError extends Error {}

export function assertTransition<S extends string>(m: Machine<S>, from: S, to: S, perms: string[]): Transition<S> {
  const t = m.transitions.find(x => (x.from === from || x.from === '*') && x.to === to);
  if (!t) throw new TransitionError(`${m.name}: ${from} → ${to} is not a valid transition`);
  if (!hasPermission(perms, t.permission)) throw new TransitionError(`${m.name}: missing permission ${t.permission}`);
  return t;
}

const chain = <S extends string>(states: readonly S[], permission: string): Transition<S>[] =>
  states.slice(0, -1).map((s, i) => ({ from: s, to: states[i + 1], permission }));

export const OPPORTUNITY_STATUSES = ['DISCOVERED', 'SCREENED', 'VALIDATING', 'ENGINEERING', 'MODELLING', 'FINANCE_READY', 'COMMERCIAL', 'RESERVED', 'IN_DEVELOPMENT', 'OPERATING', 'ARCHIVED', 'NO_GO'] as const;
export type OpportunityStatus = typeof OPPORTUNITY_STATUSES[number];
export const OPPORTUNITY_MACHINE: Machine<OpportunityStatus> = {
  name: 'opportunity',
  states: OPPORTUNITY_STATUSES,
  transitions: [
    { from: 'DISCOVERED', to: 'SCREENED', permission: 'opportunity:research' },
    { from: 'SCREENED', to: 'VALIDATING', permission: 'opportunity:research' },
    { from: 'VALIDATING', to: 'ENGINEERING', permission: 'opportunity:research' },
    { from: 'ENGINEERING', to: 'MODELLING', permission: 'opportunity:engineer' },
    { from: 'MODELLING', to: 'FINANCE_READY', permission: 'opportunity:finance' },
    { from: 'FINANCE_READY', to: 'COMMERCIAL', permission: 'opportunity:commercial' },
    { from: 'COMMERCIAL', to: 'RESERVED', permission: 'opportunity:commercial' },
    { from: 'RESERVED', to: 'IN_DEVELOPMENT', permission: 'project:manage' },
    { from: 'IN_DEVELOPMENT', to: 'OPERATING', permission: 'project:manage' },
    { from: 'RESERVED', to: 'COMMERCIAL', permission: 'opportunity:commercial' },
    { from: '*', to: 'NO_GO', permission: 'opportunity:research' },
    { from: 'NO_GO', to: 'VALIDATING', permission: 'opportunity:override' },
    { from: '*', to: 'ARCHIVED', permission: 'opportunity:archive' },
  ],
};

/** Ordered approval stages required before publication. */
export const APPROVAL_STAGES = ['RESEARCH', 'TECHNICAL', 'FINANCIAL', 'COMMERCIAL', 'MANAGEMENT'] as const;
export type ApprovalStage = typeof APPROVAL_STAGES[number];
export const APPROVAL_PERMISSION: Record<ApprovalStage, string> = {
  RESEARCH: 'opportunity:approve:research',
  TECHNICAL: 'opportunity:approve:technical',
  FINANCIAL: 'opportunity:approve:financial',
  COMMERCIAL: 'opportunity:approve:commercial',
  MANAGEMENT: 'opportunity:approve:management',
};

export const SUPPLIER_STATUSES = ['REGISTERED', 'DOCUMENTATION_SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'QUALIFIED', 'APPROVED', 'SUSPENDED'] as const;
export type SupplierStatus = typeof SUPPLIER_STATUSES[number];
export const SUPPLIER_MACHINE: Machine<SupplierStatus> = {
  name: 'supplier',
  states: SUPPLIER_STATUSES,
  transitions: [
    { from: 'REGISTERED', to: 'DOCUMENTATION_SUBMITTED', permission: 'supplier:self:submit' },
    { from: 'DOCUMENTATION_SUBMITTED', to: 'UNDER_REVIEW', permission: 'supplier:verify' },
    { from: 'UNDER_REVIEW', to: 'VERIFIED', permission: 'supplier:verify' },
    { from: 'UNDER_REVIEW', to: 'DOCUMENTATION_SUBMITTED', permission: 'supplier:verify' },
    { from: 'VERIFIED', to: 'QUALIFIED', permission: 'supplier:verify' },
    { from: 'QUALIFIED', to: 'APPROVED', permission: 'supplier:approve' },
    { from: '*', to: 'SUSPENDED', permission: 'supplier:approve' },
    { from: 'SUSPENDED', to: 'UNDER_REVIEW', permission: 'supplier:approve' },
  ],
};

export const LEAD_STAGES = ['NEW', 'QUALIFYING', 'QUALIFIED', 'OPPORTUNITY_SELECTED', 'FINANCING', 'ENGINEERING', 'QUOTED', 'WON', 'PROJECT', 'COMMISSIONING', 'OPERATING', 'LOST'] as const;
export type LeadStage = typeof LEAD_STAGES[number];
export const LEAD_MACHINE: Machine<LeadStage> = {
  name: 'lead',
  states: LEAD_STAGES,
  transitions: [
    ...chain(LEAD_STAGES.slice(0, 8) as unknown as LeadStage[], 'lead:write'),
    { from: 'WON', to: 'PROJECT', permission: 'project:manage' },
    { from: 'PROJECT', to: 'COMMISSIONING', permission: 'project:manage' },
    { from: 'COMMISSIONING', to: 'OPERATING', permission: 'project:manage' },
    { from: '*', to: 'LOST', permission: 'lead:write' },
  ],
};

export const RFQ_STATUSES = ['DRAFT', 'ISSUED', 'RESPONSES_OPEN', 'CLOSED', 'EVALUATED', 'AWARDED', 'CANCELLED'] as const;
export type RfqStatus = typeof RFQ_STATUSES[number];
export const RFQ_MACHINE: Machine<RfqStatus> = {
  name: 'rfq',
  states: RFQ_STATUSES,
  transitions: [...chain(RFQ_STATUSES.slice(0, 6) as unknown as RfqStatus[], 'rfq:manage'), { from: '*', to: 'CANCELLED', permission: 'rfq:manage' }],
};
