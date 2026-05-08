import { modelProfiles } from "../../config/models.js";
import { openAICompatibleConfig } from "../../config/provider.js";
import type { ModelProfile } from "../../models/profiles/model-profiles.js";
import type { TaskType, ModelTier } from "../../models/schemas/triage.js";
import type { GenerateRequest, GenerateResponse, JudgeRequest, JudgeResponse, ModelProvider } from "../provider.js";

export class BrokerProvider implements ModelProvider {
  constructor(private readonly adapter: ModelProvider) {}

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    return this.adapter.generate(request);
  }

  async classify(request: GenerateRequest): Promise<GenerateResponse> {
    return this.adapter.classify(request);
  }

  async judge(request: JudgeRequest): Promise<JudgeResponse> {
    return this.adapter.judge(request);
  }

  getProfiles(): ModelProfile[] {
    return modelProfiles;
  }

  getJudgeModel(): string {
    return openAICompatibleConfig.defaultJudgeModel;
  }

  pickModelByTier(tier: ModelTier, taskType: TaskType): ModelProfile {
    const candidates = modelProfiles.filter((profile) => profile.tier === tier);
    return [...candidates].sort((a, b) => b.strengths[taskType] - a.strengths[taskType])[0] ?? modelProfiles[0];
  }

  pickCompareModels(taskType: TaskType): [ModelProfile, ModelProfile] {
    // Comparing two near-identical premium models rarely produces useful
    // signal. Pick the strongest model, and pair it with the strongest model
    // from a *different* tier (preferring cheap/mid) so the compare workflow
    // actually exposes a quality-vs-cost tradeoff worth recording.
    const byStrength = [...modelProfiles].sort((a, b) => b.strengths[taskType] - a.strengths[taskType]);
    const primary = byStrength[0];
    if (!primary) {
      throw new Error("No model profiles configured. Edit src/config/models.ts.");
    }
    const secondary = byStrength.find((profile) => profile.tier !== primary.tier) ?? byStrength[1] ?? primary;
    return [primary, secondary];
  }
}
