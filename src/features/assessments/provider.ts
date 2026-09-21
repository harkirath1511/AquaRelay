import type { AssessmentEvidence, AssessmentResult } from "./contracts";

export interface AssessmentProvider {
  readonly providerName: string;
  readonly modelName: string;
  assess(evidence: AssessmentEvidence): Promise<AssessmentResult>;
}
