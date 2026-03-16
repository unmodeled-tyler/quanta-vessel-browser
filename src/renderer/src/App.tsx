import { onMount, onCleanup, Show, type Component } from "solid-js";
import TitleBar from "./components/chrome/TitleBar";
import TabBar from "./components/chrome/TabBar";
import AddressBar from "./components/chrome/AddressBar";
import BookmarkNotifications from "./components/chrome/BookmarkNotifications";
import AgentTranscriptDock from "./components/chrome/AgentTranscriptDock";
import CommandBar from "./components/ai/CommandBar";
import Sidebar from "./components/ai/Sidebar";
import Settings from "./components/shared/Settings";
import { useUI } from "./stores/ui";
import { useTabs } from "./stores/tabs";
import { setupKeybindings } from "./lib/keybindings";

const App: Component = () => {
  const view =
    new URLSearchParams(window.location.search).get("view") || "chrome";
  const {
    openCommandBar,
    toggleSidebar,
    toggleFocusMode,
    openSettings,
    focusMode,
  } = useUI();
  const { createTab, closeTab, activeTabId, activeTab } = useTabs();

  onMount(() => {
    if (view !== "chrome") return;

    const cleanup = setupKeybindings({
      openCommandBar,
      toggleSidebar,
      toggleFocusMode,
      newTab: () => createTab(),
      closeTab: () => {
        const id = activeTabId();
        if (id) closeTab(id);
      },
      openSettings,
    });
    onCleanup(cleanup);
  });

  if (view === "sidebar") {
    return <Sidebar forceOpen />;
  }

  return (
    <div class="app" classList={{ "focus-mode": focusMode() }}>
      <BookmarkNotifications />
      <AgentTranscriptDock />
      <div class="chrome">
        <TitleBar />
        <TabBar />
        <AddressBar />
        <Show when={activeTab()?.isLoading}>
          <div class="loading-bar" />
        </Show>
      </div>
      <CommandBar />
      <Settings />
    </div>
  );
};

export default App;
