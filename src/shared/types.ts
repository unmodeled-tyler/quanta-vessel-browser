export interface TabState {
  id: string;
  title: string;
  url: string;
  favicon: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isReaderMode: boolean;
}

export interface InteractiveElement {
  type: 'button' | 'link' | 'input' | 'select' | 'textarea';
  text?: string;
  label?: string;
  href?: string;
  inputType?: string;
  placeholder?: string;
  required?: boolean;
  context?: string;
  selector?: string;
}

export interface HeadingStructure {
  level: number;
  text: string;
}

export interface SemanticSection {
  type: string;
  role?: string;
  label?: string;
  elements: InteractiveElement[];
}

export interface PageContent {
  title: string;
  content: string;
  htmlContent: string;
  byline: string;
  excerpt: string;
  url: string;
  // New structured context fields
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

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface UIState {
  sidebarOpen: boolean;
  sidebarWidth: number;
  focusMode: boolean;
  settingsOpen: boolean;
}

// --- Provider types ---

export type ProviderId =
  | "anthropic"
  | "openai"
  | "openrouter"
  | "ollama"
  | "mistral"
  | "xai"
  | "google"
  | "custom";

export interface ProviderConfig {
  id: ProviderId;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  defaultModel: string;
  models: string[];
  requiresApiKey: boolean;
  defaultBaseUrl?: string;
  apiKeyPlaceholder: string;
  apiKeyHint: string;
}

export interface ProviderUpdateResult {
  ok: boolean;
  error?: string;
}

export interface ProviderModelsResult {
  ok: boolean;
  models: string[];
  error?: string;
}

export interface VesselSettings {
  provider: ProviderConfig;
  defaultUrl: string;
  theme: "dark";
  sidebarWidth: number;
}
