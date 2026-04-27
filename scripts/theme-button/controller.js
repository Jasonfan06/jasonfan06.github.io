import {
    applyDarkHoverState,
    applyDarkRestState,
    applyDarkState,
    applyLightHoverState,
    applyLightRestState,
    applyLightState,
    collectThemeButtonElements
} from './styleState.js';

const CLICK_LOCK_MS = 500;
const CLOUD_DRIFT_INTERVAL_MS = 1000;

function getRandomDirection() {
    return Math.random() > 0.5 ? "2em" : "-2em";
}

function moveElementRandomly(element) {
    const randomDirectionX = getRandomDirection();
    const randomDirectionY = getRandomDirection();
    element.style.transform = `translate(${randomDirectionX}, ${randomDirectionY})`;
}

export function setupThemeButton(root, initialTheme, changeTheme) {
    const elements = collectThemeButtonElements(root);
    let isMoved = false;
    let isClicked = false;

    const performToggle = (emitEvent = true) => {
        if (isMoved) {
            applyLightState(elements);
            if (emitEvent) changeTheme("light");
        } else {
            applyDarkState(elements);
            if (emitEvent) changeTheme("dark");
        }

        isClicked = true;
        window.setTimeout(() => {
            isClicked = false;
        }, CLICK_LOCK_MS);

        isMoved = !isMoved;
    };

    const handleToggle = () => performToggle(true);
    const handleMouseMove = () => {
        if (isClicked) return;

        if (isMoved) {
            applyDarkHoverState(elements);
        } else {
            applyLightHoverState(elements);
        }
    };

    const handleMouseOut = () => {
        if (isClicked) return;

        if (isMoved) {
            applyDarkRestState(elements);
        } else {
            applyLightRestState(elements);
        }
    };

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemChange = (event) => {
        if (event.matches && !isMoved) {
            performToggle(true);
        } else if (!event.matches && isMoved) {
            performToggle(true);
        }
    };

    elements.components.addEventListener("click", handleToggle);
    elements.mainButton.addEventListener("mousemove", handleMouseMove);
    elements.mainButton.addEventListener("mouseout", handleMouseOut);
    mediaQuery.addEventListener("change", handleSystemChange);

    const cloudSons = root.querySelectorAll(".cloud-son");
    const intervalId = window.setInterval(() => {
        cloudSons.forEach(moveElementRandomly);
    }, CLOUD_DRIFT_INTERVAL_MS);

    if (initialTheme === "dark") {
        performToggle(false);
    }

    return {
        setTheme(theme, emitEvent = true) {
            if (theme === "dark" && !isMoved) {
                performToggle(emitEvent);
            } else if (theme === "light" && isMoved) {
                performToggle(emitEvent);
            }
        },
        destroy() {
            elements.components.removeEventListener("click", handleToggle);
            elements.mainButton.removeEventListener("mousemove", handleMouseMove);
            elements.mainButton.removeEventListener("mouseout", handleMouseOut);
            mediaQuery.removeEventListener("change", handleSystemChange);
            window.clearInterval(intervalId);
        }
    };
}
