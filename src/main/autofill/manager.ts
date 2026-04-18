import { app } from "electron";
import path from "path";
import { randomUUID } from "crypto";
import type { AutofillProfile } from "../../shared/autofill-types";
import {
  createDebouncedJsonPersistence,
  loadJsonFile,
} from "../persistence/json-file";

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

function getFilePath(): string {
  return path.join(app.getPath("userData"), "vessel-autofill.json");
}

function getDefaultState(): AutofillState {
  return { profiles: [] };
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
  state = loadJsonFile({
    filePath: getFilePath(),
    fallback: getDefaultState(),
    secure: true,
    parse: (raw) => {
      const parsed = raw as { profiles?: unknown[] };
      return {
        profiles: Array.isArray(parsed.profiles)
          ? parsed.profiles
              .map(normalizeStoredProfile)
              .filter((profile): profile is AutofillProfile => profile !== null)
          : [],
      };
    },
  });
  return state;
}

const persistence = createDebouncedJsonPersistence({
  debounceMs: SAVE_DEBOUNCE_MS,
  filePath: getFilePath(),
  getValue: () => state,
  logLabel: "autofill",
  secure: true,
});

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
  persistence.schedule();
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
  persistence.schedule();
  return s.profiles[idx];
}

export function deleteProfile(id: string): boolean {
  const s = load();
  const len = s.profiles.length;
  s.profiles = s.profiles.filter((p) => p.id !== id);
  if (s.profiles.length === len) return false;
  persistence.schedule();
  return true;
}

export function flushPersist(): Promise<void> {
  return persistence.flush();
}
