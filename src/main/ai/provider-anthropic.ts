import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider } from './provider';

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;
  private model: string;
  private abortController: AbortController | null = null;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model || 'claude-sonnet-4-20250514';
  }

  async streamQuery(
    systemPrompt: string,
    userMessage: string,
    onChunk: (text: string) => void,
    onEnd: () => void,
  ): Promise<void> {
    this.abortController = new AbortController();

    try {
      const stream = this.client.messages.stream(
        {
          model: this.model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        },
        { signal: this.abortController.signal },
      );

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          onChunk(event.delta.text);
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
