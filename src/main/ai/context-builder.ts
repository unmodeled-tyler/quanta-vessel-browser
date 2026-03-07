import type { PageContent, InteractiveElement, HeadingStructure } from '../../shared/types';

const MAX_CONTENT_LENGTH = 60000; // ~15k tokens rough estimate
const MAX_STRUCTURED_ITEMS = 100; // Limit structured elements to keep context manageable

function truncateContent(content: string): string {
  if (content.length <= MAX_CONTENT_LENGTH) return content;
  return (
    content.slice(0, MAX_CONTENT_LENGTH) +
    '\n\n[Content truncated for length...]'
  );
}

function limitItems<T>(items: T[], max: number = MAX_STRUCTURED_ITEMS): T[] {
  if (items.length <= max) return items;
  return items.slice(0, max);
}

/**
 * Format interactive elements into a readable structure
 */
function formatInteractiveElements(elements: InteractiveElement[]): string {
  if (elements.length === 0) return 'None';
  
  const items = limitItems(elements, 50);
  
  return items.map((el, index) => {
    const parts: string[] = [`${index + 1}.`];
    
    if (el.type === 'button') {
      parts.push(`[${el.text || 'Button'}]`);
      parts.push('button');
    } else if (el.type === 'link') {
      parts.push(`[${el.text || 'Link'}]`);
      parts.push('link');
      if (el.href) parts.push(`→ ${el.href}`);
    } else if (el.type === 'input') {
      parts.push(`[${el.label || el.placeholder || 'Input'}]`);
      parts.push(el.inputType || 'text');
      parts.push('input');
      if (el.required) parts.push('(required)');
    } else if (el.type === 'select') {
      parts.push(`[${el.label || 'Select'}]`);
      parts.push('dropdown');
    } else if (el.type === 'textarea') {
      parts.push(`[${el.label || 'Text Area'}]`);
      parts.push('textarea');
    }
    
    if (el.context && el.context !== 'content') {
      parts.push(`(${el.context})`);
    }
    
    return parts.join(' ');
  }).join('\n');
}

/**
 * Format headings hierarchy
 */
function formatHeadings(headings: HeadingStructure[]): string {
  if (headings.length === 0) return 'None';
  
  const items = limitItems(headings, 30);
  
  return items.map((h) => {
    const indent = '  '.repeat(h.level - 1);
    return `${indent}H${h.level}: ${h.text}`;
  }).join('\n');
}

/**
 * Format navigation links
 */
function formatNavigation(nav: InteractiveElement[]): string {
  if (nav.length === 0) return 'None detected';
  
  const items = limitItems(nav, 20);
  
  return items.map((item, index) => {
    return `${index + 1}. [${item.text}] → ${item.href}`;
  }).join('\n');
}

/**
 * Format forms
 */
