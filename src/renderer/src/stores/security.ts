import { createSignal } from "solid-js";
import type { SecurityState } from "../../../shared/types";

const [securityStates, setSecurityStates] = createSignal<Record<string, SecurityState>>({});

let unsubscribe: (() => void) | null = null;

export function initSecurityStore(): void {
  if (unsubscribe) return;
  unsubscribe = window.vessel.security.onStateUpdate((tabId, state) => {
    setSecurityStates((prev) => ({ ...prev, [tabId]: state }));
  });
}

export function useSecurity() {
  return {
    securityStates,
    getSecurityState(tabId: string): SecurityState | undefined {
      return securityStates()[tabId];
    },
    proceedAnyway(tabId: string): void {
      void window.vessel.security.proceedAnyway(tabId);
    },
    goBackToSafety(tabId: string): void {
      void window.vessel.security.goBackToSafety(tabId);
    },
  };
}
