"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, post } from "./api";
import { ErrorState, Loading, Badge } from "./ui";
import { dateLabel, humanize } from "./data";
import type { EvidenceStatus } from "@/domain/model";
type AdminData = {
  actorId: string;
  profiles: { id: string; display_name: string; role: string }[];
  incidents: {
    id: string;
    category: string;
    evidence_status: EvidenceStatus;
    safety_state: string;
    updated_at: string;
  }[];
  audit: {
    id: number;
    actor_id: string;
    target_user_id?: string;
    incident_id?: string;
    action: string;
    reason: string;
    previous_value: string;
    new_value: string;
    created_at: string;
  }[];
};
export function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null),
    [error, setError] = useState<Error | null>(null),
    [revision, setRevision] = useState(0),
    [offset, setOffset] = useState(0);
  const [target, setTarget] = useState(""),
    [role, setRole] = useState("reviewer"),
    [reason, setReason] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api<AdminData>(`/api/admin?offset=${offset}`)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e);
      });
    return () => {
      active = false;
    };
  }, [revision, offset]);
  function refresh() {
    setData(null);
    setError(null);
    setRevision((n) => n + 1);
  }
  async function act(action: "role" | "pause", incidentId?: string) {
    setBusy(true);
    setMessage("");
    try {
      await post(
        "/api/admin",
        action === "role"
          ? { action, userId: target, role, reason }
          : { action, incidentId, reason },
      );
      setReason("");
      setMessage("Change saved in the administration audit.");
      refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  if (error) return <ErrorState error={error} retry={refresh} />;
  if (!data) return <Loading />;
  return (
    <div className="content-page">
      <div className="page-heading">
        <div className="eyebrow">PROTECTED ADMINISTRATION · LIVE DATA</div>
        <h1>Account and safety oversight.</h1>
        <p>
          Administrative actions require a reason and are recorded in an
          append-only audit.
        </p>
      </div>
      {message && (
        <p className="info-box" role="status">
          {message}
        </p>
      )}
      <section className="card card-body">
        <h2>Account roles</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act("role");
          }}
        >
          <label>
            Account
            <select
              required
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Choose an account</option>
              {data.profiles
                .filter((p) => p.id !== data.actorId)
                .map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.display_name} · {p.role} · {p.id.slice(0, 8)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="participant">Participant</option>
              <option value="reviewer">Reviewer</option>
              <option value="admin">Administrator</option>
            </select>
          </label>
          <label>
            Reason for this change
            <textarea
              required
              minLength={10}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <p>
            Administrator access includes account role management. You cannot
            change your own role.
          </p>
          <button
            className="button"
            disabled={busy || !target || reason.trim().length < 10}
          >
            Save role change
          </button>
        </form>
      </section>
      <section className="card card-body">
        <h2>Incident and safety oversight</h2>
        <p>
          To pause field missions, enter the reason above and choose the
          incident. A pause does not change its evidence status.
        </p>
        {data.incidents.length ? (
          data.incidents.map((i) => (
            <article className="admin-incident" key={i.id}>
              <div>
                <Link
                  className="text-link"
                  href={`/investigations/${i.id}?mode=live`}
                >
                  {humanize(i.category)} · {i.id.slice(0, 8)}
                </Link>
                <p>
                  {humanize(i.safety_state)} · {dateLabel(i.updated_at)}
                </p>
                <Badge status={i.evidence_status} />
              </div>
              <div className="actions">
                <Link href={`/review?mode=live&incident=${i.id}`}>
                  Review evidence →
                </Link>
                <button
                  className="button secondary"
                  disabled={
                    busy ||
                    reason.trim().length < 10 ||
                    i.safety_state === "missions_paused"
                  }
                  onClick={() => void act("pause", i.id)}
                >
                  Pause missions
                </button>
              </div>
            </article>
          ))
        ) : (
          <p>No live incidents on this page.</p>
        )}
      </section>
      <section className="card card-body">
        <h2>Administrative audit</h2>
        {data.audit.length ? (
          data.audit.map((e) => (
            <article className="history-row" key={e.id}>
              <strong>
                {humanize(e.action)} · {dateLabel(e.created_at)}
              </strong>
              <p>
                {e.previous_value} → {e.new_value}
              </p>
              <p>{e.reason}</p>
              <small>
                Actor {e.actor_id} · Target {e.target_user_id ?? e.incident_id}
              </small>
            </article>
          ))
        ) : (
          <p>No administrative actions recorded on this page.</p>
        )}
      </section>
      <div className="actions">
        <button
          className="button secondary"
          disabled={offset === 0}
          onClick={() => {
            setData(null);
            setOffset((n) => Math.max(0, n - 50));
          }}
        >
          Previous page
        </button>
        <span>
          Records {offset + 1}–{offset + 50}
        </span>
        <button
          className="button secondary"
          disabled={
            Math.max(
              data.profiles.length,
              data.incidents.length,
              data.audit.length,
            ) < 50
          }
          onClick={() => {
            setData(null);
            setOffset((n) => n + 50);
          }}
        >
          Next page
        </button>
      </div>
    </div>
  );
}
