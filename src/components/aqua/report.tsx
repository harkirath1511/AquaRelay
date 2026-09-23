"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { incidentCategories, type IncidentCategory } from "@/domain/model";
import { post, uploadPhoto, type UploadProgress } from "./api";
import { Icon, Safety } from "./ui";
import { humanize } from "./data";
import type { SubmissionResult } from "@/features/observations/contracts";

const steps = [
  "What you noticed",
  "Photo & context",
  "Place & time",
  "Safety check",
  "Review",
];
const flags = [
  "strong_fumes",
  "chemical_containers",
  "mass_wildlife_death",
  "flooding",
  "rapidly_changing_water",
  "unsafe_access",
];
export function Report({
  demo,
  missionId,
}: {
  demo: boolean;
  missionId?: string;
}) {
  const [step, setStep] = useState(0),
    [category, setCategory] = useState<IncidentCategory>("foam");
  const [description, setDescription] = useState("");
  const [visible, setVisible] = useState("yes"),
    [persists, setPersists] = useState("unknown");
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [latitude, setLatitude] = useState(""),
    [longitude, setLongitude] = useState("");
  const [accuracy, setAccuracy] = useState<number | null>(null),
    [source, setSource] = useState<"device" | "map">("map");
  const [label, setLabel] = useState(""),
    [observedAt, setObservedAt] = useState("");
  const [safetyFlags, setSafetyFlags] = useState<string[]>([]),
    [safe, setSafe] = useState(false);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  const [geoMessage, setGeoMessage] = useState("");
  const [saved, setSaved] = useState<SubmissionResult | null>(null);
  const key = useRef("");
  const heading = useRef<HTMLHeadingElement>(null);
  const uploadProgress = useRef<UploadProgress[]>([]);
  const persisted = useRef<SubmissionResult | null>(null);
  const capturedAt = useRef("");
  useEffect(
    () => () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview));
    },
    [previews],
  );
  function next() {
    setError("");
    if (step === 1 && !description.trim())
      return setError(
        "Describe what you noticed so others can understand the observation.",
      );
    if (step === 2) {
      if (
        !observedAt ||
        Number.isNaN(Date.parse(observedAt)) ||
        (!demo && Date.parse(observedAt) > Date.now() + 300000)
      )
        return setError(
          "Choose a valid observation time that is not in the future.",
        );
      if (
        !demo &&
        (!latitude ||
          !longitude ||
          !Number.isFinite(Number(latitude)) ||
          !Number.isFinite(Number(longitude)) ||
          Math.abs(Number(latitude)) > 90 ||
          Math.abs(Number(longitude)) > 180)
      )
        return setError(
          "Confirm your location using the device or valid latitude and longitude.",
        );
    }
    if (step === 3 && !safe)
      return setError(
        "Confirm that you have moved to a safe place before continuing.",
      );
    setStep(step + 1);
    setTimeout(() => heading.current?.focus(), 0);
  }
  function locate() {
    setGeoMessage("Waiting for location permission…");
    if (!navigator.geolocation) {
      setGeoMessage(
        "Location is unavailable. You can enter coordinates instead.",
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLatitude(String(p.coords.latitude));
        setLongitude(String(p.coords.longitude));
        setAccuracy(p.coords.accuracy);
        setSource("device");
        capturedAt.current = new Date().toISOString();
        setGeoMessage(
          `Location captured (accuracy approximately ${Math.round(p.coords.accuracy)} m). Only an approximate area is public.`,
        );
      },
      () =>
        setGeoMessage(
          "Location permission was denied or unavailable. Enter coordinates below, or allow location in your browser and try again.",
        ),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }
  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (demo) {
        setDone(true);
        return;
      }
      if (!key.current) key.current = crypto.randomUUID();
      const body = {
        category,
        description: description.trim(),
        locationLabel: label,
        observedAt: new Date(observedAt).toISOString(),
        location: {
          latitude: Number(latitude),
          longitude: Number(longitude),
          source,
          accuracyMeters: accuracy,
          capturedAt: capturedAt.current || new Date().toISOString(),
        },
        answers: {
          ...(visible !== "unknown"
            ? { conditionVisible: visible === "yes" }
            : {}),
          ...(persists !== "unknown" ? { persists: persists === "yes" } : {}),
          safeAccess: safe && !safetyFlags.includes("unsafe_access"),
        },
        safetyFlags,
      };
      const result =
        saved ??
        (await post<SubmissionResult>(
          missionId
            ? `/api/missions/${missionId}/responses`
            : "/api/observations",
          body,
          key.current,
        ));
      setSaved(result);
      persisted.current = result;
      for (const [index, photo] of photos.entries()) {
        uploadProgress.current[index] ??= {};
        await uploadPhoto(
          photo,
          result.observationId,
          uploadProgress.current[index],
        );
      }
      setDone(true);
    } catch (e) {
      setError(
        `${persisted.current ? "Your observation is saved; some photos still need to finish. " : ""}${e instanceof Error ? e.message : "Submission failed"}`,
      );
    } finally {
      setBusy(false);
    }
  }
  if (done)
    return (
      <div className="success-page">
        <span className="success-icon">
          <Icon name="check" size={38} />
        </span>
        <div className="eyebrow">
          {demo
            ? "DEMO COMPLETE · NOTHING WAS PUBLISHED"
            : "OBSERVATION RECEIVED"}
        </div>
        <h1>Thank you for paying attention.</h1>
        <p>
          {demo
            ? "You’ve tried the observation journey. In live mode, your contribution becomes part of a traceable evidence record."
            : "Your observation is now part of the evidence record. A report opens a question; it does not establish a cause."}
        </p>
        <Link
          className="button"
          href={`/investigations/${demo ? "demo-foam" : saved?.incidentId}${demo ? "" : "?mode=live"}`}
        >
          See the investigation <Icon name="arrow" />
        </Link>
      </div>
    );
  return (
    <div className="report-layout">
      <aside className="report-intro">
        <div className="eyebrow">
          {missionId ? "CONTRIBUTE TO A MISSION" : "MAKE AN OBSERVATION"}
        </div>
        <h1>
          A moment of attention.
          <br />
          <em>
            A useful piece
            <br />
            of the picture.
          </em>
        </h1>
        <p>
          You don’t need to know what caused it. Just tell us what you noticed.
        </p>
        <ol className="form-steps">
          {steps.map((s, n) => (
            <li
              key={s}
              className={step === n ? "current" : step > n ? "complete" : ""}
            >
              <span>{step > n ? "✓" : n + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        <div className="privacy-note">
          <Icon name="shield" />
          <p>
            Your exact location is private. Other participants see an
            approximate area.
          </p>
        </div>
      </aside>
      <section className="form-card card">
        <div className="form-progress">
          <span style={{ width: `${(step + 1) * 20}%` }} />
        </div>
        <div className="card-body">
          <div className="eyebrow">
            STEP {step + 1} OF 5{demo ? " · DEMO" : ""}
          </div>
          <h2 tabIndex={-1} ref={heading}>
            {steps[step]}
          </h2>
          {step === 0 && (
            <>
              <p className="muted">
                What caught your attention? Choose the closest match.
              </p>
              <div className="category-grid">
                {incidentCategories.map((c) => (
                  <button
                    key={c}
                    className={category === c ? "selected" : ""}
                    aria-pressed={category === c}
                    onClick={() => setCategory(c)}
                  >
                    <Icon
                      name={
                        c === "wildlife" || c === "litter"
                          ? "leaf"
                          : c === "odour"
                            ? "eye"
                            : "water"
                      }
                    />
                    {humanize(c)}
                    <span>{category === c ? "●" : "○"}</span>
                  </button>
                ))}
              </div>
              <p className="field-help">
                This helps us group related observations and ask useful
                follow-up questions.
              </p>
            </>
          )}
          {step === 1 && (
            <>
              <label className="upload-zone">
                <Icon name="camera" size={30} />
                <strong>
                  {photos.length
                    ? `${photos.length} photographs selected`
                    : "Add photographs"}
                </strong>
                <span>
                  Up to 3 JPEG, PNG or WebP images · 10 MB each · optional
                </span>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (
                      files.length > 3 ||
                      files.some(
                        (f) =>
                          f.size > 10485760 ||
                          !["image/jpeg", "image/png", "image/webp"].includes(
                            f.type,
                          ),
                      )
                    ) {
                      setError(
                        "Choose up to three JPEG, PNG or WebP images, each no larger than 10 MB.",
                      );
                      e.target.value = "";
                      return;
                    }
                    setError("");
                    setPhotos(files);
                    setPreviews(files.map((f) => URL.createObjectURL(f)));
                    uploadProgress.current = [];
                  }}
                />
              </label>
              {photos.map((photo, index) => (
                <div className="photo-preview" key={`${photo.name}-${index}`}>
                  <img
                    src={previews[index]}
                    alt={`Selected observation photograph ${index + 1}: ${photo.name}`}
                  />
                  <button
                    onClick={() => {
                      const remaining = photos.filter((_, i) => i !== index);
                      setPhotos(remaining);
                      setPreviews(remaining.map((f) => URL.createObjectURL(f)));
                      uploadProgress.current = [];
                    }}
                  >
                    Remove photo {index + 1}
                  </button>
                </div>
              ))}
              <p className="field-help">
                A wide view adds context. Avoid faces and identifying details.
                Location metadata is removed by the upload service.
              </p>
              <label>
                What did you notice?
                <textarea
                  required
                  maxLength={2000}
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="For example: white foam collecting along the edge, visible from the footbridge."
                />
              </label>
              <div className="two-fields">
                <label>
                  Is the condition visible?
                  <select
                    value={visible}
                    onChange={(e) => setVisible(e.target.value)}
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                    <option value="unknown">I’m not sure</option>
                  </select>
                </label>
                <label>
                  Has it persisted?
                  <select
                    value={persists}
                    onChange={(e) => setPersists(e.target.value)}
                  >
                    <option value="unknown">I’m not sure</option>
                    <option value="yes">Yes, I saw it again</option>
                    <option value="no">No</option>
                  </select>
                </label>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <p className="muted">
                Place and time help connect your observation to the right
                investigation.
              </p>
              {demo ? (
                <div className="demo-location">
                  <Icon name="pin" />
                  <div>
                    <strong>Millbrook · Footbridge reach</strong>
                    <p>
                      Fictional demo location. No device location is needed.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <button className="button secondary" onClick={locate}>
                    <Icon name="pin" />
                    Use my current location
                  </button>
                  <p role="status" className="field-help">
                    {geoMessage}
                  </p>
                  <div className="two-fields">
                    <label>
                      Latitude
                      <input
                        type="number"
                        min="-90"
                        max="90"
                        step="any"
                        value={latitude}
                        onChange={(e) => {
                          setLatitude(e.target.value);
                          setSource("map");
                          setAccuracy(null);
                          capturedAt.current = new Date().toISOString();
                        }}
                      />
                    </label>
                    <label>
                      Longitude
                      <input
                        type="number"
                        min="-180"
                        max="180"
                        step="any"
                        value={longitude}
                        onChange={(e) => {
                          setLongitude(e.target.value);
                          setSource("map");
                          setAccuracy(null);
                          capturedAt.current = new Date().toISOString();
                        }}
                      />
                    </label>
                  </div>
                  <p className="field-help">
                    Manual coordinates are marked as manually selected. Confirm
                    this is where you observed the condition, not where you are
                    now.
                  </p>
                </>
              )}
              <label>
                Stream or area name (optional)
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={200}
                  placeholder="A stream name or general area"
                />
              </label>
              <button
                className="text-link current-time"
                onClick={() => {
                  const now = new Date();
                  setObservedAt(
                    new Date(now.getTime() - now.getTimezoneOffset() * 60000)
                      .toISOString()
                      .slice(0, 16),
                  );
                }}
              >
                Use current time
              </button>
              <label>
                When did you observe it?
                <input
                  type="datetime-local"
                  value={observedAt}
                  onChange={(e) => setObservedAt(e.target.value)}
                  required
                />
              </label>
              <p className="field-help">
                Use the observation time, even if you are submitting later.
                Times use your device’s local time zone.
              </p>
            </>
          )}
          {step === 3 && (
            <>
              <Safety />
              <h3>Did you notice any of these hazards?</h3>
              <p className="field-help">
                Select any that apply. These warnings are reviewed separately
                from evidence status.
              </p>
              <div className="checks">
                {flags.map((f) => (
                  <label key={f}>
                    <input
                      type="checkbox"
                      checked={safetyFlags.includes(f)}
                      onChange={(e) =>
                        setSafetyFlags(
                          e.target.checked
                            ? [...safetyFlags, f]
                            : safetyFlags.filter((x) => x !== f),
                        )
                      }
                    />
                    {humanize(f)}
                  </label>
                ))}
              </div>
              <label className="confirm-check">
                <input
                  type="checkbox"
                  checked={safe}
                  onChange={(e) => setSafe(e.target.checked)}
                />
                I am now in a safe place and did not enter or sample the water.
              </label>
            </>
          )}
          {step === 4 && (
            <>
              <p className="muted">
                Check the facts before sharing. No conclusion about the water is
                being made.
              </p>
              <dl className="review-summary">
                <dt>Observation</dt>
                <dd>{humanize(category)}</dd>
                <dt>Description</dt>
                <dd>{description}</dd>
                <dt>Photos</dt>
                <dd>
                  {photos.map((photo) => photo.name).join(", ") ||
                    "No photos attached"}
                </dd>
                <dt>Area</dt>
                <dd>
                  {demo
                    ? "Millbrook · demo location"
                    : label || "Private coordinates confirmed"}
                </dd>
                <dt>Observed</dt>
                <dd>{new Date(observedAt).toLocaleString()}</dd>
                <dt>Safety flags</dt>
                <dd>
                  {safetyFlags.map(humanize).join(", ") ||
                    "None reported; water safety is not assessed"}
                </dd>
              </dl>
              {demo && (
                <div className="info-box">
                  This is a practice submission. It will not create a live
                  report or upload your photo.
                </div>
              )}
            </>
          )}
          {error && (
            <div className="inline-error" role="alert">
              {error}
              {error.includes("Authentication") && (
                <>
                  {" "}
                  <Link href="/account">Sign in</Link>
                </>
              )}
            </div>
          )}
          <div className="form-footer">
            <button
              className="button secondary"
              disabled={step === 0 || busy || !!saved}
              onClick={() => {
                setError("");
                setStep(step - 1);
              }}
            >
              Back
            </button>
            {step < 4 ? (
              <button className="button" onClick={next}>
                Continue <Icon name="arrow" />
              </button>
            ) : (
              <button className="button" disabled={busy} onClick={submit}>
                {busy
                  ? "Saving observation…"
                  : saved
                    ? "Retry photo upload"
                    : demo
                      ? "Finish demo observation"
                      : "Submit observation"}
                <Icon name="check" />
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
