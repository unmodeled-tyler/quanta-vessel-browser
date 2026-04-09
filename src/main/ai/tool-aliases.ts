const SAFE_TOOL_ALIASES: Record<string, string> = {
  goto_url: "navigate",
  go_to_url: "navigate",
  open_url: "navigate",
  visit_url: "navigate",
  navigate_to: "navigate",
  open_page: "navigate",
  read: "read_page",
  read_current_page: "read_page",
  scan_page: "read_page",
};

export function normalizeToolAlias(name: string): string {
  const normalized = name.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return SAFE_TOOL_ALIASES[normalized] ?? name;
}
