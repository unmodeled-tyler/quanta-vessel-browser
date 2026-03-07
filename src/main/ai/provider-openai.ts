import OpenAI from 'openai';
import type { AIProvider } from './provider';
import type { ProviderConfig } from '../../shared/types';
import { PROVIDERS } from './providers';

export class OpenAICompatProvider implements AIProvider {
  private client: OpenAI;
  private model: string;
  private abortController: AbortController | null = null;

  constructor(config: ProviderConfig) {
    const meta = PROVIDERS[config.id];
    const baseURL =
      config.baseUrl || meta?.defaultBaseUrl || 'https://api.openai.com/v1';

    this.client = new OpenAI({
      apiKey: config.apiKey || 'ollama', // Ollama doesn't need a real key
      baseURL,
    });
    this.model = config.model || meta?.defaultModel || 'gpt-4o';
  }

  async streamQuery(
    systemPrompt: string,
    userMessage: string,
    onChunk: (text: string) => void,
    onEnd: () => void,
  ): Promise<void> {
    this.abortController = new AbortController();

    try {
      const stream = await this.client.chat.completions.create(
        {
          model: this.model,
          stream: true,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
        },
        { signal: this.abortController.signal },
      );

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          onChunk(delta);
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        onChunk(`\n\n[Error: ${err.message}]`);
      }
    } finally {
      this.abortController = null;
      onEnd();
    }
  }

  cancel(): void {
    this.abortController?.abort();
  }
}