function formatForms(forms: PageContent['forms']): string {
  if (forms.length === 0) return 'None';
  
  return forms.map((form, index) => {
    const parts: string[] = [`Form ${index + 1}${form.id ? ` (#${form.id})` : ''}:`];
    
    if (form.action) parts.push(`  Action: ${form.action}`);
    if (form.method) parts.push(`  Method: ${form.method.toUpperCase()}`);
    
    if (form.fields.length > 0) {
      parts.push('  Fields:');
      form.fields.forEach((field) => {
        const fieldParts: string[] = ['    -'];
        
        if (field.type === 'button') {
          fieldParts.push(`[${field.text || 'Submit'}]`);
          fieldParts.push('button');
        } else if (field.type === 'input') {
          fieldParts.push(`[${field.label || field.placeholder || 'Input'}]`);
          fieldParts.push(field.inputType || 'text');
          if (field.required) fieldParts.push('(required)');
        } else if (field.type === 'select') {
          fieldParts.push(`[${field.label || 'Select'}]`);
          fieldParts.push('dropdown');
        } else if (field.type === 'textarea') {
          fieldParts.push(`[${field.label || 'Text'}]`);
          fieldParts.push('textarea');
        }
        
        parts.push(fieldParts.join(' '));
      });
    }
    
    return parts.join('\n');
  }).join('\n\n');
}

/**
 * Format landmarks
 */
function formatLandmarks(landmarks: PageContent['landmarks']): string {
  if (landmarks.length === 0) return 'None detected';
  
  const items = limitItems(landmarks, 20);
  
  return items.map((lm) => {
    const parts: string[] = [`- ${lm.role}`];
    if (lm.label) parts.push(`(label: "${lm.label}")`);
    if (lm.text) parts.push(`- "${lm.text.slice(0, 100)}${lm.text.length > 100 ? '...' : ''}"`);
    return parts.join(' ');
  }).join('\n');
}

/**
 * Build the structured context section
 */
function buildStructuredContext(page: PageContent): string {
  const sections: string[] = [];
  
  // Page Overview
  sections.push('## PAGE STRUCTURE');
  sections.push('');
  sections.push(`**URL:** ${page.url}`);
  sections.push(`**Title:** ${page.title}`);
  if (page.byline) sections.push(`**Author:** ${page.byline}`);
  if (page.excerpt) sections.push(`**Summary:** ${page.excerpt}`);
  sections.push('');
  
  // Headings
  sections.push('### Document Outline (Headings)');
  sections.push(formatHeadings(page.headings));
  sections.push('');
  
  // Navigation
  sections.push('### Navigation');
  sections.push(formatNavigation(page.navigation));
  sections.push('');
  
  // Landmarks
  sections.push('### Page Landmarks (ARIA)');
  sections.push(formatLandmarks(page.landmarks));
  sections.push('');
  
  // Interactive Elements
  if (page.interactiveElements.length > 0) {
    sections.push('### Interactive Elements');
    sections.push(`Found ${page.interactiveElements.length} interactive elements:`);
    sections.push(formatInteractiveElements(page.interactiveElements));
    sections.push('');
  }
  
  // Forms
  if (page.forms.length > 0) {
    sections.push('### Forms');
    sections.push(formatForms(page.forms));
    sections.push('');
  }
  
  // Content stats
  sections.push('---');
  sections.push(`**Content Length:** ${page.content.length} characters`);
  sections.push(`**Navigation Links:** ${page.navigation.length}`);
  sections.push(`**Interactive Elements:** ${page.interactiveElements.length}`);
  sections.push(`**Forms:** ${page.forms.length}`);
  sections.push(`**Landmarks:** ${page.landmarks.length}`);
  
  return sections.join('\n');
}

export function buildSummarizePrompt(page: PageContent): {
  system: string;
  user: string;
} {
  const structuredContext = buildStructuredContext(page);
  
  return {
    system:
      'You are Vessel, an AI browsing assistant. Analyze the provided web page context and provide a comprehensive summary. Use the structured page information (headings, navigation, interactive elements) to understand the page organization.',
    user: `${structuredContext}

## PAGE CONTENT

${truncateContent(page.content)}

---

**Task:** Summarize this web page based on the structure and content above. Identify the main purpose, key sections, and important interactive elements.`,
  };
}

export function buildQuestionPrompt(
  page: PageContent,
  question: string,
): { system: string; user: string } {
  const structuredContext = buildStructuredContext(page);
  
  return {
    system:
      'You are Vessel, an AI browsing assistant. Use the provided page structure and content to answer questions accurately. You can reference specific elements by their labels or positions.',
    user: `${structuredContext}

## PAGE CONTENT

${truncateContent(page.content)}

---

**Question:** ${question}

**Instructions:** Answer based on the page structure and content above. If the question asks about interactive elements, forms, or navigation, use the structured context to provide specific details.`,
  };
}

export function buildGeneralPrompt(query: string): {
  system: string;
  user: string;
} {
  return {
    system:
      'You are Vessel, an AI browsing assistant. Help the user with their browsing needs. Be concise and helpful.',
    user: query,
  };
}
