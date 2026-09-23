"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useState } from "react";
import {
  type Incident,
  foamPhoto,
  titleOf,
  dateLabel,
  statuses,
  humanize,
} from "./data";
import { Badge, Icon, Safety, Empty } from "./ui";
import { EvidenceMap } from "./map";
import { post } from "./api";

export function Investigation({
  incident: i,
  demo,
  refresh,
}: {
  incident: Incident;
  demo: boolean;
  refresh: () => void;
}) {
  const [tab, setTab] = useState("Overview");
  const [assessmentError, setAssessmentError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedObservation, setSelectedObservation] = useState<string>();
  const assessment = [...(i.assessments ?? [])]
    .sort(
      (a, b) =>
        Date.parse(a.completed_at ?? "") - Date.parse(b.completed_at ?? ""),
    )
    .at(-1);
  const result = assessment?.result;
  const observations = [...(i.observations ?? [])].sort(
    (a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at),
  );
  async function assess() {
    setBusy(true);
    setAssessmentError("");
    try {
      await post(`/api/incidents/${i.id}/assess`, {});
      refresh();
    } catch (e) {
      setAssessmentError(
        e instanceof Error ? e.message : "Assessment unavailable",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="investigation-page">
      <Link className="breadcrumb" href={`/explore${demo ? "" : "?mode=live"}`}>
        ← All investigations
      </Link>
      <div className="investigation-heading">
        <div>
          <div className="eyebrow">
            {i.is_demo ? "DEMO INVESTIGATION" : "INVESTIGATION"} ·{" "}
            {i.category.toUpperCase()}
          </div>
          <h1>{titleOf(i)}</h1>
          <p>
            <Icon name="pin" size={16} />
            {i.location_label || "Approximate stream area"}
            <span>Updated {dateLabel(i.updated_at)}</span>
          </p>
        </div>
        <Badge status={i.evidence_status} />
      </div>
      <div
        className="detail-tabs"
        role="tablist"
        aria-label="Investigation sections"
      >
        {["Overview", "Evidence timeline", "Map & observations"].map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
            {t === "Evidence timeline" && <span>{observations.length}</span>}
          </button>
        ))}
      </div>
      <div className="detail-layout">
        <div>
          {tab === "Overview" && (
            <>
              <article className="original-report card">
                {i.is_demo && (
                  <div className="report-photo">
                    <img
                      src={foamPhoto}
                      alt="Generated demo image of white foam collecting beside stones in a fictional stream"
                    />
                    <span className="photo-label">
                      GENERATED DEMO IMAGE · NOT LIVE EVIDENCE
                    </span>
                  </div>
                )}
                {!i.is_demo && observations[0]?.media?.find((m) => m.url) && (
                  <div className="report-photo">
                    <img
                      src={observations[0].media.find((m) => m.url)?.url}
                      alt={observations[0].description}
                    />
                  </div>
                )}
                <div className="card-body">
                  <div className="eyebrow">THE ORIGINAL OBSERVATION</div>
                  <h2>
                    {i.is_demo
                      ? "“White foam is collecting near the footbridge.”"
                      : (observations[0]?.description ??
                        "No observation text available yet.")}
                  </h2>
                  <p>{observations[0]?.description}</p>
                  <div className="author-line">
                    <span className="avatar">{i.is_demo ? "M" : "P"}</span>
                    <div>
                      <strong>
                        {i.is_demo
                          ? "Maya · Community participant"
                          : "Community participant"}
                      </strong>
                      <small>
                        {observations[0]
                          ? dateLabel(observations[0].observed_at)
                          : "Awaiting evidence"}{" "}
                        · Approximate location shared
                      </small>
                    </div>
                  </div>
                </div>
              </article>
              <article className="assessment card">
                <div className="card-body">
                  <div className="split">
                    <div className="eyebrow">
                      <Icon name="water" size={18} />{" "}
                      {i.is_demo
                        ? "DEMO AI ASSESSMENT"
                        : "AI-ASSISTED EVIDENCE SUMMARY"}
                    </div>
                    <span className="muted tiny">For human review</span>
                  </div>
                  {result ? (
                    <>
                      <h2>A clearer picture. Still an open question.</h2>
                      <p>{result.summary?.text}</p>
                      <div className="knowledge-grid">
                        <div>
                          <h3>
                            <span>✓</span> What we know
                          </h3>
                          <ul>
                            {result.observedFeatures?.map((f, n) => (
                              <li key={n}>{f.text}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h3>
                            <span>?</span> What remains uncertain
                          </h3>
                          <ul>
                            {result.missingEvidence?.map((f, n) => (
                              <li key={n}>{f}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      {result.possibleExplanations?.map((f, n) => (
                        <p className="assessment-note" key={n}>
                          {f.text}
                        </p>
                      ))}
                    </>
                  ) : (
                    <>
                      <h2>
                        {assessment?.state === "failed"
                          ? "The AI assessment could not be completed"
                          : "No completed assessment yet"}
                      </h2>
                      <p>
                        The original observations remain available. An
                        unavailable assessment does not change the evidence.
                      </p>
                      {!demo && (
                        <button
                          className="button secondary"
                          disabled={busy}
                          onClick={assess}
                        >
                          {busy ? "Assessing…" : "Request assessment"}
                        </button>
                      )}
                    </>
                  )}
                  {assessmentError && (
                    <p role="alert" className="inline-error">
                      {assessmentError}
                    </p>
                  )}
                  <p className="tiny muted">
                    An evidence summary, not a pollution diagnosis or a
                    statement that the water is safe.
                  </p>
                </div>
              </article>
              <div className="evidence-pair">
                <article className="card card-body">
                  <div className="eyebrow">SUPPORTING EVIDENCE</div>
                  <h3>Different viewpoints. Shared observations.</h3>
                  {observations
                    .filter(
                      (o) =>
                        !o.is_potential_duplicate && !o.safety_flags?.length,
                    )
                    .slice(1)
                    .map((o) => (
                      <p key={o.id}>
                        <strong>{o.label ?? dateLabel(o.observed_at)}</strong>
                        <br />
                        {o.description}
                      </p>
                    ))}
                </article>
                <article className="card card-body">
                  <div className="eyebrow">CONTRADICTIONS & LIMITS</div>
                  <h3>Keep the whole picture in view.</h3>
                  {result?.contradictions?.map((c, n) => (
                    <p key={n}>{c.text}</p>
                  ))}
                  <p>
                    {observations.some((o) => o.is_potential_duplicate)
                      ? "One duplicate is retained for transparency and adds no independent support."
                      : "No duplicate contributions have been flagged in this record."}
                  </p>
                </article>
              </div>
            </>
          )}
          {tab === "Evidence timeline" && (
            <section className="card card-body">
              <div className="eyebrow">EVERY CONTRIBUTION HAS CONTEXT</div>
              <h2>How the investigation changed</h2>
              <p className="muted">
                Follow the observations in the order they happened.
              </p>
              {observations.length ? (
                <ol className="timeline">
                  {observations.map((o, index) => (
                    <li
                      key={o.id}
                      className={o.is_potential_duplicate ? "duplicate" : ""}
                    >
                      <span className="timeline-dot">{index + 1}</span>
                      <div className="timeline-meta">
                        <strong>{o.contributor ?? "Participant"}</strong>
                        <time dateTime={o.observed_at}>
                          {dateLabel(o.observed_at)}
                        </time>
                        <span>
                          {o.kind ??
                            (o.is_potential_duplicate
                              ? "Potential duplicate"
                              : "Observation")}
                        </span>
                      </div>
                      <h3>{o.label ?? "Community observation"}</h3>
                      <p>{o.description}</p>
                      {o.media?.map(
                        (m) =>
                          m.url && (
                            <figure key={m.id}>
                              <img
                                className="evidence-photo"
                                src={m.url}
                                alt={o.description}
                              />
                              {i.is_demo && (
                                <figcaption className="tiny muted">
                                  Generated demo image · not live evidence
                                </figcaption>
                              )}
                            </figure>
                          ),
                      )}
                      {o.change && (
                        <div className="evidence-change">
                          <Icon name="arrow" size={16} />
                          {o.change}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <Empty title="No observations available yet" />
              )}
              {i.incident_events?.map((e) => (
                <div className="event-row" key={e.id}>
                  <strong>{humanize(e.type)}</strong>
                  <time>{dateLabel(e.created_at)}</time>
                </div>
              ))}
            </section>
          )}
          {tab === "Map & observations" && (
            <section className="card">
              <EvidenceMap
                incidents={observations.length ? observations.map(o => ({ ...i, id: o.id, title: o.label ?? o.description, location: o.location })) : [i]}
                selected={selectedObservation}
                onSelect={setSelectedObservation}
                demo={demo}
                evidence
              />
              <div className="card-body">
                <h2>One stream. Several perspectives.</h2>
                <p>
                  Only approximate areas are shared publicly.{" "}
                  {demo &&
                    "The upstream, bridge and downstream positions are schematic demo locations."}
                </p>
                {selectedObservation && <div className="info-box" role="status">{observations.find(o => o.id === selectedObservation)?.description}</div>}
                {observations.map((o, n) => (
                  <div className="event-row" key={o.id}>
                    <span>
                      {n + 1}. {o.label ?? o.description}
                    </span>
                    <small>{o.kind ?? "Observation"}</small>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
        <aside className="investigation-aside">
          <article className="card card-body">
            <div className="eyebrow">WHERE THE EVIDENCE STANDS</div>
            <Badge status={i.evidence_status} />
            <p>{statuses[i.evidence_status]?.description}</p>
            <div className="mini-stat">
              <strong>{observations.length}</strong>
              <span>contributions in the record</span>
            </div>
            <div className="mini-stat">
              <strong>
                {observations.filter((o) => o.is_potential_duplicate).length}
              </strong>
              <span>potential duplicates · no added support</span>
            </div>
          </article>
          <Safety state={i.safety_state} smell={demo && i.id === "demo-foam"} />
          <article className="card card-body">
            <Icon name="leaf" />
            <h3>What happens next?</h3>
            <p>
              {i.safety_state !== "normal"
                ? "A reviewer should assess the safety flag and evidence before any further field verification."
                : "A useful comparison or a safe return visit can help close the next evidence gap."}
            </p>
            <Link
              className="text-link"
              href={
                i.safety_state !== "normal"
                  ? `/review${demo ? "" : "?mode=live"}`
                  : `/missions${demo ? "" : "?mode=live"}`
              }
            >
              {i.safety_state !== "normal"
                ? "Open reviewer workspace"
                : "Explore verification missions"}
              <Icon name="arrow" size={18} />
            </Link>
          </article>
          <details className="status-guide card card-body">
            <summary>Understanding evidence statuses</summary>
            {Object.entries(statuses).map(([key, s]) => (
              <div key={key}>
                <Badge status={key as keyof typeof statuses} />
                <p>{s.description}</p>
              </div>
            ))}
          </details>
        </aside>
      </div>
    </div>
  );
}
