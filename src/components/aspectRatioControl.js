/**
 * Custom Shaka UI control: aspect ratio modes.
 * Modes: fill-width | fill | original
 *
 * Register once before creating shaka.ui.Overlay, then include
 * 'aspect_ratio' in controlPanelElements.
 */

const STORAGE_KEY = 'gravity_aspect_ratio';
const MODES = [
  { id: 'fill-width', label: 'Fill Width' },
  { id: 'fill', label: 'Fill' },
  { id: 'original', label: 'Original' },
];

const DEFAULT_MODE = 'original';

/**
 * Custom aspect-ratio icon (24×24). Shaka SettingsMenu only takes a single
 * Material path, so we inject this multi-path SVG after construction.
 * Uses currentColor so it matches the control bar.
 */
const ASPECT_ICON_SVG = `
  <path d="M4 6V12H6V8L10 8V6H4Z" fill="currentColor"/>
  <path d="M20 18H14V16H18V12H20V18Z" fill="currentColor"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M4 2C1.79086 2 0 3.79086 0 6V18C0 20.2091 1.79086 22 4 22H20C22.2091 22 24 20.2091 24 18V6C24 3.79086 22.2091 2 20 2H4ZM20 4H4C2.89543 4 2 4.89543 2 6V18C2 19.1046 2.89543 20 4 20H20C21.1046 20 22 19.1046 22 18V6C22 4.89543 21.1046 4 20 4Z" fill="currentColor"/>
`.trim();

/** Placeholder path for SettingsMenu super() — replaced immediately */
const ASPECT_ICON_PLACEHOLDER = 'M0 0h24v24H0z';

/**
 * Replace Shaka's single-path Material icon with our multi-path SVG.
 * @param {HTMLElement|null} button
 */
function installAspectIcon(button) {
  if (!button) return;
  const svg = button.querySelector('svg');
  if (!svg) return;
  // Size is controlled in CSS (.shaka-aspect-ratio-button svg) so it
  // matches other control icons (Shaka uses 1em @ 24px font-size).
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('shaka-aspect-ratio-icon');
  svg.innerHTML = ASPECT_ICON_SVG;
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
 * Register the custom control with Shaka (idempotent).
 * @param {*} shaka
 */
export function registerAspectRatioControl(shaka) {
  if (registered) return;
  registered = true;

  const SettingsMenu = shaka.ui.SettingsMenu;
  if (!SettingsMenu || !shaka.ui.Controls?.registerElement) {
    console.warn('[Gravity] Shaka SettingsMenu/Controls unavailable; aspect ratio control not registered');
    return;
  }

  class AspectRatioButton extends SettingsMenu {
    /**
     * @param {HTMLElement} parent
     * @param {*} controls
     */
    constructor(parent, controls) {
      super(parent, controls, ASPECT_ICON_PLACEHOLDER);

      this.button.classList.add('shaka-aspect-ratio-button');
      this.button.classList.add('shaka-tooltip');
      this.menu.classList.add('shaka-aspect-ratio-menu');
      installAspectIcon(this.button);

      this.nameSpan.textContent = 'Aspect Ratio';
      this.button.ariaLabel = 'Aspect Ratio';
      if (this.backSpan) this.backSpan.textContent = 'Aspect Ratio';
      if (this.backButton) this.backButton.ariaLabel = 'Back';

      /** @type {HTMLElement|null} */
      this.containerEl_ = this.resolveContainer_();

      this.buildMenu_();
      this.applyMode_(getStoredAspectRatio());

      this.eventManager.listen(this.localization, 'locale-updated', () => {
        this.nameSpan.textContent = 'Aspect Ratio';
        this.button.ariaLabel = 'Aspect Ratio';
      });
      this.eventManager.listen(this.localization, 'locale-changed', () => {
        this.nameSpan.textContent = 'Aspect Ratio';
        this.button.ariaLabel = 'Aspect Ratio';
      });
    }

    /** @private */
    resolveContainer_() {
      const video = this.video;
      if (!video) return null;
      return video.closest('.video-container') || video.parentElement;
    }

    /** @private */
    buildMenu_() {
      MODES.forEach((mode) => {
        const button = document.createElement('button');
        button.classList.add('shaka-aspect-option');
        button.dataset.mode = mode.id;
        button.type = 'button';

        const span = document.createElement('span');
        span.textContent = mode.label;
        button.appendChild(span);

        this.eventManager.listen(button, 'click', () => {
          this.applyMode_(mode.id);
          try {
            this.controls.hideSettingsMenus();
          } catch {
            /* ignore */
          }
        });

        this.menu.appendChild(button);
      });
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

      const label = MODES.find((m) => m.id === resolved)?.label || 'Original';
      if (this.currentSelection) {
        this.currentSelection.textContent = label;
      }
      this.button.setAttribute('shaka-status', label);
      this.button.setAttribute('aria-label', `Aspect Ratio: ${label}`);

      this.menu.querySelectorAll('.shaka-aspect-option').forEach((btn) => {
        const selected = btn.dataset.mode === resolved;
        btn.setAttribute('aria-selected', selected ? 'true' : 'false');
        const span = btn.querySelector('span');
        if (span) {
          span.classList.toggle('shaka-chosen-item', selected);
        }
        btn.querySelectorAll('.shaka-aspect-check').forEach((el) => el.remove());
        if (selected) {
          const check = document.createElement('span');
          check.className = 'shaka-aspect-check';
          check.setAttribute('aria-hidden', 'true');
          check.textContent = '✓';
          btn.appendChild(check);
        }
      });
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
