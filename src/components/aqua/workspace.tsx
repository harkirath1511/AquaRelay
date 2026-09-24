"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountPage } from "./account";
import { AdminPage } from "./admin";
import { incidentCategories } from "@/domain/model";
import { api, post } from "./api";
import {
  type Incident,
  type Mission,
  demoIncidents,
  demoMissions,
  statuses,
  titleOf,
  naturePhoto,
  foamPhoto,
  humanize,
  dateLabel,
} from "./data";
import {
  Badge,
  DemoBanner,
  Empty,
  ErrorState,
  Footer,
  Header,
  Icon,
  Loading,
  Safety,
} from "./ui";
import { EvidenceMap } from "./map";
import { Investigation } from "./investigation";
import { Report } from "./report";
import { Reviewer } from "./reviewer";
import { MissionCard } from "./mission-card";
import { FieldScene, SignalOrbit } from "./field-visuals";

export function Workspace({ path }: { path: string[] }) {
  const query = useSearchParams();
  return (
    <WorkspaceContent key={path.join("/") + query.toString()} path={path} />
  );
}
function WorkspaceContent({ path }: { path: string[] }) {
  const query = useSearchParams(),
    router = useRouter(),
    page = path[0];
  const demo = !["account", "admin"].includes(page) && query.get("mode") === "demo",
    id = path[1];
  const reviewIncident = query.get("incident");
  const [incidents, setIncidents] = useState<Incident[]>(
      demo
        ? page === "investigations"
          ? demoIncidents.filter((i) => i.id === id)
          : demoIncidents
        : [],
    ),
    [error, setError] = useState<Error | null>(null),
    [loading, setLoading] = useState(
      !demo && ["explore", "investigations", "review"].includes(page),
    ),
    [revision, setRevision] = useState(0);
  const refresh = () => {
    setError(null);
    setLoading(true);
    setRevision((n) => n + 1);
  };
  useEffect(() => {
    let active = true;
    if (demo) return;
    if (!["explore", "investigations", "review"].includes(page)) return;
    const url =
      page === "review"
        ? `/api/reviews${reviewIncident ? `?incident=${encodeURIComponent(reviewIncident)}` : ""}`
        : page === "investigations"
          ? `/api/incidents/${id}`
          : "/api/incidents?limit=20";
    api<{ incidents?: Incident[]; incident?: Incident }>(url)
      .then((d) => {
        if (active)
          setIncidents(d.incidents ?? (d.incident ? [d.incident] : []));
      })
      .catch((e) => {
        if (active) setError(e);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [demo, page, id, revision, reviewIncident]);
  function changeMode() {
    router.push(
      `/${["investigations", "account", "admin"].includes(page) ? "explore" : path.join("/")}${demo ? "" : "?mode=demo"}`,
    );
  }
  const known = [
    "explore",
    "investigations",
    "report",
    "missions",
    "impact",
    "review",
    "account",
    "admin",
  ].includes(page);
  return (
    <>
      <Header active={page} demo={demo} onMode={changeMode} />
      <DemoBanner demo={demo} onMode={changeMode} />
      <main id="main" className={`workspace workspace-${page}`}>
        {!known ? (
          <Empty title="This page couldn’t be found">
            <Link href="/explore">Return to the explorer</Link>
          </Empty>
        ) : error ? (
          <ErrorState error={error} retry={refresh} />
        ) : loading ? (
          <Loading />
        ) : page === "explore" ? (
          <Explorer incidents={incidents} demo={demo} />
        ) : page === "investigations" ? (
          incidents[0] ? (
            <Investigation
              key={`${id}-${demo}`}
              incident={incidents[0]}
              demo={demo}
              refresh={refresh}
            />
          ) : (
            <Empty title="Investigation not found">
              <Link href="/explore">Return to all investigations</Link>
            </Empty>
          )
        ) : page === "report" ? (
          <Report
            key={`${demo}-${query.get("mission")}`}
            demo={demo}
            missionId={query.get("mission") ?? undefined}
          />
        ) : page === "missions" ? (
          <Missions key={String(demo)} demo={demo} />
        ) : page === "impact" ? (
          <Impact key={String(demo)} demo={demo} />
        ) : page === "review" ? (
          <Reviewer
            key={String(demo)}
            incidents={incidents}
            demo={demo}
            refresh={refresh}
          />
        ) : (
          page === "admin" ? <AdminPage /> : <AccountPage />
        )}
      </main>
      <Footer demo={demo} />
    </>
  );
}

function Explorer({
  incidents,
  demo,
}: {
  incidents: Incident[];
  demo: boolean;
}) {
  const router = useRouter();
  const query = useSearchParams();
  const [now] = useState(() => Date.now());
  const [category, setCategory] = useState(() => {
      const requested = query.get("category");
      return incidentCategories.find((item) => item === requested) ?? "";
    }),
    [status, setStatus] = useState(""),
    [time, setTime] = useState(""),
    [distance, setDistance] = useState("");
  const [view, setView] = useState("map"),
    [selected, setSelected] = useState<string | null>(incidents[0]?.id ?? null),
    [search, setSearch] = useState("");
  const [location, setLocation] = useState<number[] | null>(null),
    [locationError, setLocationError] = useState("");
  const [offset, setOffset] = useState(0),
    [more, setMore] = useState<Incident[]>([]),
    [moreError, setMoreError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false),
    [hasMore, setHasMore] = useState(incidents.length === 20);
  const [panelDetail, setPanelDetail] = useState<Incident | null>(null);
  useEffect(() => {
    if (demo || !selected) return;
    let active = true;
    api<{ incident: Incident }>(`/api/incidents/${selected}`).then(data => {
      if (active) setPanelDetail(data.incident);
    }).catch(() => { /* The incident summary and detail-page retry remain available. */ });
    return () => { active = false; };
  }, [demo, selected]);
  const all = [...incidents, ...more];
  const referenceTime = demo ? Date.parse("2026-09-22T12:00:00+05:30") : now;
  const visible = all.filter(
    (i) =>
      (!category || i.category === category) &&
      (!status || i.evidence_status === status) &&
      (!search ||
        `${i.location_label} ${titleOf(i)}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (!time ||
        referenceTime - Date.parse(i.updated_at) <= Number(time) * 3600000) &&
      (!distance ||
        (demo
          ? (i.distance ?? Infinity) <= Number(distance)
          : location &&
            i.location?.coordinates &&
            distanceKm(location, i.location.coordinates) <= Number(distance))),
  );
  const incident = visible.find((i) => i.id === selected);
  const panelPhoto = panelDetail?.id === selected ? panelDetail.observations?.flatMap(o => o.media ?? []).find(m => m.url)?.url : undefined;
  function near(value: string) {
    setDistance(value);
    if (value && !demo && !location) {
      if (!navigator.geolocation) {
        setLocationError(
          "Device location is unavailable. Clear the distance filter to see all areas.",
        );
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (p) => {
          setLocation([p.coords.longitude, p.coords.latitude]);
          setLocationError("");
        },
        () =>
          setLocationError(
            "Location permission was denied. Clear the distance filter to continue.",
          ),
      );
    }
  }
  async function loadMore() {
    setLoadingMore(true);
    setMoreError("");
    try {
      const next = offset + 20;
      const d = await api<{ incidents: Incident[] }>(
        `/api/incidents?limit=20&offset=${next}`,
      );
      setMore((m) => [...m, ...d.incidents]);
      setOffset(next);
      setHasMore(d.incidents.length === 20 && next < 100);
    } catch (e) {
      setMoreError(e instanceof Error ? e.message : "Could not load more");
    } finally {
      setLoadingMore(false);
    }
  }
  return (
    <>
      <div className="explorer-top">
        <div>
          <div className="eyebrow"><span className="dot" /> THE COMMUNITY FIELD ATLAS</div>
          <h1>A closer look at <em>our world.</em></h1>
          <p>
            Explore observations, understand the evidence, find a useful next
            step.
          </p>
        </div>
        <div className="view-toggle" aria-label="Display mode">
          <button aria-pressed={view === "map"} onClick={() => setView("map")}>
            <Icon name="map" size={17} />
            Map
          </button>
          <button
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <span>☷</span>List
          </button>
        </div>
      </div>
      <div className="filter-bar">
        <label className="search-field">
          <Icon name="pin" size={18} />
          <input
            aria-label="Search places or investigations"
            placeholder="Find a place or investigation"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {incidentCategories.map((c) => (
              <option key={c} value={c}>
                {humanize(c)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Evidence status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any evidence status</option>
            {Object.entries(statuses).map(([v, s]) => (
              <option key={v} value={v}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Distance</span>
          <select value={distance} onChange={(e) => near(e.target.value)}>
            <option value="">Any distance</option>
            <option value="1">Within 1 km</option>
            <option value="2">Within 2 km</option>
            <option value="5">Within 5 km</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Updated within</span>
          <select value={time} onChange={(e) => setTime(e.target.value)}>
            <option value="">Any time</option>
            <option value="6">Last 6 hours</option>
            <option value="24">Last 24 hours</option>
            <option value="168">Last 7 days</option>
          </select>
        </label>
        <button
          className="reset-filter"
          onClick={() => {
            setCategory("");
            setStatus("");
            setDistance("");
            setTime("");
            setSearch("");
            setLocationError("");
          }}
        >
          Reset
        </button>
      </div>
      {locationError && (
        <div className="inline-error" role="alert">
          {locationError}
        </div>
      )}
      <div className={view === "map" ? "explorer-layout" : "explorer-list"}>
        <aside className="explorer-results">
          <div className="results-title">
            <strong>
              {visible.length} {demo ? "demo " : ""}investigations
            </strong>
            <span>Approximate areas</span>
          </div>
          {visible.length ? (
            visible.map((i) => (
              <button
                className={`incident-card ${selected === i.id ? "selected" : ""}`}
                onClick={() => {
                  setSelected(i.id);
                  if (view === "list")
                    router.push(
                      `/investigations/${i.id}${demo ? "?mode=demo" : ""}`,
                    );
                }}
                key={i.id}
              >
                <div className="split">
                  <span className="category-label">
                    <Icon name={["wildlife", "litter", "illegal_dumping", "vegetation_loss", "habitat_damage", "soil_contamination"].includes(i.category) ? "leaf" : ["foam", "discolouration", "flow", "erosion"].includes(i.category) ? "water" : "eye"} size={17} />
                    {i.category}
                  </span>
                  {i.is_demo && <span className="demo-label">DEMO</span>}
                </div>
                <h3>{titleOf(i)}</h3>
                <p>
                  <Icon name="pin" size={13} />
                  {i.location_label || "Approximate area"}
                </p>
                <Badge status={i.evidence_status} />
                <div className="incident-meta">
                  <span>
                    {demo
                      ? `${i.distance} km from demo centre`
                      : dateLabel(i.updated_at)}
                  </span>
                  <span>
                    {i.safety_state !== "normal"
                      ? "⚠ Safety flag"
                      : "View evidence →"}
                  </span>
                </div>
              </button>
            ))
          ) : (
            <Empty title="No matching investigations" />
          )}
          {!demo && hasMore && (
            <button
              className="button secondary"
              disabled={loadingMore}
              onClick={loadMore}
            >
              {loadingMore ? "Loading…" : "Load more investigations"}
            </button>
          )}
          {moreError && <p role="alert">{moreError}</p>}
          <div className="results-note">
            <Icon name="shield" size={18} /> Exact participant locations are
            private.
          </div>
        </aside>
        {view === "map" && (
          <div className="explorer-map">
            <EvidenceMap
              incidents={visible}
              selected={selected ?? undefined}
              onSelect={setSelected}
              demo={demo}
            />
            <Link className="map-missions-link" href={`/missions${demo ? "?mode=demo" : ""}`}><Icon name="pin" size={15} />{demo ? "2 nearby open missions" : "Find nearby missions"} ↗</Link>
            {incident && (
              <article className="map-detail card">
                <button
                  className="close-panel"
                  aria-label="Close incident panel"
                  onClick={() => setSelected(null)}
                >
                  ×
                </button>
                {incident.is_demo && (
                  <div className="panel-photo">
                    <img
                      src={
                        incident.id === "demo-foam" ? foamPhoto : naturePhoto
                      }
                      alt="Illustrative demo image, not live incident evidence"
                    />
                    <span className="photo-label">
                      DEMO · ILLUSTRATIVE IMAGE
                    </span>
                  </div>
                )}
                {!incident.is_demo && panelPhoto && <div className="panel-photo"><img src={panelPhoto} alt={`Community photograph for ${titleOf(incident)}`} /></div>}
                <div className="card-body">
                  <div className="eyebrow">
                    {incident.location_label || "APPROXIMATE AREA"}
                  </div>
                  <h2>{titleOf(incident)}</h2>
                  <Badge status={incident.evidence_status} />
                  <p className="tiny muted">
                    Latest update · {dateLabel(incident.updated_at)}
                  </p>
                  <p>{statuses[incident.evidence_status].description}</p>
                  {incident.safety_state !== "normal" && (
                    <p className="panel-safety">
                      ⚠ Safety flag ·{" "}
                      {incident.safety_state === "missions_paused"
                        ? "field missions paused"
                        : "review required"}
                    </p>
                  )}
                  <Link
                    className="button"
                    href={`/investigations/${incident.id}${demo ? "?mode=demo" : ""}`}
                  >
                    Open investigation <Icon name="arrow" size={18} />
                  </Link>
                </div>
              </article>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function distanceKm(a: number[], b: number[]) {
  const r = Math.PI / 180,
    dLat = (b[1] - a[1]) * r,
    dLon = (b[0] - a[0]) * r;
  const v =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(v), Math.sqrt(1 - v));
}

function Missions({ demo }: { demo: boolean }) {
  const [missions, setMissions] = useState<Mission[]>(demo ? demoMissions : []),
    [error, setError] = useState<Error | null>(null),
    [loading, setLoading] = useState(false),
    [searched, setSearched] = useState(demo);
  const [view, setView] = useState("list"),
    [selected, setSelected] = useState<string | null>(null),
    [filter, setFilter] = useState("all"),
    [radius, setRadius] = useState("5000");
  async function find() {
    setLoading(true);
    setError(null);
    if (!navigator.geolocation) {
      setError(new Error("Device location is unavailable in this browser."));
      setLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        try {
          const d = await post<{
            missions: (Mission & { latitude: number; longitude: number })[];
          }>("/api/missions", {
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
            radiusMeters: Number(radius),
          });
          setMissions(
            d.missions.map((m) => ({
              ...m,
              target_location: { coordinates: [m.longitude, m.latitude] },
              distance_meters:
                distanceKm(
                  [p.coords.longitude, p.coords.latitude],
                  [m.longitude, m.latitude],
                ) * 1000,
            })),
          );
          setSearched(true);
        } catch (e) {
          setError(e as Error);
        } finally {
          setLoading(false);
        }
      },
      () => {
        setError(
          new Error(
            "Location permission was denied or unavailable. Allow location in your browser to search nearby missions.",
          ),
        );
        setLoading(false);
      },
      { timeout: 15000 },
    );
  }
  const filtered = missions.filter(
    (m) =>
      (filter === "all" ||
        (filter === "available"
          ? m.state !== "paused"
          : m.state === "paused")) &&
      (m.distance_meters ?? 0) <= Number(radius),
  );
  const mapped: Incident[] = filtered.map((m) => ({
    id: m.id,
    title: humanize(m.type),
    category: (m.story?.category as Incident["category"]) ?? "other",
    evidence_status: "needs_verification",
    safety_state: m.state === "paused" ? "missions_paused" : "normal",
    location_label: demo
      ? demoIncidents.find((incident) => incident.id === m.incident_id)?.location_label ?? "Demo area"
      : "Approximate mission area",
    location: m.target_location,
    updated_at: new Date().toISOString(),
    is_demo: demo,
  }));
  return (
    <div className="content-page missions-page">
      <div className="page-heading illustrated-heading">
        <div className="eyebrow">THE NEXT SMALL ACT / VERIFICATION MISSIONS</div>
        <h1>A fresh perspective.<br /><em>A clearer picture.</em></h1>
        <p>A clearer photo. A safe return visit. A useful comparison. Each mission asks you to help answer one specific question in an investigation.</p>
        <div className="workspace-heading-art"><FieldScene habitat="land" /></div>
      </div>
      {!demo && <h2 className="nearby-missions-title">Find missions near your device {searched ? `(${filtered.length})` : ""}</h2>}
      <div className="mission-toolbar">
        <div className="view-toggle">
          <button
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            ☷ Cards
          </button>
          <button aria-pressed={view === "map"} onClick={() => setView("map")}>
            <Icon name="map" size={17} />
            Map
          </button>
        </div>
        {demo && <label>
          <span className="sr-only">Mission availability</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All missions</option>
            <option value="available">Available</option>
            <option value="paused">Paused for safety</option>
          </select>
        </label>}
        <label>
          <span className="sr-only">Search radius</span>
          <select value={radius} onChange={(e) => setRadius(e.target.value)}>
            <option value="1000">Within 1 km</option>
            <option value="2000">Within 2 km</option>
            <option value="5000">Within 5 km</option>
          </select>
        </label>
        {!demo && (
          <button className="button" onClick={find} disabled={loading}>
            Find nearby missions <Icon name="pin" size={17} />
          </button>
        )}
      </div>
      {error ? (
        <ErrorState error={error} retry={find} />
      ) : loading ? (
        <Loading />
      ) : !searched ? (
        <Empty title="Find a useful task near you">
          Use your device location to discover missions within your chosen
          radius. Your search location is sent privately, not placed in the URL.
        </Empty>
      ) : (
        <>
          {view === "map" && (
            <div className="missions-map">
              <EvidenceMap
                incidents={mapped}
                demo={demo}
                selected={selected ?? undefined}
                onSelect={setSelected}
              />
            </div>
          )}
          <div className="mission-grid">
            {filtered
              .filter((m) => view !== "map" || !selected || m.id === selected)
              .map((m) => <MissionCard mission={m} demo={demo} key={m.id}
                locationLabel={demo ? demoIncidents.find((incident) => incident.id === m.incident_id)?.location_label : undefined} />)}
          </div>
          {!filtered.length && (demo
            ? <Empty title="No demo missions match this search" />
            : <Empty title="No open missions within this radius">
                Live missions appear here only while an investigation is open and a task is within {Number(radius) / 1000} km of your device. Resolved investigations and cancelled or safety-paused tasks are removed from nearby search.
              </Empty>)}
          <Safety />
        </>
      )}
    </div>
  );
}

type ImpactContribution = {
  id: string;
  incident_id: string;
  mission_id: string | null;
  category: string;
  submitted_at: string;
  location_quality: string | null;
  location_quality_flag: string | null;
  is_potential_duplicate: boolean;
  invalidated_at: string | null;
};

function contributionStatus(contribution: ImpactContribution, recognised: boolean) {
  if (recognised) return "Automatically recognised";
  if (contribution.invalidated_at) return "Removed from evidence";
  if (contribution.is_potential_duplicate) return "Possible duplicate · no automatic recognition";
  if (!contribution.mission_id) return "Original report submitted";
  if (contribution.location_quality_flag === "far_from_target") return "Outside mission target · no automatic recognition";
  if (contribution.location_quality === "low_accuracy") return "Location too imprecise for automatic recognition";
  if (contribution.location_quality === "location_conflict") return "Location conflict · no automatic recognition";
  return "Submitted · no automatic recognition";
}

function Impact({ demo }: { demo: boolean }) {
  const [events, setEvents] = useState<
      {
        id: string;
        incident_id: string;
        observation_id: string;
        reason: string;
        points: number;
        reverses_event_id?: string;
        created_at: string;
      }[]
    >([]),
    [contributions, setContributions] = useState<ImpactContribution[]>([]),
    [error, setError] = useState<Error | null>(null),
    [loading, setLoading] = useState(!demo),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    if (demo) return;
    let active = true;
    api<{ events: typeof events; contributions: ImpactContribution[] }>("/api/me/impact")
      .then((d) => {
        if (active) {
          setEvents(d.events);
          setContributions(d.contributions);
        }
      })
      .catch((e) => {
        if (active) setError(e);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [demo, revision]);
  return (
    <div className="content-page impact-page">
      <div className="page-heading illustrated-heading">
        <div className="eyebrow">
          {demo ? "MAYA’S DEMO IMPACT" : "YOUR CONTRIBUTIONS"}
        </div>
        <h1>
          A clearer picture.
          <br />
          <em>Because you were there.</em>
        </h1>
        <p>The value is in what your evidence helps people understand.</p>
        <div className="workspace-heading-art impact-orbit"><SignalOrbit /></div>
      </div>
      {error ? (
        <ErrorState
          error={error}
          retry={() => {
            setLoading(true);
            setError(null);
            setRevision((x) => x + 1);
          }}
        />
      ) : loading ? (
        <Loading />
      ) : (
        <>
          <div className="impact-summary card">
            <Icon name="leaf" size={42} />
            <div>
              <h2>
                {demo
                  ? "You helped establish what changed—and what didn’t."
                  : "Every useful contribution adds context."}
              </h2>
              <p>
                {demo
                  ? "Your original report and return visit gave reviewers a place to start and evidence of persistence over time."
                  : `${contributions.length} submitted observation${contributions.length === 1 ? "" : "s"} · ${events.filter((e) => e.points > 0 && !events.some((r) => r.reverses_event_id === e.id)).length} automatically recognised.`}
              </p>
            </div>
          </div>
          {!demo && <div className="impact-metrics" aria-label="Your contribution summary">
            <div><span>Observations shared</span><strong>{contributions.length.toString().padStart(2, "0")}</strong><Icon name="eye" size={23} /></div>
            <div><span>Mission responses</span><strong>{contributions.filter((item) => item.mission_id).length.toString().padStart(2, "0")}</strong><Icon name="camera" size={23} /></div>
            <div><span>Investigations contributed to</span><strong>{new Set(contributions.map((item) => item.incident_id)).size.toString().padStart(2, "0")}</strong><Icon name="leaf" size={23} /></div>
          </div>}
          <div className="impact-columns">
            <section>
              <h2>Your evidence in action</h2>
              {demo ? (
                <>
                  {[
                    {
                      title: "You opened the question",
                      text: "Your original foam observation created a shared investigation at Millbrook.",
                      tag: "Original observation · 22 Sep",
                    },
                    {
                      title: "You filled a time gap",
                      text: "Your return visit showed the foam was still present one hour later. The assessment could now distinguish persistence from a momentary condition.",
                      tag: "Useful evidence · Repeat observation",
                    },
                    {
                      title: "Your evidence reached review",
                      text: "Together with upstream and downstream comparisons, your contribution helped create a record for expert review. The investigation remains open.",
                      tag: "Community recognition · Shared contribution",
                    },
                  ].map((e, n) => (
                    <article
                      className="impact-event card card-body"
                      key={e.title}
                    >
                      <span className="impact-number">0{n + 1}</span>
                      <div>
                        <div className="eyebrow">{e.tag}</div>
                        <h3>{e.title}</h3>
                        <p>{e.text}</p>
                      </div>
                    </article>
                  ))}
                  <Link className="text-link" href="/investigations/demo-foam?mode=demo">
                    See how the investigation changed <Icon name="arrow" />
                  </Link>
                </>
              ) : contributions.length ? (
                <>
                  {contributions.map((contribution) => {
                    const recognised = events.some((event) =>
                      event.points > 0 && event.observation_id === contribution.id &&
                      !events.some((reversal) => reversal.reverses_event_id === event.id));
                    const status = contributionStatus(contribution, recognised);
                    return <article className="contribution-entry card card-body" key={contribution.id}>
                      <div className="eyebrow">{contribution.mission_id ? "MISSION RESPONSE" : "ORIGINAL REPORT"}</div>
                      <h3>{humanize(contribution.category).replace(/^./, (letter) => letter.toUpperCase())} observation</h3>
                      <p>{dateLabel(contribution.submitted_at)} · {status}</p>
                      <Link href={`/investigations/${contribution.incident_id}?mode=live`}>
                        View investigation →
                      </Link>
                    </article>;
                  })}
                  <p className="muted">Submitting evidence and earning automatic recognition are separate. Mission responses need a qualifying location and must pass duplicate and target checks.</p>
                </>
              ) : (
                <Empty title="Your first useful contribution starts here">
                  <Link href="/missions?mode=live">
                    Find a verification mission
                  </Link>
                </Empty>
              )}
            </section>
            <aside className="card card-body impact-note">
              <Icon name="shield" size={30} />
              <h2>Care, not competition.</h2>
              <p>
                A clear comparison can be more useful than ten similar photos. A
                duplicate is kept for transparency, without adding support.
              </p>
              <p>
                There are no leaderboards or streaks here. Good evidence
                includes uncertainty—and knowing when to step away.
              </p>
              <hr />
              <h3>Completed investigations</h3>
              <p>
                {demo
                  ? "The Millbrook case is still open. When a reviewer records an outcome, it becomes part of the investigation history."
                  : "Open an investigation from your contribution history to see its current reviewer outcome."}
              </p>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}


