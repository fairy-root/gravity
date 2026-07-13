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

/** Aspect-ratio icon (Material Symbols style, 960 grid) */
const ASPECT_ICON_PATH =
  'M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200zm0-80h560v-560H200v560zm80-80h200v-80H280v80zm0-160h400v-80H280v80zm0-160h400v-80H280v80z';

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
      super(parent, controls, ASPECT_ICON_PATH);

      this.button.classList.add('shaka-aspect-ratio-button');
      this.button.classList.add('shaka-tooltip');
      this.menu.classList.add('shaka-aspect-ratio-menu');

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
