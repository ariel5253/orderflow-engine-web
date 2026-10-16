/*
 * The three defect rules of SPEC §10.2, measured on the real layout of a rendered screen (headless Chromium):
 * no truncated text, the action bar reachable at the bottom, and product images as identical squares.
 */

const TOLERANCE = 0.5;

export function horizontalOverflow(): number {
  return Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth;
}

/** Text nodes with visible characters that are not inside a ui-text. */
export function textOutsideUiText(root: Element): string[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const outside: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim();
    if (text && !node.parentElement?.closest('ui-text')) {
      outside.push(text);
    }
  }
  return outside;
}

/**
 * Every ui-text that is cut or pushed out: content wider than its box, content taller than a box that clips it, a box
 * that leaves its parent or the viewport, or a box that leaves an ancestor that clips its overflow (a max-height with
 * overflow: hidden on a wrapper cuts lines without touching the ui-text itself).
 */
export function clippedUiText(root: Element): string[] {
  const clipped: string[] = [];
  for (const text of Array.from(root.querySelectorAll('ui-text'))) {
    const box = text.getBoundingClientRect();
    const parent = text.parentElement!.getBoundingClientRect();
    const reasons: string[] = [];
    if (text.scrollWidth > text.clientWidth + TOLERANCE) {
      reasons.push(`wider than its box: ${text.scrollWidth} > ${text.clientWidth}`);
    }
    if (getComputedStyle(text).overflowY !== 'visible' && text.scrollHeight > text.clientHeight + TOLERANCE) {
      reasons.push(`taller than its clipping box: ${text.scrollHeight} > ${text.clientHeight}`);
    }
    if (box.left < -TOLERANCE || box.right > window.innerWidth + TOLERANCE) {
      reasons.push('outside the viewport');
    }
    if (box.right > parent.right + TOLERANCE) {
      reasons.push('wider than its parent');
    }
    const clipper = clippingAncestor(text, box);
    if (clipper) {
      reasons.push(`cut by ${describe(clipper)}`);
    }
    if (reasons.length) {
      clipped.push(`${text.textContent?.trim()} (${reasons.join('; ')})`);
    }
  }
  return clipped;
}

/**
 * The nearest ancestor that clips its overflow on an axis the box leaves. The walk stops below body: the viewport is
 * checked on its own, and content below the fold is reached by scrolling the page.
 */
function clippingAncestor(element: Element, box: DOMRect): Element | null {
  for (let ancestor = element.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    const edge = ancestor.getBoundingClientRect();
    const cutsX =
      style.overflowX !== 'visible' && (box.left < edge.left - TOLERANCE || box.right > edge.right + TOLERANCE);
    const cutsY =
      style.overflowY !== 'visible' && (box.top < edge.top - TOLERANCE || box.bottom > edge.bottom + TOLERANCE);
    if (cutsX || cutsY) {
      return ancestor;
    }
  }
  return null;
}

function describe(element: Element | null): string {
  if (!element) {
    return 'nothing';
  }
  const classes = Array.from(element.classList).map((name) => `.${name}`).join('');
  return `${element.tagName.toLowerCase()}${classes}`;
}

/** Elements that would cut text: an ellipsis or a line clamp. */
export function truncatingElements(root: Element): string[] {
  const found: string[] = [];
  for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
    const style = getComputedStyle(element);
    if (style.textOverflow === 'ellipsis' || (style.webkitLineClamp && style.webkitLineClamp !== 'none')) {
      found.push(element.tagName.toLowerCase());
    }
  }
  return found;
}

/** Amounts (ui-text.amount) that wrap onto more than one line. */
export function splitAmounts(root: Element): string[] {
  const split: string[] = [];
  for (const amount of Array.from(root.querySelectorAll('ui-text.amount'))) {
    const range = document.createRange();
    range.selectNodeContents(amount);
    const lineTops = new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top)));
    if (lineTops.size > 1) {
      split.push(amount.textContent?.trim() ?? '');
    }
  }
  return split;
}

/** How far the action bar's bottom edge is from the bottom of the viewport. */
export function actionBarGap(root: Element): number {
  return Math.abs(window.innerHeight - actionBar(root).getBoundingClientRect().bottom);
}

/** Why the action bar cannot be seen or tapped: hidden, transparent, or covered at its centre by something else. */
export function actionBarObstructions(root: Element): string[] {
  const bar = actionBar(root);
  const problems: string[] = [];
  if (!bar.checkVisibility({ visibilityProperty: true, opacityProperty: true })) {
    problems.push('not visible');
  }
  const box = bar.getBoundingClientRect();
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  if (!hit || !bar.contains(hit)) {
    problems.push(`covered at its centre by ${describe(hit)}`);
  }
  return problems;
}

function actionBar(root: Element): Element {
  const bar = root.querySelector('ui-action-bar');
  if (!bar) {
    throw new Error('The screen has no ui-action-bar');
  }
  return bar;
}

/** The sizes of every product image box; all must be the same square. */
export function productImageBoxes(root: Element): { width: number; height: number }[] {
  return Array.from(root.querySelectorAll('ui-product-image')).map((image) => {
    const { width, height } = image.getBoundingClientRect();
    return { width: Math.round(width * 10) / 10, height: Math.round(height * 10) / 10 };
  });
}
