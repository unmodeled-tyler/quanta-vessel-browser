// Content script preload — injected into web page views
// Provides readability-based content extraction + structured context for AI agents

import { Readability } from '@mozilla/readability';

// Types matching the main process
interface InteractiveElement {
  type: 'button' | 'link' | 'input' | 'select' | 'textarea';
  text?: string;
  label?: string;
  href?: string;
  inputType?: string;
  placeholder?: string;
  required?: boolean;
  context?: string;
  selector?: string;
  index?: number;
}

/**
 * Generate a unique CSS selector for an element
 */
function generateSelector(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`;

  const testId = el.getAttribute('data-testid');
  if (testId) return `[data-testid="${CSS.escape(testId)}"]`;

  // Build a path-based selector
  const parts: string[] = [];
  let current: Element | null = el;
  for (let depth = 0; current && current !== document.body && depth < 4; depth++) {
    const tag = current.tagName.toLowerCase();
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(c => c.tagName === current!.tagName);
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current) + 1;
        parts.unshift(`${tag}:nth-of-type(${idx})`);
      } else {
        parts.unshift(tag);
      }
    } else {
      parts.unshift(tag);
    }
    current = parent;
  }
  return parts.join(' > ');
}

// Global element index counter, reset on each extraction
let elementIndex = 0;
// Selector map stored on window for agent lookups
const elementSelectors: Record<number, string> = {};

function assignIndex(el: Element): number {
  elementIndex++;
  elementSelectors[elementIndex] = generateSelector(el);
  return elementIndex;
}

interface HeadingStructure {
  level: number;
  text: string;
}

interface SemanticSection {
  type: string;
  role?: string;
  label?: string;
  elements: InteractiveElement[];
}

interface PageContent {
  title: string;
  content: string;
  htmlContent: string;
  byline: string;
  excerpt: string;
  url: string;
  headings: HeadingStructure[];
  navigation: InteractiveElement[];
  interactiveElements: InteractiveElement[];
  forms: Array<{
    id?: string;
    action?: string;
    method?: string;
    fields: InteractiveElement[];
  }>;
  landmarks: Array<{
    role: string;
    label?: string;
    text?: string;
  }>;
}

/**
 * Extract all headings (h1-h6) from the page
 */
function extractHeadings(): HeadingStructure[] {
  const headings: HeadingStructure[] = [];
  const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  
  headingElements.forEach((el) => {
    const level = parseInt(el.tagName[1]);
    const text = el.textContent?.trim() || '';
    if (text) {
      headings.push({ level, text });
    }
  });
  
  return headings;
}

/**
 * Get the text context/location of an element (e.g., "nav", "header", "main")
 */
function getElementContext(el: Element): string {
  // Check for semantic parent containers
  let parent = el.parentElement;
  while (parent) {
    const tag = parent.tagName.toLowerCase();
    const role = parent.getAttribute('role');
    
    if (tag === 'nav' || role === 'navigation') return 'nav';
    if (tag === 'header' || role === 'banner') return 'header';
    if (tag === 'main' || role === 'main') return 'main';
    if (tag === 'footer' || role === 'contentinfo') return 'footer';
    if (tag === 'aside' || role === 'complementary') return 'sidebar';
    if (tag === 'article' || role === 'article') return 'article';
    if (tag === 'form') return `form${parent.id ? `#${parent.id}` : ''}`;
    
    parent = parent.parentElement;
  }
  
  return 'content';
}

/**
 * Get the label text for an input element (from label element, aria-label, or aria-labelledby)
 */
function getInputLabel(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string | undefined {
  // Check for associated label
  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label) {
      return label.textContent?.trim();
    }
  }
  
  // Check for parent label
  const parentLabel = el.closest('label');
  if (parentLabel) {
    // Get text content excluding the input itself
    const clone = parentLabel.cloneNode(true) as HTMLElement;
    const inputs = clone.querySelectorAll('input, select, textarea');
    inputs.forEach(input => input.remove());
    const text = clone.textContent?.trim();
    if (text) return text;
  }
  
  // Check aria attributes
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;
  
  const ariaLabelledBy = el.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const labelEl = document.getElementById(ariaLabelledBy);
    if (labelEl) return labelEl.textContent?.trim();
  }
  
  // Check placeholder as fallback
  const placeholder = el.getAttribute('placeholder');
  if (placeholder) return placeholder;
  
  return undefined;
}

/**
 * Extract navigation links (from nav elements or elements with role="navigation")
 */
function extractNavigation(): InteractiveElement[] {
  const navigation: InteractiveElement[] = [];
  
  // Find nav elements
  const navElements = document.querySelectorAll('nav, [role="navigation"], header nav, [role="banner"] nav');
  
  navElements.forEach((nav) => {
    const links = nav.querySelectorAll('a');
    links.forEach((link) => {
      const text = link.textContent?.trim();
      const href = link.getAttribute('href') || '';

      // Skip empty links and anchors
      if (!text || href.startsWith('#')) return;

      navigation.push({
        type: 'link',
        text: text.slice(0, 100),
        href: href.slice(0, 500),
        context: 'nav',
        selector: generateSelector(link),
        index: assignIndex(link),
      });
    });
  });
  
  // Deduplicate by href
  const seen = new Set<string>();
  return navigation.filter((item) => {
    if (seen.has(item.href!)) return false;
    seen.add(item.href!);
    return true;
  });
}

/**
 * Extract all interactive elements (buttons, links, inputs)
 */
function extractInteractiveElements(): InteractiveElement[] {
  const elements: InteractiveElement[] = [];
  
  // Get all interactive elements
  const buttons = document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]');
  const links = document.querySelectorAll('a[href]');
  const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea');
  
  // Process buttons
  buttons.forEach((btn) => {
    const text = btn.textContent?.trim() ||
                 btn.getAttribute('value') ||
                 btn.getAttribute('aria-label') ||
                 'Button';
    elements.push({
      type: 'button',
      text: text.slice(0, 100),
      context: getElementContext(btn),
      selector: generateSelector(btn),
      index: assignIndex(btn),
    });
  });

  // Process links (non-nav)
  links.forEach((link) => {
    const text = link.textContent?.trim();
    const href = link.getAttribute('href') || '';

    // Skip if already in navigation or is an anchor
    if (!text || href.startsWith('#')) return;

    const context = getElementContext(link);
    if (context === 'nav') return; // Skip nav links

    elements.push({
      type: 'link',
      text: text.slice(0, 100),
      href: href.slice(0, 500),
      context,
      selector: generateSelector(link),
      index: assignIndex(link),
    });
  });

  // Process inputs
  inputs.forEach((input) => {
    const tag = input.tagName.toLowerCase();
    const inputEl = input as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

    elements.push({
      type: tag === 'select' ? 'select' : tag === 'textarea' ? 'textarea' : 'input',
      label: getInputLabel(inputEl)?.slice(0, 100),
      inputType: inputEl.getAttribute('type') || undefined,
      placeholder: inputEl.getAttribute('placeholder') || undefined,
      required: inputEl.hasAttribute('required') || undefined,
      context: getElementContext(input),
      selector: generateSelector(input),
      index: assignIndex(input),
    });
  });
  
  return elements;
}

/**
 * Extract all forms with their fields
 */
function extractForms(): Array<{ id?: string; action?: string; method?: string; fields: InteractiveElement[] }> {
  const forms: Array<{ id?: string; action?: string; method?: string; fields: InteractiveElement[] }> = [];
  
  const formElements = document.querySelectorAll('form');
  
  formElements.forEach((form) => {
    const fields: InteractiveElement[] = [];
    
    // Get all form inputs
    const inputs = form.querySelectorAll('input:not([type="hidden"]), select, textarea');
    inputs.forEach((input) => {
      const inputEl = input as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      const tag = input.tagName.toLowerCase();

      fields.push({
        type: tag === 'select' ? 'select' : tag === 'textarea' ? 'textarea' : 'input',
        label: getInputLabel(inputEl)?.slice(0, 100),
        inputType: inputEl.getAttribute('type') || undefined,
        placeholder: inputEl.getAttribute('placeholder') || undefined,
        required: inputEl.hasAttribute('required') || undefined,
        selector: generateSelector(input),
        index: assignIndex(input),
      });
    });

    // Get submit buttons
    const submitButtons = form.querySelectorAll('button[type="submit"], input[type="submit"]');
    submitButtons.forEach((btn) => {
      const text = btn.textContent?.trim() || btn.getAttribute('value') || 'Submit';
      fields.push({
        type: 'button',
        text: text.slice(0, 100),
        selector: generateSelector(btn),
        index: assignIndex(btn),
      });
    });
    
    forms.push({
      id: form.id || undefined,
      action: form.getAttribute('action') || undefined,
      method: form.getAttribute('method') || undefined,
      fields,
    });
  });
  
  return forms;
}

/**
 * Extract ARIA landmarks
 */
function extractLandmarks(): Array<{ role: string; label?: string; text?: string }> {
  const landmarks: Array<{ role: string; label?: string; text?: string }> = [];
  
  // Find elements with landmark roles
  const landmarkSelectors = [
    'header, [role="banner"]',
    'nav, [role="navigation"]',
    'main, [role="main"]',
    'aside, [role="complementary"]',
    'footer, [role="contentinfo"]',
    'article, [role="article"]',
    'section, [role="region"]',
    '[role="search"]',
    '[role="form"]',
  ];
  
  landmarkSelectors.forEach((selector) => {
    const elements = document.querySelectorAll(selector);
    elements.forEach((el) => {
      const role = el.getAttribute('role') || 
                   (el.tagName.toLowerCase() === 'header' ? 'banner' :
                    el.tagName.toLowerCase() === 'nav' ? 'navigation' :
                    el.tagName.toLowerCase() === 'main' ? 'main' :
                    el.tagName.toLowerCase() === 'aside' ? 'complementary' :
                    el.tagName.toLowerCase() === 'footer' ? 'contentinfo' :
                    el.tagName.toLowerCase() === 'article' ? 'article' :
                    el.tagName.toLowerCase() === 'section' ? 'region' : 'generic');
      
      const label = el.getAttribute('aria-label') || 
                    el.getAttribute('aria-labelledby') ||
                    el.id ||
                    undefined;
      
      const text = el.textContent?.trim().slice(0, 200);
      
      landmarks.push({ role, label, text });
    });
  });
  
  return landmarks;
}

/**
 * Main extraction function — called by the main process
 */
(window as any).__vessel_extractContent = (): PageContent => {
  try {
    // Reset element index counter for fresh extraction
    elementIndex = 0;
    for (const key in elementSelectors) delete elementSelectors[key];

    // Get readability content
    const documentClone = document.cloneNode(true) as Document;
    const reader = new Readability(documentClone);
    const article = reader.parse();
    
    // Extract structured context
    const headings = extractHeadings();
    const navigation = extractNavigation();
    const interactiveElements = extractInteractiveElements();
    const forms = extractForms();
    const landmarks = extractLandmarks();
    
    // Store selector map for agent element lookups
    (window as any).__vessel_elementSelectors = { ...elementSelectors };

    return {
      title: article?.title || document.title,
      content: article?.textContent || document.body?.innerText || '',
      htmlContent: article?.content || '',
      byline: article?.byline || '',
      excerpt: article?.excerpt || '',
      url: window.location.href,
      headings,
      navigation,
      interactiveElements,
      forms,
      landmarks,
    };
  } catch (error) {
    console.error('Vessel content extraction error:', error);
    
    // Fallback with basic extraction
    return {
      title: document.title,
      content: document.body?.innerText || '',
      htmlContent: '',
      byline: '',
      excerpt: '',
      url: window.location.href,
      headings: extractHeadings(),
      navigation: [],
      interactiveElements: [],
      forms: [],
      landmarks: [],
    };
  }
};
