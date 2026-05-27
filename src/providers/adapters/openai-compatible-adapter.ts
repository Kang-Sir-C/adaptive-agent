import { openAICompatibleConfig } from "../../config/provider.js";
import type { GenerateRequest, GenerateResponse, JudgeRequest, JudgeResponse, ModelProvider } from "../provider.js";

type OpenAICompatibleMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenAICompatibleResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export class OpenAICompatibleAdapter implements ModelProvider {
  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    if (!openAICompatibleConfig.enabled || !openAICompatibleConfig.apiKey) {
      return this.mockGenerate(request);
    }

    const startedAt = Date.now();
    const response = await this.callChatCompletions(request.model, [
      ...(request.systemPrompt ? [{ role: "system", content: request.systemPrompt } satisfies OpenAICompatibleMessage] : []),
      { role: "user", content: request.prompt },
    ], request.responseFormat);

    return {
      model: request.model,
      answer: this.extractText(response),
      latencyMs: Date.now() - startedAt,
      costUnits: this.estimateCostUnits(response.usage?.total_tokens, request.prompt.length),
      raw: response,
    };
  }

  async classify(request: GenerateRequest): Promise<GenerateResponse> {
    return this.generate(request);
  }

  async judge(request: JudgeRequest): Promise<JudgeResponse> {
    if (!openAICompatibleConfig.enabled || !openAICompatibleConfig.apiKey) {
      return this.mockJudge(request);
    }

    const prompt = [
      request.prompt,
      "Candidates:",
      ...request.candidates.map((candidate) => `- ${candidate.id}: ${candidate.answer}`),
      "Return JSON with keys winner, confidence, reasons, scores.",
    ].join("\n\n");

    const response = await this.callChatCompletions(request.model, [
      {
        role: "system",
        content: "You are a strict evaluator. Return only JSON.",
      },
      {
        role: "user",
        content: prompt,
      },
    ], "json");

    const text = this.extractText(response);
    const parsed = this.tryParseJudge(text);
    if (parsed) {
      return {
        ...parsed,
        raw: response,
      };
    }

    return {
      ...this.mockJudge(request),
      raw: response,
      reasons: ["Judge response was not valid JSON. Fallback to mock decision."],
    };
  }

  private async callChatCompletions(
    model: string,
    messages: OpenAICompatibleMessage[],
    responseFormat: "text" | "json" = "text",
  ): Promise<OpenAICompatibleResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), openAICompatibleConfig.timeoutMs);

    try {
      const response = await fetch(`${openAICompatibleConfig.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAICompatibleConfig.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          response_format: responseFormat === "json" ? { type: "json_object" } : undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Provider request failed: ${response.status} ${errorText}`);
      }

      return (await response.json()) as OpenAICompatibleResponse;
    } finally {
      clearTimeout(timer);
    }
  }

  private extractText(response: OpenAICompatibleResponse): string {
    return response.choices?.[0]?.message?.content?.trim() ?? "";
  }

  private estimateCostUnits(totalTokens: number | undefined, promptLength: number): number {
    if (typeof totalTokens === "number") {
      return Math.max(0.01, totalTokens / 1000);
    }

    return Math.max(0.05, promptLength / 1000);
  }

  private tryParseJudge(text: string): JudgeResponse | null {
    try {
      const parsed = JSON.parse(text) as Partial<JudgeResponse>;
      if (!parsed.winner || typeof parsed.confidence !== "number" || !Array.isArray(parsed.reasons)) {
        return null;
      }

      return {
        winner: parsed.winner,
        confidence: parsed.confidence,
        reasons: parsed.reasons,
        scores: parsed.scores,
      };
    } catch {
      return null;
    }
  }

  private mockGenerate(request: GenerateRequest): GenerateResponse {
    const latencyMs = 300 + Math.floor(Math.random() * 700);
    // Optional cheap-tier degradation for experiment reproducibility.
    // When AA_MOCK_CHEAP_FAIL=true, cheap-tier mock outputs are intentionally
    // too short / non-JSON so that evaluators fail and trigger escalation paths.
    const cheapFail = process.env.AA_MOCK_CHEAP_FAIL === "true";
    const cheapTierModel = /haiku|qwen3-coder-next|deepseek-v3\.2|minimax/i.test(request.model);
    if (cheapFail && cheapTierModel) {
      return {
        model: request.model,
        answer: "I can help with that.",
        latencyMs,
        costUnits: Math.max(0.05, request.prompt.length / 1000),
        raw: { mocked: true, degraded: true },
      };
    }

    // Review tasks expect structured output; emit a JSON-shaped mock so evaluators pass.
    if (request.responseFormat === "json" || request.taskType === "review") {
      const body = JSON.stringify({
        model: request.model,
        summary: request.prompt.slice(0, 120),
        verdict: "ok",
      });
      return {
        model: request.model,
        answer: body,
        latencyMs,
        costUnits: Math.max(0.05, request.prompt.length / 1000),
        raw: { mocked: true },
      };
    }

    return {
      model: request.model,
      answer: `[${request.model}] ${request.prompt.slice(0, 600)}`,
      latencyMs,
      costUnits: Math.max(0.05, request.prompt.length / 1000),
      raw: { mocked: true },
    };
  }

  private mockJudge(request: JudgeRequest): JudgeResponse {
    const winner = request.candidates[0]?.id ?? "candidate_a";
    return {
      winner,
      confidence: 0.68,
      reasons: [`Selected ${winner} using adapter-level mock judge.`],
      scores: Object.fromEntries(request.candidates.map((candidate, index) => [candidate.id, Math.max(0.5, 0.8 - index * 0.1)])),
    };
  }
}
