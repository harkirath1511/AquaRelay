"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { missionTypes, type MissionType } from "@/domain/model";
import {
  type Incident,
  demoIncidents,
  dateLabel,
  humanize,
  titleOf,
} from "./data";
import { api, post } from "./api";
import { Badge, Empty, ErrorState, Icon, Loading, Safety } from "./ui";
import { EvidenceMap } from "./map";

type ReviewExport = {
  incident: Incident & {
    reviews?: {
      id: string;
      explanation: string;
      decision: string;
      created_at: string;
    }[];
    observations?: (NonNullable<Incident["observations"]>[number] & {
      media?: { id: string }[];
    })[];
  };
  mediaUrls?: Record<string, string>;
};
export function Reviewer({
  incidents,
  demo,
  refresh,
}: {
  incidents: Incident[];
  demo: boolean;
  refresh: () => void;
}) {
  const [selected, setSelected] = useState(incidents[0]?.id ?? ""),
    [detail, setDetail] = useState<ReviewExport | null>(
      demo
        ? {
            incident:
              demoIncidents.find((i) => i.id === incidents[0]?.id) ??
              demoIncidents[0],
          }
        : null,
    );
  const [error, setError] = useState<Error | null>(null),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState("request_more_evidence"),
    [explanation, setExplanation] = useState(""),
    [message, setMessage] = useState("");
  const [requestedMissions, setRequestedMissions] = useState<MissionType[]>([]);
  const [tab, setTab] = useState("Evidence"),
    [exact, setExact] = useState<
      | {
          latitude: number;
          longitude: number;
          accuracy_meters: number | null;
        }[]
      | null
    >(null);
  useEffect(() => {
    let current = true;
    if (demo) return;
    if (!selected) return;
    api<ReviewExport>(`/api/incidents/${selected}/export`)
      .then((d) => {
        if (current) setDetail(d);
      })
      .catch((e) => {
        if (current) setError(e);
      });
    return () => {
      current = false;
    };
  }, [selected, demo, revision]);
  const incident = detail?.incident;
  async function save() {
    if (!explanation.trim()) {
      setMessage("Explain the evidence and reasoning behind your decision.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      if (demo) {
        setDetail((d) =>
          d
            ? {
                ...d,
                incident: {
                  ...d.incident,
                  evidence_status:
                    decision === "recommend_expert_review"
                      ? "expert_review_recommended"
                      : decision === "request_more_evidence"
                        ? "needs_verification"
                        : "resolved_or_explained",
                  reviews: [
                    ...(d.incident.reviews ?? []),
                    {
                      id: crypto.randomUUID(),
                      explanation,
                      decision,
                      created_at: new Date().toISOString(),
                    },
                  ],
                },
              }
            : d,
        );
        setMessage(
          "Demo decision recorded for this session. No live record was changed.",
        );
      } else {
        await post(`/api/incidents/${selected}/reviews`, {
          decision,
          explanation,
          requestedMissionTypes:
            decision === "request_more_evidence" &&
            incident?.safety_state !== "missions_paused"
              ? requestedMissions
              : [],
        });
        setMessage("Decision saved to the incident record.");
        setRevision((x) => x + 1);
        refresh();
      }
      setExplanation("");
      setRequestedMissions([]);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Decision could not be saved",
      );
    } finally {
      setBusy(false);
    }
  }
  async function exportReport() {
    try {
      const report = demo
        ? {
            ...detail,
            is_demo: true,
            disclaimer:
              "Fictional demonstration. Not a pollution diagnosis or safety determination.",
          }
        : await api(`/api/incidents/${selected}/export`);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(report, null, 2)], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `aquarelay-${selected}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Export failed");
    }
  }
  async function reveal() {
    try {
      if (demo) {
        setExact([
          { latitude: 12.975, longitude: 77.595, accuracy_meters: 15 },
        ]);
        return;
      }
      const id = incident?.observations?.[0]?.id;
      if (!id) {
        setMessage("No observation location is available.");
        return;
      }
      const result = await api<{ locations: NonNullable<typeof exact> }>(
        `/api/observations/${id}/location`,
      );
      setExact(result.locations);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Location unavailable");
    }
  }
  return (
    <div className="review-workspace">
      <aside className="review-queue">
        <div className="eyebrow">REVIEW QUEUE</div>
        <h2>
          Needs your attention <span>{incidents.length}</span>
        </h2>
        <p className="muted tiny">Most recently updated first</p>
        {incidents.map((i) => (
          <button
            className={`queue-item ${selected === i.id ? "selected" : ""}`}
            key={i.id}
            onClick={() => {
              setSelected(i.id);
              setMessage("");
              setExplanation("");
              setRequestedMissions([]);
              setExact(null);
              setError(null);
              setDetail(
                demo
                  ? { incident: demoIncidents.find((d) => d.id === i.id) ?? i }
                  : null,
              );
            }}
          >
            <Badge status={i.evidence_status} />
            <strong>{titleOf(i)}</strong>
            <span>{i.location_label ?? "Approximate stream area"}</span>
            <small>{dateLabel(i.updated_at)}</small>
            {i.safety_state !== "normal" && (
              <span className="danger-text">⚠ Safety flag</span>
            )}
          </button>
        ))}
      </aside>
      <section className="review-main">
        {error ? (
          <ErrorState
            error={error}
            retry={() => {
              setError(null);
              setDetail(null);
              setRevision((x) => x + 1);
            }}
          />
        ) : !incident ? (
          selected ? (
            <Loading />
          ) : (
            <Empty title="The review queue is clear" />
          )
        ) : (
          <>
            <div className="split">
              <div>
                <div className="eyebrow">
                  {demo ? "DEMO REVIEW" : "REVIEWER WORKSPACE"}
                </div>
                <h1>{titleOf(incident)}</h1>
              </div>
              <button className="button secondary small" onClick={exportReport}>
                Export report ↗
              </button>
              {!demo && (
                <a
                  className="button secondary small"
                  href={`/api/incidents/${selected}/report`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Print-friendly report ↗
                </a>
              )}
            </div>
            <Badge status={incident.evidence_status} />
            <Safety
              state={incident.safety_state}
              smell={demo && incident.id === "demo-foam"}
            />
            <div
              className="detail-tabs"
              role="tablist"
              aria-label="Review sections"
            >
              {[
                "Evidence",
                "Map & location",
                "Assessment history",
                "Full timeline",
              ].map((t) => (
                <button
                  role="tab"
                  aria-selected={tab === t}
                  key={t}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            {tab === "Evidence" && (
              <>
                <div className="review-gallery">
                  {incident.observations?.map((o, n) => (
                    <article className="card card-body" key={o.id}>
                      <div className="evidence-number">
                        {String(n + 1).padStart(2, "0")}
                        <span>
                          {o.is_potential_duplicate
                            ? "DUPLICATE"
                            : (o.kind ?? "OBSERVATION")}
                        </span>
                      </div>
                      {o.media?.map(
                        (m) =>
                          (m.url || detail?.mediaUrls?.[m.id]) && (
                            <img
                              className="evidence-photo"
                              key={m.id}
                              src={m.url || detail?.mediaUrls?.[m.id]}
                              alt={`Observation ${n + 1}: ${o.description}`}
                            />
                          ),
                      )}
                      {demo && o.media?.length ? (
                        <p className="tiny">
                          Generated demo image · not live evidence
                        </p>
                      ) : null}
                      <h3>{o.label ?? "Community observation"}</h3>
                      <p>{o.description}</p>
                      <small>{dateLabel(o.observed_at)}</small>
                      {o.change && (
                        <p className="evidence-change">{o.change}</p>
                      )}
                    </article>
                  ))}
                </div>
                <article className="card card-body">
                  <h3>Contradictions & uncertainty</h3>
                  {incident.assessments
                    ?.at(-1)
                    ?.result?.contradictions?.map((c, n) => (
                      <p key={n}>{c.text}</p>
                    ))}
                  <p>
                    Do not treat repeated or duplicate observations as
                    independent support. Resolve uncertainty explicitly in the
                    review.
                  </p>
                </article>
              </>
            )}
            {tab === "Map & location" && (
              <>
                <EvidenceMap
                  incidents={[incident]}
                  demo={demo}
                  selected={incident.id}
                  onSelect={() => {}}
                  evidence
                />
                <article className="card card-body">
                  <h3>Authorised exact-location access</h3>
                  <p>
                    Exact coordinates are private. Live access is checked on the
                    server, audited and subject to retention limits.
                  </p>
                  <button className="button secondary" onClick={reveal}>
                    {demo
                      ? "Show fictional demo coordinates"
                      : "Access original observation location"}
                  </button>
                  {exact && (
                    <div role="status">
                      {exact.length ? (
                        exact.map((p, n) => (
                          <p key={n}>
                            {demo && "FICTIONAL · "}
                            {p.latitude}, {p.longitude} · accuracy{" "}
                            {p.accuracy_meters ?? "unknown"} m
                          </p>
                        ))
                      ) : (
                        <p>No retained location is available.</p>
                      )}
                    </div>
                  )}
                </article>
              </>
            )}
            {tab === "Assessment history" && (
              <article className="card card-body">
                <h2>Assessment history</h2>
                {incident.assessments?.length ? (
                  incident.assessments.map((a, n) => (
                    <div className="history-row" key={a.id ?? n}>
                      <strong>
                        Assessment {n + 1} · {humanize(a.state)}
                      </strong>
                      <p>
                        {a.result?.summary?.text ??
                          "No completed summary. Evidence remains available for manual review."}
                      </p>
                      {a.completed_at && (
                        <small>{dateLabel(a.completed_at)}</small>
                      )}
                    </div>
                  ))
                ) : (
                  <p>
                    No AI assessment is available. Review the source
                    observations directly.
                  </p>
                )}
                {incident.reviews?.map((r) => (
                  <div className="history-row" key={r.id}>
                    <strong>Reviewer: {humanize(r.decision)}</strong>
                    <p>{r.explanation}</p>
                    <small>{dateLabel(r.created_at)}</small>
                  </div>
                ))}
              </article>
            )}
            {tab === "Full timeline" && (
              <article className="card card-body">
                <h2>Full incident timeline</h2>
                {[
                  ...(incident.observations ?? []).map((o) => ({
                    id: o.id,
                    date: o.observed_at,
                    title: o.label ?? "Observation",
                    text: o.description,
                  })),
                  ...(incident.incident_events ?? []).map((e) => ({
                    id: e.id,
                    date: e.created_at,
                    title: humanize(e.type),
                    text: "Recorded incident event",
                  })),
                  ...(incident.reviews ?? []).map((r) => ({
                    id: r.id,
                    date: r.created_at,
                    title: humanize(r.decision),
                    text: r.explanation,
                  })),
                ]
                  .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
                  .map((e) => (
                    <div className="history-row" key={e.id}>
                      <small>{dateLabel(e.date)}</small>
                      <h3>{e.title}</h3>
                      <p>{e.text}</p>
                    </div>
                  ))}
              </article>
            )}
            <section className="decision-panel card card-body">
              <div className="eyebrow">REVIEWER DECISION</div>
              <h2>Explain what should happen next.</h2>
              <div className="decision-options">
                {[
                  ["request_more_evidence", "Request more evidence"],
                  ["recommend_expert_review", "Recommend expert review"],
                  ["resolved", "Resolve incident"],
                  ["explained", "Explain incident"],
                ].map(([v, label]) => (
                  <label key={v}>
                    <input
                      type="radio"
                      name="decision"
                      checked={decision === v}
                      onChange={() => setDecision(v)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              {!demo && decision === "request_more_evidence" && (
                <fieldset
                  disabled={busy || incident.safety_state === "missions_paused"}
                >
                  <legend>Approved follow-up missions (up to three)</legend>
                  <p className="field-help">
                    {incident.safety_state === "missions_paused"
                      ? "Field missions remain paused for safety. You can still record a request and reasoning."
                      : "Choose the evidence gaps to address. Existing open missions are reused; new missions use approved safety instructions."}
                  </p>
                  <div className="checks">
                    {missionTypes.map((type) => (
                      <label key={type}>
                        <input
                          type="checkbox"
                          checked={requestedMissions.includes(type)}
                          disabled={
                            !requestedMissions.includes(type) &&
                            requestedMissions.length >= 3
                          }
                          onChange={(e) =>
                            setRequestedMissions(
                              e.target.checked
                                ? [...requestedMissions, type]
                                : requestedMissions.filter(
                                    (value) => value !== type,
                                  ),
                            )
                          }
                        />
                        {humanize(type)}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <label>
                Reasoning and next steps
                <textarea
                  rows={3}
                  maxLength={4000}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Reference the evidence, remaining uncertainty and any safety considerations."
                />
              </label>
              <button className="button" disabled={busy} onClick={save}>
                {busy
                  ? "Saving…"
                  : demo
                    ? "Record demo decision"
                    : "Save reviewer decision"}
                <Icon name="check" />
              </button>
            </section>
          </>
        )}
        {message && (
          <div className="info-box" role="status">
            {message}
          </div>
        )}
      </section>
    </div>
  );
}
