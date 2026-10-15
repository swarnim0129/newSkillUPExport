/**
 * Scroll an element into view inside its own scrolling panel only.
 *
 * `element.scrollIntoView()` also scrolls every ancestor, including the fixed
 * page shell (whose overflow is hidden), which slides the header and sidebar
 * out of place. This scrolls just the nearest scrollable container.
 */
export function scrollIntoPanel(element: HTMLElement | null, block: 'end' | 'center' | 'start' = 'end') {
  if (!element) return;

  let panel: HTMLElement | null = element.parentElement;
  while (panel) {
    const overflowY = getComputedStyle(panel).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && panel.scrollHeight > panel.clientHeight) break;
    panel = panel.parentElement;
  }
  if (!panel) return;

  const panelBox = panel.getBoundingClientRect();
  const box = element.getBoundingClientRect();
  let offset: number;
  if (block === 'center') offset = box.top - panelBox.top - (panelBox.height - box.height) / 2;
  else if (block === 'start') offset = box.top - panelBox.top;
  else offset = box.bottom - panelBox.bottom;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  panel.scrollBy({ top: offset, behavior: reduceMotion ? 'auto' : 'smooth' });
}
