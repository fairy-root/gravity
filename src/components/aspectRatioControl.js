/**
 * Custom Shaka UI control: aspect ratio modes.
 * Modes cycle on each click (no dropdown): fill → fill-width → original → …
 *
 * Register once before creating shaka.ui.Overlay, then include
 * 'aspect_ratio' in controlPanelElements.
 */

const STORAGE_KEY = 'gravity_aspect_ratio';

/** Cycle order when the control button is clicked */
const MODES = [
  { id: 'fill', label: 'Fill' },
  { id: 'fill-width', label: 'Fill Width' },
  { id: 'original', label: 'Original' },
];

const DEFAULT_MODE = 'original';

/**
 * Custom aspect-ratio icon (24×24).
 * Uses currentColor so it matches the control bar.
 */
const ASPECT_ICON_SVG = `
  <path d="M4 6V12H6V8L10 8V6H4Z" fill="currentColor"/>
  <path d="M20 18H14V16H18V12H20V18Z" fill="currentColor"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M4 2C1.79086 2 0 3.79086 0 6V18C0 20.2091 1.79086 22 4 22H20C22.2091 22 24 20.2091 24 18V6C24 3.79086 22.2091 2 20 2H4ZM20 4H4C2.89543 4 2 4.89543 2 6V18C2 19.1046 2.89543 20 4 20H20C21.1046 20 22 19.1046 22 18V6C22 4.89543 21.1046 4 20 4Z" fill="currentColor"/>
`.trim();

/**
 * Build the aspect icon SVG element.
 * @returns {SVGSVGElement}
 */
function createAspectIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('shaka-aspect-ratio-icon');
  svg.innerHTML = ASPECT_ICON_SVG;
  return svg;
}

let registered = false;

export function getStoredAspectRatio() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (MODES.some((m) => m.id === v)) return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_MODE;
}

export function setStoredAspectRatio(mode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/**
 * Apply aspect mode class to the video container.
 * @param {HTMLElement|null} container
 * @param {string} mode
 */
export function applyAspectRatio(container, mode) {
  if (!container) return;
  const resolved = MODES.some((m) => m.id === mode) ? mode : DEFAULT_MODE;
  container.classList.remove(
    'aspect-original',
    'aspect-fill',
    'aspect-fill-width'
  );
  container.classList.add(`aspect-${resolved}`);
  container.dataset.aspectRatio = resolved;
}

/**
 * Next mode in the cycle after `current`.
 * @param {string} current
 * @returns {string}
 */
export function nextAspectRatioMode(current) {
  const idx = MODES.findIndex((m) => m.id === current);
  const next = MODES[(idx >= 0 ? idx + 1 : 0) % MODES.length];
  return next.id;
}

/**
 * @param {string} mode
 * @returns {string}
 */
function modeLabel(mode) {
  return MODES.find((m) => m.id === mode)?.label || 'Original';
}

/**
 * Register the custom control with Shaka (idempotent).
 * Simple button — each click advances Fill → Fill Width → Original.
 * @param {*} shaka
 */
export function registerAspectRatioControl(shaka) {
  if (registered) return;
  registered = true;

  const Element = shaka.ui?.Element;
  if (!Element || !shaka.ui.Controls?.registerElement) {
    console.warn('[Gravity] Shaka UI Element/Controls unavailable; aspect ratio control not registered');
    return;
  }

  class AspectRatioButton extends Element {
    /**
     * @param {HTMLElement} parent
     * @param {*} controls
     */
    constructor(parent, controls) {
      super(parent, controls);

      /** @type {HTMLButtonElement} */
      this.button = document.createElement('button');
      this.button.type = 'button';
      this.button.classList.add('shaka-aspect-ratio-button');
      this.button.classList.add('shaka-tooltip');
      this.button.appendChild(createAspectIcon());

      this.parent.appendChild(this.button);

      /** @type {HTMLElement|null} */
      this.containerEl_ = this.resolveContainer_();

      this.applyMode_(getStoredAspectRatio());

      this.eventManager.listen(this.button, 'click', () => {
        // Match other Shaka controls: ignore clicks while controls are hidden
        try {
          if (this.controls && typeof this.controls.isOpaque === 'function' && !this.controls.isOpaque()) {
            return;
          }
        } catch {
          /* ignore */
        }
        this.cycleMode_();
      });

      this.eventManager.listen(this.localization, 'locale-updated', () => {
        this.refreshLabel_();
      });
      this.eventManager.listen(this.localization, 'locale-changed', () => {
        this.refreshLabel_();
      });
    }

    /** @private */
    resolveContainer_() {
      const video = this.video;
      if (!video) return null;
      return video.closest('.video-container') || video.parentElement;
    }

    /** @private */
    cycleMode_() {
      const current = getStoredAspectRatio();
      this.applyMode_(nextAspectRatioMode(current));
    }

    /**
     * @param {string} mode
     * @private
     */
    applyMode_(mode) {
      const resolved = MODES.some((m) => m.id === mode) ? mode : DEFAULT_MODE;
      if (!this.containerEl_) {
        this.containerEl_ = this.resolveContainer_();
      }
      applyAspectRatio(this.containerEl_, resolved);
      setStoredAspectRatio(resolved);
      this.refreshLabel_();
    }

    /** @private */
    refreshLabel_() {
      const mode = getStoredAspectRatio();
      const label = modeLabel(mode);
      // Tooltip / a11y: show current mode and that click cycles
      this.button.setAttribute('shaka-status', label);
      this.button.setAttribute('aria-label', `Aspect ratio: ${label}. Click to change.`);
      this.button.setAttribute('title', `Aspect: ${label}`);
    }
  }

  class Factory {
    /**
     * @param {HTMLElement} rootElement
     * @param {*} controls
     */
    create(rootElement, controls) {
      return new AspectRatioButton(rootElement, controls);
    }
  }

  shaka.ui.Controls.registerElement('aspect_ratio', new Factory());
}
