import { dialog, BrowserWindow } from "electron";

export interface HumanVaultConsentRequest {
  action: "list" | "fill" | "remove";
  entryId?: string;
  title?: string;
  username?: string;
  domain?: string;
}

export interface HumanVaultConsentResult {
  approved: boolean;
}

export async function requestHumanVaultConsent(
  request: HumanVaultConsentRequest,
): Promise<HumanVaultConsentResult> {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  const parentWindow = focusedWindow ?? BrowserWindow.getAllWindows()[0] ?? null;
  if (!parentWindow) {
    return { approved: false };
  }

  const actionLabel =
    request.action === "list"
      ? "view saved password metadata"
      : request.action === "fill"
        ? "fill a saved password"
        : "delete a saved password";

  const detail = [
    `Action: ${actionLabel}`,
    request.title ? `Credential: ${request.title}` : "",
    request.username ? `Username: ${request.username}` : "",
    request.domain ? `Site: ${request.domain}` : "",
    "",
    "Password values will not be sent to the AI provider.",
  ]
    .filter(Boolean)
    .join("\n");

  const { response } = await dialog.showMessageBox(parentWindow, {
    type: "question",
    title: "Human Password Manager Access",
    message: "Allow agent access to your saved passwords?",
    detail,
    buttons: ["Deny", "Allow Once"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });

  return { approved: response === 1 };
}