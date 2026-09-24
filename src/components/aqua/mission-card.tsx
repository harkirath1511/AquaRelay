import Link from "next/link";

import type { Mission } from "./data";
import { dateLabel, humanize, statuses } from "./data";
import { Icon } from "./ui";

const missionNames: Record<string, { title: string; purpose: string; icon: string }> = {
  repeat_observation: {
    title: "Check what changed over time",
    purpose: "Return later to see whether the reported condition is still present.",
    icon: "clock",
  },
  clearer_photo: {
    title: "Add a clearer photo",
    purpose: "Show the condition and its surroundings from a safe viewpoint.",
    icon: "camera",
  },
  safe_viewpoint: {
    title: "Observe from a safe viewpoint",
    purpose: "Describe what can be seen without approaching the concern.",
    icon: "eye",
  },
  unsafe_access_report: {
    title: "Report whether access is unsafe",
    purpose: "Help others avoid an unsuitable or inaccessible observation area.",
    icon: "shield",
  },
  upstream_comparison: {
    title: "Compare upstream conditions",
    purpose: "Compare the same waterway from a verified upstream viewpoint.",
    icon: "map",
  },
  downstream_comparison: {
    title: "Compare downstream conditions",
    purpose: "Compare the same waterway from a verified downstream viewpoint.",
    icon: "map",
  },
  unaffected_comparison: {
    title: "Compare an unaffected area",
    purpose: "Check a verified comparison location for the same condition.",
    icon: "map",
  },
};

export function MissionCard({
  mission,
  demo = false,
  locationLabel,
}: {
  mission: Mission;
  demo?: boolean;
  locationLabel?: string;
}) {
  const guide = missionNames[mission.type] ?? {
    title: humanize(mission.type),
    purpose: "Help answer a specific question in this investigation.",
    icon: "eye",
  };
  const story = mission.story;
  const paused = mission.state === "paused";
  const completed = mission.state === "completed";
  const status = story?.evidenceStatus && statuses[story.evidenceStatus as keyof typeof statuses];
  const categoryName = story ? humanize(story.category) : "";
  const steps = [
    {
      title: "First report",
      detail: story ? `A report about ${categoryName} opened this investigation.` : "A community report opened the investigation.",
      at: story?.reportedAt,
      state: "done",
    },
    {
      title: story?.decision === "reviewer" ? "Reviewer requested evidence"
        : story?.decision === "assessment" ? "Assessment identified a gap"
          : "A follow-up was planned",
      detail: story?.decision === "reviewer"
        ? "A reviewer chose a focused task for this investigation."
        : story?.decision === "assessment"
          ? "The evidence assessment suggested this follow-up."
          : "The investigation needed a specific follow-up.",
      at: story?.decisionAt,
      state: "done",
    },
    {
      title: "Mission created",
      detail: guide.purpose,
      at: story?.missionCreatedAt,
      state: "done",
    },
    {
      title: paused ? "Field work paused" : completed ? "Mission completed"
        : story?.responseCount ? `${story.responseCount} response${story.responseCount === 1 ? "" : "s"} received`
          : "Waiting for a response",
      detail: paused ? "Do not visit this site for this mission."
        : story?.responseCount ? "Community evidence has been added; this mission is still open for safe, useful follow-up."
          : "This is the current step. Contribute only if it is safe to do so.",
      at: story?.lastResponseAt,
      state: paused ? "paused" : completed ? "done" : "current",
    },
  ] as const;

  return (
    <article className="mission-card card">
      <div className="card-body">
        <div className="split">
          <span className="icon-disc"><Icon name={guide.icon} /></span>
          <span className={paused ? "paused-label" : "available-label"}>
            {paused ? "Paused for safety" : completed ? "Completed" : "Open mission"}
          </span>
        </div>
        <div className="eyebrow">{demo ? "DEMO · " : ""}{humanize(mission.type).toUpperCase()}</div>
        <h2>{guide.title}</h2>
        <p className="mission-purpose">{guide.purpose}</p>
        <p className="mission-place"><Icon name="pin" size={16} />{locationLabel ?? "Approximate area"}</p>
        {typeof mission.distance_meters === "number" && (
          <p className="mission-distance">≈ {(mission.distance_meters / 1000).toFixed(1)} km from your search point</p>
        )}
        {mission.incident_id && (
          <Link className="mission-investigation-link" href={`/investigations/${mission.incident_id}${demo ? "?mode=demo" : ""}`}>
            View {story ? humanize(story.category) : "the"} investigation <Icon name="arrow" size={15} />
          </Link>
        )}
        <div className="mission-gap"><strong>Question to answer</strong><p>{mission.evidence_gap}</p></div>
        <div className="mission-story">
          <div className="mission-story-heading">
            <h3>How this mission got here</h3>
            {status && <span>Investigation: {status.label}</span>}
          </div>
          <ol className="mission-timeline" aria-label="Mission progress">
            {steps.map((step, index) => (
              <li className={`mission-step ${step.state}`} key={`${index}-${step.title}`}>
                <span className="mission-step-node" aria-hidden="true">{index + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  {step.at && <time dateTime={step.at}>{dateLabel(step.at)}</time>}
                  <p>{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="mission-action-copy"><strong>Your task</strong><p>{mission.instructions}</p></div>
        <div className="mission-safety"><Icon name="shield" size={18} />{mission.safety_message}</div>
        {paused || completed ? (
          <button className="button secondary" disabled>{paused ? "Paused · keep your distance" : "Mission completed"}</button>
        ) : (
          <Link className="button" href={`/report?mission=${mission.id}${demo ? "&mode=demo" : ""}`}>
            Contribute an observation <Icon name="arrow" size={18} />
          </Link>
        )}
      </div>
    </article>
  );
}
