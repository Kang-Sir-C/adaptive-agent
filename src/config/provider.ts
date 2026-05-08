export type OpenAICompatibleConfig = {
  baseUrl: string;
  apiKey?: string;
  timeoutMs: number;
  defaultJudgeModel: string;
  enabled: boolean;
};

const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) {
    return defaultValue;
  }

  return value.toLowerCase() === "true";
};

const parseNumber = (value: string | undefined, defaultValue: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
};

export const openAICompatibleConfig: OpenAICompatibleConfig = {
  baseUrl: process.env.AA_OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  apiKey: process.env.AA_OPENAI_API_KEY,
  timeoutMs: parseNumber(process.env.AA_OPENAI_TIMEOUT_MS, 60000),
  defaultJudgeModel: process.env.AA_JUDGE_MODEL ?? "sonnet-4.6",
  enabled: parseBoolean(process.env.AA_PROVIDER_ENABLED, false),
};
