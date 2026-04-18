import { app, safeStorage } from "electron";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import type { AutofillProfile } from "../../shared/autofill-types";

const SAVE_DEBOUNCE_MS = 250;
const PROFILE_FIELDS = [
  "label",
  "firstName",
  "lastName",
  "email",
  "phone",
  "organization",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "postalCode",
  "country",
] as const;

interface AutofillState {
  profiles: AutofillProfile[];
}

let state: AutofillState | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveDirty = false;

function getFilePath(): string {
  return path.join(app.getPath("userData"), "vessel-autofill.json");
}

function getDefaultState(): AutofillState {
  return { profiles: [] };
}

function canUseSafeStorage(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function normalizeStoredProfile(value: unknown): AutofillProfile | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.createdAt !== "string" ||
    typeof raw.updatedAt !== "string"
  ) {
    return null;
  }

  const profile = {
    id: raw.id,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  } as AutofillProfile;

  for (const field of PROFILE_FIELDS) {
    if (typeof raw[field] !== "string") return null;
    profile[field] = raw[field] as never;
  }

  return profile;
}

function load(): AutofillState {
  if (state) return state;
  try {
    const raw = fs.readFileSync(getFilePath());
    const decoded =
      canUseSafeStorage() && safeStorage.decryptString
        ? safeStorage.decryptString(raw)
        : raw.toString("utf-8");
    const parsed = JSON.parse(decoded) as { profiles?: unknown[] };
    state = {
      profiles: Array.isArray(parsed.profiles)
        ? parsed.profiles
            .map(normalizeStoredProfile)
            .filter((profile): profile is AutofillProfile => profile !== null)
        : [],
    };
  } catch {
    state = getDefaultState();
  }
  return state;
}

function persistNow(): Promise<void> {
  saveDirty = false;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!state) return Promise.resolve();
  const payload = JSON.stringify(state, null, 2);
  const data =
    canUseSafeStorage() && safeStorage.encryptString
      ? safeStorage.encryptString(payload)
      : payload;
  return fs.promises
    .mkdir(path.dirname(getFilePath()), { recursive: true })
    .then(() =>
      fs.promises.writeFile(getFilePath(), data, typeof data === "string" ? { encoding: "utf-8", mode: 0o600 } : { mode: 0o600 }),
    )
    .catch((err) => console.error("[Vessel] Failed to save autofill:", err));
}

function scheduleSave(): void {
  saveDirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (saveDirty) void persistNow();
  }, SAVE_DEBOUNCE_MS);
}

export function listProfiles(): AutofillProfile[] {
  return load().profiles;
}

export function getProfile(id: string): AutofillProfile | undefined {
  return load().profiles.find((p) => p.id === id);
}

export function addProfile(
  input: Omit<AutofillProfile, "id" | "createdAt" | "updatedAt">,
): AutofillProfile {
  const s = load();
  const now = new Date().toISOString();
  const profile: AutofillProfile = {
    ...input,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  s.profiles.push(profile);
  scheduleSave();
  return profile;
}

export function updateProfile(
  id: string,
  updates: Partial<Omit<AutofillProfile, "id" | "createdAt">>,
): AutofillProfile | null {
  const s = load();
  const idx = s.profiles.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  s.profiles[idx] = {
    ...s.profiles[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  scheduleSave();
  return s.profiles[idx];
}

export function deleteProfile(id: string): boolean {
  const s = load();
  const len = s.profiles.length;
  s.profiles = s.profiles.filter((p) => p.id !== id);
  if (s.profiles.length === len) return false;
  scheduleSave();
  return true;
}

export function flushPersist(): Promise<void> {
  return saveDirty ? persistNow() : Promise.resolve();
}
