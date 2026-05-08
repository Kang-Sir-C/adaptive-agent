/**
 * OpenAI-compatibility smoke test.
 *
 * Exercises the /v1/* surface so you can verify it with any OpenAI SDK by
 * just pointing base_url at http://localhost:3000/v1.
 *
 * Usage:
 *   npm run smoke:openai
 */
const baseUrl = process.env.AA_SMOKE_BASE_URL ?? "http://localhost:3000";

async function main() {
  console.log(`OpenAI-compat smoke against ${baseUrl}`);

  const modelsResp = await fetch(`${baseUrl}/v1/models`);
  if (!modelsResp.ok) {
    console.error(`GET /v1/models failed: ${modelsResp.status} ${await modelsResp.text()}`);
    process.exit(1);
  }
  const models = (await modelsResp.json()) as { data: Array<{ id: string }> };
  console.log(`/v1/models -> ${models.data.length} models: ${models.data.map((m) => m.id).join(", ")}`);

  const cases: Array<{ label: string; model: string; userText: string }> = [
    { label: "alias aa-auto (adaptive)", model: "aa-auto", userText: "Say hi in three words." },
    { label: "alias aa-reliable", model: "aa-reliable", userText: "Refactor this to async: function f(id){return fetch('/u/'+id).then(r=>r.json());}" },
    { label: "direct claude-haiku-4-5 (passthrough)", model: "claude-haiku-4-5", userText: "What is the capital of France?" },
  ];

  for (const test of cases) {
    const chatResp = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-key" },
      body: JSON.stringify({ model: test.model, messages: [{ role: "user", content: test.userText }] }),
    });
    if (!chatResp.ok) {
      console.error(`[${test.label}] failed: ${chatResp.status} ${await chatResp.text()}`);
      continue;
    }
    const chat = (await chatResp.json()) as {
      choices: Array<{ message: { content: string } }>;
      adaptive?: { workflow: string; models_used: string[]; run_id: string; tier?: string };
    };
    console.log(`\n[${test.label}]`);
    console.log(`  workflow=${chat.adaptive?.workflow} tier=${chat.adaptive?.tier ?? "-"} models=${chat.adaptive?.models_used.join(",")} run=${chat.adaptive?.run_id}`);
    console.log(`  answer=${chat.choices[0].message.content.slice(0, 120)}`);
  }

  // Streaming check once
  console.log("\n[streaming aa-auto]");
  const streamResp = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test-key" },
    body: JSON.stringify({
      model: "aa-auto",
      stream: true,
      messages: [{ role: "user", content: "Say hello in three words." }],
    }),
  });
  if (!streamResp.ok || !streamResp.body) {
    console.error(`Streaming failed: ${streamResp.status} ${await streamResp.text()}`);
    process.exit(1);
  }
  console.log("Streaming:");
  const reader = streamResp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assembled = "";
  let chunkCount = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      if (!part.startsWith("data:")) continue;
      const payload = part.slice(5).trim();
      if (payload === "[DONE]") continue;
      chunkCount += 1;
      try {
        const parsed = JSON.parse(payload) as { choices: Array<{ delta: { content?: string } }> };
        assembled += parsed.choices[0]?.delta?.content ?? "";
      } catch {
        // ignore malformed line
      }
    }
  }
  console.log(`  chunks=${chunkCount} assembled=${assembled}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
