import type { RunRequest, SessionState } from "../../models/schemas/run.js";

export type BuiltContext = {
  triageInput: string;
  executionInput: string;
  reviewInput: string;
};

export class ContextBuilder {
  build(request: RunRequest, sessionState: SessionState): BuiltContext {
    const selectedText = request.context?.selectedText ? `\nSelected:\n${request.context.selectedText}` : "";
    const currentFile = request.context?.currentFile
      ? `\nCurrent file: ${request.context.currentFile.path}\n${request.context.currentFile.content}`
      : "";
    const relatedFiles = request.context?.relatedFiles?.length
      ? `\nRelated files:\n${request.context.relatedFiles.map((file) => `${file.path}\n${file.content.slice(0, 600)}`).join("\n---\n")}`
      : "";
    const facts = sessionState.relevantFacts.length ? `\nFacts:\n${sessionState.relevantFacts.join("\n")}` : "";

    const base = `User request:\n${request.userInput}${selectedText}${currentFile}${relatedFiles}${facts}`;

    return {
      triageInput: `Mode: ${request.mode}\n${base}`,
      executionInput: base,
      reviewInput: `Review target:\n${base}`,
    };
  }
}
