import { type Component } from "solid-js";
import type { SecurityState } from "../../../../shared/types";

interface SecurityPopupProps {
  state: SecurityState;
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

  return (
    <div class="security-popup" onClick={(e) => e.stopPropagation()}>
      <div class="security-popup-content">
        <p class="security-popup-text">{statusText()}</p>
        <button class="security-popup-link" onClick={handleLearnMore}>
          Learn More
        </button>
      </div>
    </div>
  );
};

export default SecurityPopup;