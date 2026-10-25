import { useEffect, useRef, useState } from 'react';
import './aperture.css';

const BLADE_COUNT = 9;
const STEP = (Math.PI * 2) / BLADE_COUNT;
const OUTER_RADIUS = 500;
const BLADE_COLORS = ['#121414', '#101212', '#141616', '#111313', '#151717', '#101212', '#131515', '#111313', '#141616'];

function point(radius, angle) {
  return `${(Math.cos(angle) * radius).toFixed(3)},${(Math.sin(angle) * radius).toFixed(3)}`;
}

function bladePoints(index, radius, rotation) {
  const angle = index * STEP - Math.PI / 2;
  return [
    point(radius, angle + rotation),
    point(radius, angle + STEP + rotation),
    point(OUTER_RADIUS, angle + STEP + 0.38),
    point(OUTER_RADIUS, angle + 0.38)
  ].join(' ');
}

function easeInOut(value) {
  return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
}

/** A decorative, nine-blade iris reveal. Safe to replay with PortfolioAperture.play(). */
export default function Aperture({ brand = 'Canoe' }) {
  const [run, setRun] = useState(0);
  const [visible, setVisible] = useState(true);
  const blades = useRef([]);
  const wordmark = useRef(null);

  useEffect(() => {
    const controller = {
      play() {
        setVisible(true);
        setRun((current) => current + 1);
      }
    };
    window.PortfolioAperture = controller;
    return () => {
      if (window.PortfolioAperture === controller) delete window.PortfolioAperture;
    };
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(false);
      return undefined;
    }

    let frame;
    let startedAt;
    let canceled = false;
    const duration = 1380;
    const delay = 200;

    const paint = (radius, rotation) => {
      blades.current.forEach((blade, index) => {
        blade?.setAttribute('points', bladePoints(index, radius, rotation));
      });
    };

    paint(0, -0.22);
    if (wordmark.current) wordmark.current.style.opacity = '1';
    const animate = (now) => {
      if (canceled) return;
      startedAt ??= now;
      const elapsed = now - startedAt;
      const progress = Math.min(1, Math.max(0, (elapsed - delay) / duration));
      const eased = easeInOut(progress);

      paint(176 * eased, -0.22 + eased * 0.58);
      if (wordmark.current) {
        wordmark.current.style.opacity = String(Math.max(0, 1 - elapsed / 350));
      }

      if (progress < 1) frame = window.requestAnimationFrame(animate);
      else setVisible(false);
    };

    frame = window.requestAnimationFrame(animate);
    // Decorative animation must never obstruct the portfolio after a paused frame.
    const fallback = window.setTimeout(() => setVisible(false), duration + delay + 1200);
    return () => {
      canceled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(fallback);
    };
  }, [run, visible]);

  if (!visible) return null;

  return (
    <div className="aperture-intro" aria-hidden="true">
      <svg
        className="aperture-intro__blades"
        viewBox="-100 -100 200 200"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
      >
        {BLADE_COLORS.map((color, index) => (
          <polygon
            key={index}
            ref={(element) => { blades.current[index] = element; }}
            points={bladePoints(index, 0, -0.22)}
            fill={color}
            stroke="#343737"
            strokeWidth="0.08"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <div className="aperture-intro__signature" ref={wordmark}>
        <span>{brand}</span>
      </div>
    </div>
  );
}
