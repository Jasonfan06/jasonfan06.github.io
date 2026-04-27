import { setupThemeButton } from './theme-button/controller.js';
import { cloneThemeButtonTemplate } from './theme-button/template.js';

class ThemeButton extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this._controller = null;
    }

    connectedCallback() {
        if (!this.shadowRoot) return;

        this.shadowRoot.innerHTML = "";
        this.shadowRoot.appendChild(cloneThemeButtonTemplate());

        const container = this.shadowRoot.querySelector(".container");
        const sizeAttr = parseFloat(this.getAttribute("size")) || 3;
        container.style.fontSize = `${(sizeAttr / 3).toFixed(2)}px`;

        const initialTheme = window.__INITIAL_THEME || this.getAttribute("value") || "light";

        this._controller = setupThemeButton(container, initialTheme, (detail) => {
            this.dispatchEvent(new CustomEvent("change", { detail }));
        });
    }

    disconnectedCallback() {
        if (this._controller) {
            this._controller.destroy();
        }
    }

    /**
     * Allow scripts to sync the visual state without retriggering events.
     * @param {'light'|'dark'} theme
     * @param {boolean} emitEvent
     */
    setTheme(theme, emitEvent = true) {
        if (this._controller) {
            this._controller.setTheme(theme, emitEvent);
        }
    }
}

customElements.define("theme-button", ThemeButton);
