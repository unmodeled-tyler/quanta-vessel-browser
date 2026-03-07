import type { AIProvider } from './provider';
import {
  buildSummarizePrompt,
  buildQuestionPrompt,
  buildGeneralPrompt,
} from './context-builder';
import { extractContent } from '../content/extractor';
import type { WebContents } from 'electron';

export async function handleAIQuery(
  query: string,
  provider: AIProvider,
  activeWebContents: WebContents | undefined,
  onChunk: (text: string) => void,
  onEnd: () => void,
): Promise<void> {
  const lowerQuery = query.toLowerCase().trim();

  const isSummarize =
    lowerQuery.startsWith('summarize') ||
    lowerQuery.startsWith('tldr') ||
    lowerQuery === 'summary';

  const needsPageContext =
    isSummarize ||
    lowerQuery.startsWith('what') ||
    lowerQuery.startsWith('who') ||
    lowerQuery.startsWith('how') ||
    lowerQuery.startsWith('why') ||
    lowerQuery.startsWith('when') ||
    lowerQuery.startsWith('where') ||
    lowerQuery.includes('this page') ||
    lowerQuery.includes('this article');

  let prompt: { system: string; user: string };

  if (needsPageContext && activeWebContents) {
    try {
      const pageContent = await extractContent(activeWebContents);

      if (isSummarize) {
        prompt = buildSummarizePrompt(pageContent);
      } else {
        prompt = buildQuestionPrompt(pageContent, query);
      }
    } catch {
      prompt = buildGeneralPrompt(query);
    }
  } else {
    prompt = buildGeneralPrompt(query);
  }

  await provider.streamQuery(prompt.system, prompt.user, onChunk, onEnd);
}
