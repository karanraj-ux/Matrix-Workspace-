export type TriggerType = 'ON_NEW_EMAIL';
export type ConditionField = 'subject' | 'from' | 'hasAttachment' | 'any_email';
export type ConditionOperator = 'contains' | 'equals' | 'is_true' | 'always';
export type ActionType = 'SAVE_ATTACHMENTS_TO_DRIVE' | 'MARK_AS_READ' | 'TRASH_EMAIL' | 'FORWARD_EMAIL';

export interface RuleCondition {
  id: string;
  field: ConditionField;
  operator: ConditionOperator;
  value: string | boolean;
}

export interface RuleAction {
  id: string;
  type: ActionType;
  targetAccountId?: string; // For SAVE_ATTACHMENTS
  targetEmail?: string;     // For FORWARD_EMAIL
}

export interface AutomationRule {
  id: string;
  name: string;
  sourceAccountId: string;
  trigger: TriggerType;
  conditions: RuleCondition[];
  actions: RuleAction[];
  isActive: boolean;
  createdAt: number;
}

export interface AutomationLog {
  id: string;
  timestamp: number;
  ruleName: string;
  actionTaken: string;
  status: 'success' | 'error';
  details?: string;
  accountEmail?: string;
}
