import { type Component, onMount, onCleanup } from "solid-js";
import type { SecurityState } from "../../../../shared/types";

interface SecurityPopupProps {
  state: SecurityState;
  tabId: string;
  onClose: () => void;
}

const SecurityPopup: Component<SecurityPopupProps> = (props) => {
  const statusText = () => {
    switch (props.state.status) {
      case "secure":
        return "Connection is secure. This site uses HTTPS.";
      case "insecure":
        return "Connection is not secure. Information sent to this site could be read by others.";
      case "error":
        return `Certificate error: ${props.state.errorMessage || "Unknown error"}. Proceed with caution.`;
      default:
        return "No security information available.";
    }
  };

  const handleLearnMore = () => {
    window.vessel.security.showDetails(props.state);
    props.onClose();
  };

  const handleProceedAnyway = () => {
    window.vessel.security.proceedAnyway(props.tabId);
    props.onClose();
  };

  const handleGoBackToSafety = () => {
    window.vessel.security.goBackToSafety(props.tabId);
    props.onClose();
  };

  onMount(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".security-indicator-wrapper")) {
        props.onClose();
      }
    };
    document.addEventListener("click", handleClickOutside, true);
    onCleanup(() => document.removeEventListener("click", handleClickOutside, true));
  });

  return (
    <div class="security-popup" onClick={(e) => e.stopPropagation()}>
      <div class="security-popup-content">
        <p class="security-popup-text">{statusText()}</p>
        <button class="security-popup-link" onClick={handleLearnMore}>
          Learn More
        </button>
        {props.state.canProceed && (
          <div class="security-popup-actions">
            <button class="security-popup-action-proceed" onClick={handleProceedAnyway}>
              Proceed Anyway
            </button>
            <button class="security-popup-action-back" onClick={handleGoBackToSafety}>
              Go Back to Safety
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SecurityPopup;
