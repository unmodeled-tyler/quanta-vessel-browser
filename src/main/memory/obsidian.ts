import fs from "node:fs";
import path from "node:path";
import type { PageContent } from "../../shared/types";
import { loadSettings } from "../config/settings";

const DEFAULT_PAGE_FOLDER = "Vessel/Pages";
const DEFAULT_NOTE_FOLDER = "Vessel/Research";
const PAGE_CONTENT_LIMIT = 6000;

export interface SavedMemoryNote {
  title: string;
  absolutePath: string;
  relativePath: string;
}

interface WriteMemoryNoteInput {
  title: string;
  body: string;
  folder?: string;
  tags?: string[];
  frontmatter?: Record<string, string | string[] | undefined>;
}

interface CapturePageNoteInput {
  page: PageContent;
  title?: string;
  folder?: string;
  summary?: string;
  note?: string;
  tags?: string[];
}

function getVaultRoot(): string {
  const configured = loadSettings().obsidianVaultPath.trim();
  if (!configured) {
    throw new Error("Obsidian vault path is not configured in Vessel settings.");
  }
  return path.resolve(configured);
}

function normalizeFolder(folder: string | undefined, fallback: string): string {
  const raw = (folder?.trim() || fallback).replace(/\\/g, "/");
  if (!raw) return fallback;
  if (path.isAbsolute(raw)) {
    throw new Error("Vault note folders must be relative to the vault root.");
  }
  const segments = raw.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Vault note folders cannot traverse outside the vault.");
  }
  return segments.join(path.sep);
}

function escapeYaml(value: string): string {
  return JSON.stringify(value);
}

function renderFrontmatter(
  data: Record<string, string | string[] | undefined>,
): string {
  const lines: string[] = ["---"];
  for (const [key, value] of Object.entries(data)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${escapeYaml(item)}`);
      }
      continue;
    }
    lines.push(`${key}: ${escapeYaml(value)}`);
  }
  lines.push("---", "");
  return lines.join("\n");
}

function slugify(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "note";
}

function buildUniqueNotePath(dir: string, title: string): string {
  const datePrefix = new Date().toISOString().slice(0, 10);
  const slug = slugify(title);
  const base = `${datePrefix}-${slug}`;
  let candidate = `${base}.md`;
  let counter = 2;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${base}-${counter}.md`;
    counter += 1;
  }
  return path.join(dir, candidate);
}

function trimContent(content: string, limit = PAGE_CONTENT_LIMIT): string {
  const cleaned = content.trim();
  if (cleaned.length <= limit) return cleaned;
  return `${cleaned.slice(0, limit)}\n\n[Truncated]`;
}

export function writeMemoryNote({
  title,
  body,
  folder,
  tags = [],
  frontmatter = {},
}: WriteMemoryNoteInput): SavedMemoryNote {
  const vaultRoot = getVaultRoot();
  const relativeFolder = normalizeFolder(folder, DEFAULT_NOTE_FOLDER);
  const targetDir = path.join(vaultRoot, relativeFolder);
  fs.mkdirSync(targetDir, { recursive: true });

  const absolutePath = buildUniqueNotePath(targetDir, title);
  const relativePath = path.relative(vaultRoot, absolutePath);
  const content = [
    renderFrontmatter({
      title,
      created_at: new Date().toISOString(),
      tags,
      ...frontmatter,
    }),
    body.trim(),
    "",
  ].join("\n");

  fs.writeFileSync(absolutePath, content, "utf-8");

  return {
    title,
    absolutePath,
    relativePath: relativePath.split(path.sep).join("/"),
  };
}

export function capturePageToVault({
  page,
  title,
  folder,
  summary,
  note,
  tags = [],
}: CapturePageNoteInput): SavedMemoryNote {
  const noteTitle = title?.trim() || page.title.trim() || page.url;
  const bodyLines = [
    `# ${noteTitle}`,
    "",
    `Source: [${page.title || page.url}](${page.url})`,
    `Captured: ${new Date().toISOString()}`,
  ];

  if (page.byline) {
    bodyLines.push(`Byline: ${page.byline}`);
  }

  bodyLines.push("");

  if (summary?.trim()) {
    bodyLines.push("## Summary", "", summary.trim(), "");
  }

  if (note?.trim()) {
    bodyLines.push("## Research Note", "", note.trim(), "");
  }

  if (page.excerpt.trim()) {
    bodyLines.push("## Excerpt", "", page.excerpt.trim(), "");
  }

  const snapshot = trimContent(page.content);
  if (snapshot) {
    bodyLines.push("## Page Snapshot", "", snapshot, "");
  }

  return writeMemoryNote({
    title: noteTitle,
    body: bodyLines.join("\n"),
    folder: folder || DEFAULT_PAGE_FOLDER,
    tags,
    frontmatter: {
      source_url: page.url,
      source_title: page.title || page.url,
    },
  });
}
