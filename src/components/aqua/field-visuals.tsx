"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export type Habitat = "water" | "land" | "air";

/** Original, illustrative terrain. It never represents a participant's location. */
export function FieldScene({ habitat = "water" }: { habitat?: Habitat }) {
  const id = useId().replaceAll(":", "");
  return (
    <svg className={`field-scene field-scene-${habitat}`} viewBox="0 0 640 420" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-land`} x1="150" y1="100" x2="480" y2="340" gradientUnits="userSpaceOnUse">
          <stop stopColor="#d9edb4" /><stop offset="1" stopColor="#7ea779" />
        </linearGradient>
        <linearGradient id={`${id}-water`} x1="280" y1="150" x2="300" y2="360" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9ce2d8" /><stop offset="1" stopColor="#319487" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="18" stdDeviation="14" floodColor="#123d32" floodOpacity=".18" /></filter>
      </defs>
      <ellipse cx="322" cy="359" rx="231" ry="29" fill="#183f2e" opacity=".07" />
      <g className="terrain-island" filter={`url(#${id}-shadow)`}>
        <path d="m67 232 254-134 254 134v36L321 399 67 267Z" fill="#627e59" />
        <path d="m67 232 254 130v37L67 267Z" fill="#345947" />
        <path d="m321 98 254 134-254 130L67 232Z" fill={`url(#${id}-land)`} />
        <path d="M67 232 321 98l254 134-254 130L67 232Z" stroke="#e3f0ca" strokeWidth="2" />
        <path d="m133 232 188-98 188 98-188 96-188-96Zm37 0 151-78 151 78-151 77-151-77Z" stroke="#f6f8dc" opacity=".3" />
        <path d="M289 115c-39 34 21 50-4 73-27 24-121 4-127 39-6 34 108 37 116 62 6 20-8 31-36 31l58 30c54-19 53-48 33-67-30-30-111-27-110-54 1-24 89-4 117-31 30-29-28-47-13-84l-2-16Z" fill={`url(#${id}-water)`} />
        <path className="river-current" d="M300 123c-21 34 25 49 6 68-24 24-116 5-122 37-4 25 103 38 121 66 11 18-1 32-15 38" stroke="#e6ffed" strokeWidth="2" strokeDasharray="8 15" opacity=".7" />
        <path d="m345 135 47-48 77 96-68 26-56-74Z" fill="#789577" />
        <path d="m392 87 77 96-36-10-25-49-16-37Z" fill="#365e4d" />
        <path d="m392 87-17 18 13 1 9 12 11 6-16-37Z" fill="#f1f0d8" />
        <path d="m420 241 70-37 34 18-69 38-35-19Z" fill="#bad29a" stroke="#dceabc" />
        <g className="terrain-trees">
          {[[150,199,1],[191,173,.8],[231,152,.65],[395,268,1.05],[448,247,.85],[485,230,.65],[357,295,.7]].map(([x,y,s],n)=>(
            <g key={n} transform={`translate(${x} ${y}) scale(${s})`}>
              <ellipse cx="10" cy="7" rx="24" ry="8" fill="#305843" opacity=".13" />
              <path d="M0-30V3" stroke="#5a6944" strokeWidth="5" />
              <path d="m0-76 24 48h-10l16 27H-30l16-27h-10Z" fill={n % 2 ? "#447655" : "#245440"} />
              <path d="M0-76v75H-30l16-27h-10Z" fill="#376849" />
            </g>
          ))}
        </g>
        <g className="terrain-beacon" transform={habitat === "land" ? "translate(414 244)" : habitat === "air" ? "translate(344 167)" : "translate(244 242)"}>
          <ellipse rx="33" ry="16" stroke="#f3ffcb" strokeWidth="2" />
          <ellipse className="beacon-ring" rx="45" ry="23" stroke="#f3ffcb" opacity=".6" />
          <path d="M0 0v-48" stroke="#f3ffcb" strokeDasharray="3 4" />
          <circle cy="-53" r="9" fill="#daff80" stroke="#183f2e" strokeWidth="3" />
        </g>
      </g>
      <g className="terrain-cloud" fill="#fff" opacity=".88">
        <path d="M96 112c-15 0-17-19-4-24 0-22 34-27 44-10 22-6 33 13 25 25 12 15-5 20-20 14Z" />
        <path d="M450 78c-9-9 0-24 13-22 5-25 38-25 47-7 19-2 27 14 18 25Z" />
      </g>
      <g stroke="#2c5442" strokeWidth="2" strokeLinecap="round" opacity=".7"><path d="m211 91 8 3 7-5m207 19 8 3 7-5" /></g>
    </svg>
  );
}

export function SignalOrbit() {
  return <svg className="signal-orbit" viewBox="0 0 200 200" fill="none" aria-hidden="true">
    <circle cx="100" cy="100" r="83" stroke="currentColor" strokeDasharray="2 7" />
    <ellipse cx="100" cy="100" rx="83" ry="37" stroke="currentColor" transform="rotate(-35 100 100)" />
    <ellipse cx="100" cy="100" rx="83" ry="37" stroke="currentColor" transform="rotate(35 100 100)" />
    <circle cx="100" cy="100" r="23" fill="currentColor" fillOpacity=".1" />
    <path d="M88 100h24m-12-12v24" stroke="currentColor" strokeWidth="2" />
    <circle cx="32" cy="147" r="7" fill="currentColor" />
  </svg>;
}

export function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || !window.IntersectionObserver || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        element.dataset.revealed = "true";
        observer.disconnect();
      }
    }, { threshold: .1 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={`field-reveal ${className}`}>{children}</div>;
}
