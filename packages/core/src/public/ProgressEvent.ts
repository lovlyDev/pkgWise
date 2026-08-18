export type ProgressPhase =
  'discovery' | 'parsing' | 'graph' | 'providers' | 'rules' | 'scoring' | 'reporting';

export interface ProgressEvent {
  readonly type: 'phase-started' | 'phase-progress' | 'phase-completed';
  readonly phase: ProgressPhase;
  readonly completed?: number;
  readonly total?: number;
}
