import { onCleanup } from "solid-js";

/**
 * Adds `scroll-fade`, `fade-top`, and `fade-bottom` classes to a scrollable
 * container based on its scroll position. Pair with the `.scroll-fade` CSS
 * in global.css.
 */
export function useScrollFade(el: HTMLElement): void {
  const update = () => {
    const { scrollTop, scrollHeight, clientHeight } = el;
    const atTop = scrollTop <= 2;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 2;

    el.classList.toggle("fade-top", !atTop);
    el.classList.toggle("fade-bottom", !atBottom);
  };

  el.classList.add("scroll-fade");
  el.addEventListener("scroll", update, { passive: true });

  // Initial check after content renders
  queueMicrotask(update);

  // Re-check when children change
  const observer = new MutationObserver(update);
  observer.observe(el, { childList: true, subtree: true });

  onCleanup(() => {
    el.removeEventListener("scroll", update);
    observer.disconnect();
  });
}
