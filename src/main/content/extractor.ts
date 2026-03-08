import type { WebContents } from 'electron';
import type { PageContent } from '../../shared/types';

export async function extractContent(
  webContents: WebContents,
): Promise<PageContent> {
  const result = await webContents.executeJavaScript(`
    (function() {
      if (window.__vessel && window.__vessel.extractContent) {
        return window.__vessel.extractContent();
      }
      // Fallback to basic extraction
      return {
        title: document.title,
        content: document.body?.innerText || '',
        htmlContent: '',
        byline: '',
        excerpt: '',
        url: window.location.href,
        headings: [],
        navigation: [],
        interactiveElements: [],
        forms: [],
        landmarks: [],
      };
    })()
  `);

  return result as PageContent;
}
