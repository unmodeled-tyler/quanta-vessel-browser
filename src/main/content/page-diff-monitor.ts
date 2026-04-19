import type { WebContents } from "electron";
import { Channels } from "../../shared/channels";
import type { PageDiff } from "../../shared/page-diff-types";
import { diffSnapshots } from "./page-diff";
import * as pageSnapshots from "./page-snapshots";
import { extractContent } from "./extractor";
import type { SendToRendererViews } from "../ipc/common";

const latestPageDiffs = new Map<string, PageDiff>();
const pendingPageSnapshotTimers = new Map<number, ReturnType<typeof setTimeout>>();

export function getLatestPageDiff(rawUrl: string): PageDiff | null {
  if (!pageSnapshots.shouldTrackSnapshotUrl(rawUrl)) return null;
  return latestPageDiffs.get(pageSnapshots.normalizeUrl(rawUrl)) ?? null;
}

export async function capturePageSnapshot(
  url: string,
  wc: WebContents,
  sendToRendererViews: SendToRendererViews,
): Promise<void> {
  try {
    if (!pageSnapshots.shouldTrackSnapshotUrl(url)) return;
    const key = pageSnapshots.normalizeUrl(url);
    const oldSnap = pageSnapshots.getSnapshot(key);
    const content = await extractContent(wc);
    const textContent = content.content || "";
    const title = content.title || "";
    const headings = content.headings || [];
    const currentHeadings = headings
      .map((h) => `${"#".repeat(h.level)} ${h.text}`)
      .join("\n");

    if (oldSnap) {
      const diff = diffSnapshots(oldSnap, textContent, title, currentHeadings);
      if (diff.hasChanges) {
        latestPageDiffs.set(key, diff);
        sendToRendererViews(Channels.PAGE_CHANGED, diff);
      } else {
        latestPageDiffs.delete(key);
      }
    } else {
      latestPageDiffs.delete(key);
    }

    pageSnapshots.saveSnapshot(url, title, textContent, headings);
  } catch {
    // Snapshot capture is best-effort.
  }
}

export function schedulePageSnapshotCapture(
  wc: WebContents,
  sendToRendererViews: SendToRendererViews,
  delayMs = 1200,
): void {
  if (wc.isDestroyed()) return;

  const wcId = wc.id;
  const existing = pendingPageSnapshotTimers.get(wcId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    pendingPageSnapshotTimers.delete(wcId);
    if (wc.isDestroyed()) return;
    void capturePageSnapshot(wc.getURL(), wc, sendToRendererViews);
  }, delayMs);

  pendingPageSnapshotTimers.set(wcId, timer);
}
