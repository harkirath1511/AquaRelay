"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { EvidenceStatus } from "@/domain/model";
import { ApiError } from "./api";
import { statuses } from "./data";
import { AccountMenu } from "./account";

export function Icon({
  name = "water",
  size = 22,
}: {
  name?: string;
  size?: number;
}) {
  const paths: Record<string, ReactNode> = {
    water: (
      <>
        <path d="M3 8c3-4 5 4 9 0s6 4 9 0M3 13c3-4 5 4 9 0s6 4 9 0M3 18c3-4 5 4 9 0s6 4 9 0" />
      </>
    ),
    arrow: (
      <>
        <path d="M4 12h15m-6-6 6 6-6 6" />
      </>
    ),
    pin: (
      <>
        <path d="M19 10c0 6-7 11-7 11S5 16 5 10a7 7 0 1 1 14 0Z" />
        <circle cx="12" cy="10" r="2" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    shield: (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    camera: (
      <>
        <path d="M3 7h5l2-3h4l2 3h5v13H3Z" />
        <circle cx="12" cy="13" r="4" />
      </>
    ),
    leaf: (
      <>
        <path d="M5 19C-2 4 13 3 21 3c0 9-2 18-13 15M4 21 16 8" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6l4 2" />
      </>
    ),
    check: <path d="m5 12 4 4L20 5" />,
    map: (
      <>
        <path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.water}
    </svg>
  );
}
export function Header({
  active = "",
  demo = true,
  onMode,
}: {
  active?: string;
  demo?: boolean;
  onMode?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="header">
        <Link className="brand" href="/" aria-label="AquaRelay home">
          <span className="brand-mark">
            <Icon />
          </span>
          Aqua<span>Relay</span>
        </Link>
        <button
          className="menu-toggle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          Menu {open ? "−" : "+"}
        </button>
        <nav className={open ? "nav open" : "nav"} aria-label="Main navigation">
          {[
            ["explore", "Explore"],
            ["missions", "Verification missions"],
            ["impact", "Your impact"],
          ].map(([path, label]) => (
            <Link
              key={path}
              aria-current={active === path ? "page" : undefined}
              href={`/${path}${!demo ? "?mode=live" : ""}`}
            >
              {label}
            </Link>
          ))}
          <Link
            href={`/review${demo ? "" : "?mode=live"}`}
            className="review-link"
          >
            Reviewer workspace <span>↗</span>
          </Link>
        </nav>
        <div className="header-actions">
          <AccountMenu />
          {onMode && (
            <button className="mode-switch" onClick={onMode}>
              {demo ? "Demo" : "Live"}
              <span>⌄</span>
            </button>
          )}
          <Link
            className="button small"
            href={`/report${!demo ? "?mode=live" : ""}`}
          >
            <span>+</span> Report an observation
          </Link>
        </div>
      </header>
    </>
  );
}
export function Badge({ status }: { status: EvidenceStatus }) {
  const s = statuses[status] ?? statuses.early_signal;
  return (
    <span title={s.description} className={`badge ${status}`}>
      <span>{s.icon}</span>
      {s.label}
    </span>
  );
}
export function DemoBanner({
  demo,
  onMode,
}: {
  demo: boolean;
  onMode: () => void;
}) {
  return (
    <div className={`demo-banner ${demo ? "" : "live"}`}>
      <span>
        <span className="dot" />
        {demo ? "DEMONSTRATION" : "LIVE WORKSPACE"}
      </span>
      <p>
        {demo
          ? "Fictional streams. Seeded evidence. A real look at how community verification works."
          : "Connected to AquaRelay APIs. Your account permissions apply."}
      </p>
      <button onClick={onMode}>
        {demo ? "Switch to live data" : "Explore the demo"} <span>↗</span>
      </button>
    </div>
  );
}
export function Safety({
  paused = false,
  state,
  smell = false,
}: {
  paused?: boolean;
  state?: string;
  smell?: boolean;
}) {
  const stopped = paused || state === "missions_paused";
  const flagged = stopped || state === "review_required";
  return (
    <div className={`safety ${flagged ? "warning" : ""}`}>
      <Icon name="shield" />
      <div>
        <strong>
          {stopped
            ? "Safety alert · verification missions paused"
            : flagged
              ? "Safety concern · review required"
              : "Observe from a safe, public place"}
        </strong>
        <p>
          {flagged
            ? `${smell ? "An unusual strong smell was reported." : "A safety concern has been flagged."} Keep your distance; do not approach or sample the water.`
            : "Never enter the water, touch unknown material or put yourself at risk. Evidence status does not tell you whether water is safe."}
        </p>
      </div>
    </div>
  );
}
export function Empty({
  title = "Nothing here yet",
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon name="water" size={36} />
      <h2>{title}</h2>
      <p>
        {children ??
          "Try widening your filters or check back when new evidence is available."}
      </p>
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  const denied = error instanceof ApiError && [401, 403].includes(error.status);
  return (
    <div className="error-state" role="alert">
      <Icon name="shield" size={30} />
      <h2>
        {denied
          ? "This workspace needs permission"
          : "We couldn’t load the evidence"}
      </h2>
      <p>
        {denied
          ? "Sign in with an authorised account to access live data. Reviewer actions require a reviewer role."
          : error.message}
      </p>
      <div className="actions">
        <button className="button" onClick={retry}>
          Try again
        </button>
        {denied && (
          <Link className="button secondary" href="/account">
            Sign in
          </Link>
        )}
      </div>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
      <p>Gathering the evidence…</p>
    </div>
  );
}
export function Footer() {
  return (
    <footer>
      <Link className="brand" href="/">
        <Icon /> AquaRelay
      </Link>
      <p>Small observations. Shared understanding.</p>
      <span>Built for the water we share.</span>
    </footer>
  );
}
