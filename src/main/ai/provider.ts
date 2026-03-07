import type { ProviderConfig } from '../../shared/types';
import { AnthropicProvider } from './provider-anthropic';
import { OpenAICompatProvider } from './provider-openai';

export interface AIProvider {
  streamQuery(
    systemPrompt: string,
    userMessage: string,
    onChunk: (text: string) => void,
    onEnd: () => void,
  ): Promise<void>;

  cancel(): void;
}

export function createProvider(config: ProviderConfig): AIProvider {
  if (config.id === 'anthropic') {
    return new AnthropicProvider(config.apiKey, config.model);
  }
  return new OpenAICompatProvider(config);
}
