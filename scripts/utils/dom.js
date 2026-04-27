export function onReady(callback) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', callback, { once: true });
        return;
    }

    callback();
}

export function one(selector, root = document) {
    return root.querySelector(selector);
}

export function all(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
}

export function parseCssNumber(name, fallback, root = document.documentElement) {
    const value = getComputedStyle(root).getPropertyValue(name);
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
