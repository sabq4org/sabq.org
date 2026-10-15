import { beforeEach, describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";

const { getFeatureConfig, getModel, logUsage } = vi.hoisted(() => ({
  getFeatureConfig: vi.fn(), getModel: vi.fn(), logUsage: vi.fn(),
}));
vi.mock("../../server/ai/gateway/configStore", () => ({ getFeatureConfig, getModel }));
vi.mock("../../server/ai/gateway/usageLogger", () => ({ logUsage }));
import { trackedOpenAICompletion } from "../../server/ai/gateway/trackedOpenAI";

const body: ChatCompletionCreateParamsNonStreaming = {
  model: "gpt-5.1", messages: [{ role: "user", content: "مادة خاصة 12345" }],
  response_format: { type: "json_object" }, max_completion_tokens: 1200,
};
function response(): ChatCompletion {
  return {
    id: "chat-test", object: "chat.completion", created: 1, model: "gpt-5.1-2025-11-13",
    choices: [{ index: 0, finish_reason: "stop", logprobs: null,
      message: { role: "assistant", content: '{"summary":"ملخص"}', refusal: null } }],
    usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100 },
  };
}
function clientWith(create: ReturnType<typeof vi.fn>): OpenAI {
  return { chat: { completions: { create } } } as unknown as OpenAI;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  getFeatureConfig.mockResolvedValue({ isEnabled: true });
  getModel.mockResolvedValue({ pricingUnit: "tokens", costPer1MInput: 1.25, costPer1MOutput: 10 });
});

describe("legacy OpenAI accounting and in-flight sharing", () => {
  it("preserves the exact SDK request/response and records only usage, not content", async () => {
    const result = response();
    const create = vi.fn().mockResolvedValue(result);
    expect(await trackedOpenAICompletion(clientWith(create), "editor-summarize", body)).toBe(result);
    expect(create).toHaveBeenCalledExactlyOnceWith(body);
    await vi.waitFor(() => expect(logUsage).toHaveBeenCalledOnce());
    expect(logUsage.mock.calls[0][0]).toMatchObject({
      featureKey: "editor-summarize", modelId: "gpt-5.1", provider: "openai",
      inputTokens: 1000, outputTokens: 100, estimatedCostUsd: 0.00225, status: "success",
    });
    expect(JSON.stringify(logUsage.mock.calls)).not.toContain("مادة خاصة");
    expect(JSON.stringify(logUsage.mock.calls)).not.toContain("ملخص");
  });

  it("shares concurrent identical metadata calls, clones each response, and permits later regeneration", async () => {
    const pending = deferred<ChatCompletion>();
    const create = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(response());
    const client = clientWith(create);
    const a = trackedOpenAICompletion(client, "seo-generator", body, { deduplicate: true });
    const b = trackedOpenAICompletion(client, "seo-generator", { ...body }, { deduplicate: true });
    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
    pending.resolve(response());
    const [first, second] = await Promise.all([a, b]);
    first.choices[0].message.content = "modified";
    expect(second.choices[0].message.content).toBe('{"summary":"ملخص"}');
    await vi.waitFor(() => expect(logUsage).toHaveBeenCalledOnce());
    await trackedOpenAICompletion(client, "seo-generator", body, { deduplicate: true });
    expect(create).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(logUsage).toHaveBeenCalledTimes(2));
  });

  it("does not share different features, models, payloads or clients", async () => {
    const pending = deferred<ChatCompletion>();
    const create = vi.fn().mockReturnValue(pending.promise);
    const client = clientWith(create);
    const calls = [
      trackedOpenAICompletion(client, "editor-summarize", body, { deduplicate: true }),
      trackedOpenAICompletion(client, "seo-generator", body, { deduplicate: true }),
      trackedOpenAICompletion(client, "editor-summarize", { ...body, model: "gpt-4o-mini" }, { deduplicate: true }),
      trackedOpenAICompletion(client, "editor-summarize", { ...body, max_completion_tokens: 10 }, { deduplicate: true }),
      trackedOpenAICompletion(clientWith(create), "editor-summarize", body, { deduplicate: true }),
    ];
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(5));
    pending.resolve(response());
    await Promise.all(calls);
  });

  it("does not combine creative requests unless explicitly opted in", async () => {
    const create = vi.fn().mockResolvedValue(response());
    const client = clientWith(create);
    await Promise.all([trackedOpenAICompletion(client, "editor-headlines", body), trackedOpenAICompletion(client, "editor-headlines", body)]);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("releases failed requests, keeps the original error, logs a safe code and adds no retry", async () => {
    const error = Object.assign(new Error("request included secret material"), { status: 429 });
    const create = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(response());
    const client = clientWith(create);
    await expect(trackedOpenAICompletion(client, "editor-summarize", body, { deduplicate: true })).rejects.toBe(error);
    expect(create).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(logUsage).toHaveBeenCalledOnce());
    expect(logUsage.mock.calls[0][0]).toMatchObject({ status: "failed", errorCode: "RATE_LIMITED", estimatedCostUsd: 0 });
    expect(JSON.stringify(logUsage.mock.calls)).not.toContain("secret material");
    await trackedOpenAICompletion(client, "editor-summarize", body, { deduplicate: true });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("honors the feature disable switch before any provider request", async () => {
    getFeatureConfig.mockResolvedValue({ isEnabled: false });
    const create = vi.fn();
    await expect(trackedOpenAICompletion(clientWith(create), "editor-summarize", body)).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    expect(create).not.toHaveBeenCalled();
    expect(logUsage).not.toHaveBeenCalled();
  });

  it("does not discard a paid response if cost lookup or logging fails", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const create = vi.fn().mockResolvedValue(response());
    getModel.mockRejectedValueOnce(new Error("lookup unavailable"));
    await expect(trackedOpenAICompletion(clientWith(create), "editor-summarize", body)).resolves.toMatchObject({ id: "chat-test" });
    await vi.waitFor(() => expect(warning).toHaveBeenCalledOnce());
    logUsage.mockImplementationOnce(() => { throw new Error("logger unavailable"); });
    await expect(trackedOpenAICompletion(clientWith(create), "editor-summarize", body)).resolves.toMatchObject({ id: "chat-test" });
    await vi.waitFor(() => expect(warning).toHaveBeenCalledTimes(2));
    warning.mockRestore();
  });

  it("records truncation and actual usage even when a consumer will reject the result", async () => {
    const result = response();
    result.choices[0].finish_reason = "length";
    await trackedOpenAICompletion(clientWith(vi.fn().mockResolvedValue(result)), "editor-summarize", body);
    await vi.waitFor(() => expect(logUsage).toHaveBeenCalledOnce());
    expect(logUsage.mock.calls[0][0]).toMatchObject({ status: "success", errorCode: "OUTPUT_TRUNCATED", outputTokens: 100 });
  });
});
