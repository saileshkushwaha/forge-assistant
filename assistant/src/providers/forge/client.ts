import { OpenAIChatCompletionsProvider } from "../openai/chat-completions-provider.js";

export interface ForgeProviderOptions {
  apiKey?: string;
  baseURL?: string;
  streamTimeoutMs?: number;
}

/**
 * OpenAI-compatible client for Forge-hosted GPU inference (vLLM).
 * Managed requests set `baseURL` to the platform `/v1/runtime-proxy/forge`
 * path and authenticate with the assistant API key. These models have no
 * bring-your-own-key path.
 */
export class ForgeProvider extends OpenAIChatCompletionsProvider {
  constructor(
    apiKey: string,
    model: string,
    options: ForgeProviderOptions = {},
  ) {
    super(apiKey || "not-needed", model, {
      providerName: "forge",
      providerLabel: "Forge",
      streamTimeoutMs: options.streamTimeoutMs,
      omitToolChoiceWhenReasoning: true,
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    });
  }
}
