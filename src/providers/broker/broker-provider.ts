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
    const ranked = [...modelProfiles].sort((a, b) => b.strengths[taskType] - a.strengths[taskType]);
    return [ranked[0], ranked[1] ?? ranked[0]];
  }
}
