import { assessmentResultSchema } from "./contracts";
import type { AssessmentProvider } from "./provider";
import type { AssessmentRepository } from "./repository";
import { evaluateEvidence } from "./rules";

export class AssessmentService {
  constructor(
    private readonly repository: AssessmentRepository,
    private readonly provider: AssessmentProvider,
  ) {}

  async assess(incidentId: string, userId: string) {
    const claim = await this.repository.claim(incidentId, userId);

    try {
      const evidence = await this.repository.loadEvidence(incidentId);
      if (evidence.evidenceRevision !== claim.evidenceRevision) {
        throw new Error("Evidence changed before assessment started");
      }

      const result = assessmentResultSchema.parse(await this.provider.assess(evidence));
      this.assertReferencesExist(result, new Set(evidence.observations.map(({ id }) => id)));
      const decision = evaluateEvidence(evidence, result);
      await this.repository.complete(claim, result, decision, this.provider);
      return { assessmentId: claim.assessmentId, evidenceRevision: claim.evidenceRevision, result, decision };
    } catch (error) {
      await this.repository.fail(claim, this.failureCode(error));
      throw error;
    }
  }

  private assertReferencesExist(result: ReturnType<typeof assessmentResultSchema.parse>, ids: Set<string>) {
    const linked = [
      ...result.observedFeatures,
      ...result.qualityIssues,
      ...result.possibleExplanations,
      ...result.contradictions,
      result.summary,
    ];
    if (linked.some((item) => item.evidenceReferences.some((id) => !ids.has(id)))) {
      throw new Error("Assessment contains an unknown evidence reference");
    }
  }

  private failureCode(error: unknown) {
    if (error instanceof DOMException && error.name === "TimeoutError") return "provider_timeout";
    if (error instanceof SyntaxError) return "invalid_provider_json";
    return "assessment_failed";
  }
}
