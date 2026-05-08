import type { RunRequest, SessionState } from "../../models/schemas/run.js";

export type BuiltContext = {
  triageInput: string;
  executionInput: string;
  reviewInput: string;
};

export class ContextBuilder {
  build(request: RunRequest, sessionState: SessionState): BuiltContext {
    const selectedText = request.context?.selectedText ?? "";
    const currentFile = request.context?.currentFile
      ? `\nCurrent file: ${request.context.currentFile.path}\n${request.context.currentFile.content}`
      : "";
    const relatedFiles = request.context?.relatedFiles?.length
      ? `\nRelated files:\n${request.context.relatedFiles.map((file) => `${file.path}\n${file.content.slice(0, 600)}`).join("\n---\n")}`
      : "";
    const facts = sessionState.relevantFacts.length ? `\nFacts:\n${sessionState.relevantFacts.join("\n")}` : "";

    // When selectedText is a full conversation prompt (from OpenAI bridge),
    // use it directly as the execution input. Otherwise build from parts.
    const isFullPrompt = selectedText.length > request.userInput.length * 2;
    const executionInput = isFullPrompt
      ? selectedText
      : `User request:\n${request.userInput}${selectedText ? `\nSelected:\n${selectedText}` : ""}${currentFile}${relatedFiles}${facts}`;

    const base = `User request:\n${request.userInput}${selectedText ? `\nContext:\n${selectedText.slice(0, 600)}` : ""}${currentFile}${relatedFiles}${facts}`;

    return {
      triageInput: `Mode: ${request.mode}\n${base}`,
      executionInput,
      reviewInput: `Review target:\n${executionInput}`,
    };
  }
}
