import type { AIProvider } from "./provider";
import {
  buildSummarizePrompt,
  buildQuestionPrompt,
  buildGeneralPrompt,
  buildStructuredContext,
} from "./context-builder";
import { extractContent } from "../content/extractor";
import { AGENT_TOOLS } from "./tools";
import { executeAction, type ActionContext } from "./page-actions";
import type { TabManager } from "../tabs/tab-manager";
import type { WebContents } from "electron";

export async function handleAIQuery(
  query: string,
  provider: AIProvider,
  activeWebContents: WebContents | undefined,
  onChunk: (text: string) => void,
  onEnd: () => void,
  tabManager?: TabManager,
): Promise<void> {
  const lowerQuery = query.toLowerCase().trim();

  const isSummarize =
    lowerQuery.startsWith("summarize") ||
    lowerQuery.startsWith("tldr") ||
    lowerQuery === "summary";

  // Use agent path when provider supports tools and we have a tab manager
  if (provider.streamAgentQuery && tabManager && activeWebContents) {
    try {
      const pageContent = await extractContent(activeWebContents);
      const structuredContext = buildStructuredContext(pageContent);
      const truncated =
        pageContent.content.length > 20000
          ? pageContent.content.slice(0, 20000) + "\n[Content truncated...]"
          : pageContent.content;

      const systemPrompt = `You are Vessel, an AI agent embedded in a web browser. You can see the current page and interact with it using tools.

Current page context:
${structuredContext}

Page content:
${truncated}

Instructions:
- You can see the page the user is viewing. The content above is from the page.
- Use tools to interact with the page when asked to do something (click, navigate, type, scroll).
- After clicking or navigating, use read_page to see the updated content.
- Reference interactive elements by their index number (shown as [#N] in the listings above).
- Be concise. Explain what you're doing as you go.
- For simple questions about the page, just answer directly without using tools.`;

      const actionCtx: ActionContext = { tabManager };

      await provider.streamAgentQuery(
        systemPrompt,
        query,
        AGENT_TOOLS,
        onChunk,
        (name, args) => executeAction(name, args, actionCtx),
        onEnd,
      );
      return;
    } catch {
      // Fall through to simple path on error
    }
  }

  // Simple path (no tools) — for non-Anthropic providers or when no tab is active
  let prompt: { system: string; user: string };

  if (activeWebContents) {
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
