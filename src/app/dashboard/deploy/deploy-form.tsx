"use client";

import React, { useState, useRef, useEffect } from "react";
import type { Faction } from "@/lib/game-data";
import styles from "./deploy.module.css";

interface DeployFormProps {
  playerFaction: Faction;
  turnstileEnabled: boolean;
  turnstileSiteKey: string;
}

interface FormState {
  error?: string;
  success?: { mcId: string; hideId: string };
  submitting?: boolean;
}

const SAFETY_ITEMS = [
  { key: "noTrespass", label: "No trespassing — I will only place this in a publicly accessible location." },
  { key: "noDangerousLocation", label: "No dangerous location — the placement is safe from traffic, water, heights, or hazards." },
  { key: "noRestrictedArea", label: "No restricted area — this is not a school, military site, or private property." },
  { key: "safePublicAccess", label: "Safe public access — seekers can reach the general area without crossing any risk." },
  { key: "noPII", label: "No personal information — the clue and photo contain no names, addresses, or identifying details." },
  { key: "noUnsafeImagery", label: "No unsafe imagery — the clue photo shows nothing that could facilitate harm or illegal activity." },
] as const;

function GpsCapture({
  onCapture,
}: {
  onCapture: (lat: number, lng: number) => void;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const capture = () => {
    if (!navigator.geolocation) {
      setStatus("error");
      setErrorMsg("Geolocation not supported. Enter coordinates manually.");
      return;
    }
    setStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onCapture(pos.coords.latitude, pos.coords.longitude);
        setStatus("success");
      },
      (err) => {
        setStatus("error");
        setErrorMsg(err.message);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <div className={styles.gpsSection}>
      <button
        type="button"
        className={styles.gpsButton}
        onClick={capture}
        disabled={status === "loading"}
      >
        {status === "loading" ? "Getting location..." : "📍 Capture from GPS"}
      </button>
      {status === "success" && (
        <p className={styles.gpsSuccess}>GPS coordinates captured ✓</p>
      )}
      {status === "error" && (
        <p className={styles.gpsError}>{errorMsg}</p>
      )}
    </div>
  );
}

function PhotoField({
  label,
  name,
  hint,
  required,
}: {
  label: string;
  name: string;
  hint?: string;
  required?: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
  };

  return (
    <div className={styles.photoField}>
      <label className={styles.fieldLabel}>
        {label}
        {required && <span className={styles.required}>*</span>}
      </label>
      {hint && <p className={styles.fieldHint}>{hint}</p>}
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept="image/jpeg,image/png,image/webp"
        className={styles.fileInput}
        onChange={handleChange}
        required={required}
      />
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="Preview"
          className={styles.photoPreview}
          onClick={() => {
            setPreview(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
      )}
    </div>
  );
}

export function DeployForm({
  playerFaction,
  turnstileEnabled,
  turnstileSiteKey,
}: DeployFormProps) {
  const [state, setState] = useState<FormState>({});
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [gpsLat, setGpsLat] = useState<string>("");
  const [gpsLng, setGpsLng] = useState<string>("");
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  // Turnstile widget
  useEffect(() => {
    if (!turnstileEnabled || !turnstileSiteKey) return;

    const container = turnstileContainerRef.current;
    if (!container) return;

    const existing = container.querySelector(".cf-turnstile");
    if (existing) existing.remove();

    const render = () => {
      if (typeof window.turnstile !== "undefined" && widgetIdRef.current === null) {
        widgetIdRef.current = window.turnstile.render(container, {
          sitekey: turnstileSiteKey,
          callback: (token: string) => setTurnstileToken(token),
          "expired-callback": () => setTurnstileToken(null),
          theme: "light",
        });
      }
    };

    if (typeof window.turnstile !== "undefined") {
      render();
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.onload = render;
      document.head.appendChild(script);
    }

    return () => {
      if (widgetIdRef.current !== null && typeof window.turnstile !== "undefined") {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [turnstileEnabled, turnstileSiteKey]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setState({ submitting: true, error: undefined });

    const form = e.currentTarget;
    const formData = new FormData(form);

    // Attach GPS coordinates
    if (gpsLat) formData.set("exact_lat", gpsLat);
    if (gpsLng) formData.set("exact_lng", gpsLng);

    // Attach turnstile token if enabled
    if (turnstileToken) {
      formData.set("turnstileToken", turnstileToken);
    }

    // Confirm faction colour (always true — pre-filled from session)
    formData.set("faction_colour_confirmed", "true");

    try {
      const res = await fetch("/api/hides", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setState({ error: data.error ?? "Submission failed. Please try again." });
        return;
      }

      setState({
        success: { mcId: data.mcId, hideId: data.hideId },
        error: undefined,
      });
    } catch {
      setState({ error: "Network error. Please check your connection." });
    }
  };

  if (state.success) {
    return (
      <div className={styles.successCard}>
        <div className={styles.successIcon}>✓</div>
        <h2 className={styles.successTitle}>Hide submitted!</h2>
        <p className={styles.successBody}>
          Your hide <strong>{state.success.mcId}</strong> is pending moderator review.
          You&apos;ll be able to see it in My Deployments once approved.
        </p>
        <a href="/dashboard/my-deployments" className={styles.successLink}>
          View My Deployments
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form} noValidate>
      {/* Hidden turnstile token */}
      {turnstileEnabled && <div ref={turnstileContainerRef} />}
      <input type="hidden" name="turnstileToken" value={turnstileToken ?? ""} />

      {/* Faction (read-only, from session) */}
      <div className={styles.factionBanner}>
        <div
          className={styles.factionDot}
          style={{ background: playerFaction.accent }}
          aria-hidden="true"
        />
        <div>
          <p className={styles.factionLabel}>Deploying for faction</p>
          <p className={styles.factionName} style={{ color: playerFaction.accent }}>
            {playerFaction.name}
          </p>
        </div>
      </div>

      {/* Faction colour confirmation */}
      <label className={styles.confirmCheckbox}>
        <input
          type="checkbox"
          name="faction_colour_confirmed"
          value="true"
          defaultChecked
          disabled
          required
        />
        <span>
          I confirm this hide is for the{" "}
          <strong style={{ color: playerFaction.accent }}>{playerFaction.name}</strong>{" "}
          faction and the colour or theme matches my faction identity.
        </span>
      </label>

      {/* Photos */}
      <fieldset className={styles.photoGroup}>
        <legend className={styles.fieldLabel}>Photos</legend>
        <p className={styles.fieldHint}>
          All photos are EXIF-stripped and GPS-removed before storage.
        </p>
        <PhotoField
          label="Identity photo"
          name="identity_photo"
          hint="Private — moderator eyes only. Shows the hider near the location."
          required
        />
        <PhotoField
          label="Clue photo"
          name="clue_photo"
          hint="Public after approval. Shows a recognisable clue for seekers."
          required
        />
      </fieldset>

      {/* GPS coordinates */}
      <fieldset className={styles.fieldGroup}>
        <legend className={styles.fieldLabel}>Exact coordinates</legend>
        <p className={styles.fieldHint}>
          Must be within Reading bounds (lat 51.4–51.6, lng −1.3 to −0.8).
          Stored privately. Never shown to players.
        </p>
        <GpsCapture onCapture={(lat, lng) => { setGpsLat(String(lat)); setGpsLng(String(lng)); }} />
        <div className={styles.coordRow}>
          <div className={styles.coordField}>
            <label htmlFor="exact_lat" className={styles.smallLabel}>Latitude</label>
            <input
              id="exact_lat"
              name="exact_lat_display"
              type="number"
              step="any"
              min="51.4"
              max="51.6"
              className={styles.textInput}
              placeholder="e.g. 51.454"
              value={gpsLat}
              onChange={(e) => setGpsLat(e.target.value)}
              required
            />
          </div>
          <div className={styles.coordField}>
            <label htmlFor="exact_lng" className={styles.smallLabel}>Longitude</label>
            <input
              id="exact_lng"
              name="exact_lng_display"
              type="number"
              step="any"
              min="-1.3"
              max="-0.8"
              className={styles.textInput}
              placeholder="e.g. -0.974"
              value={gpsLng}
              onChange={(e) => setGpsLng(e.target.value)}
              required
            />
          </div>
        </div>
        <input type="hidden" name="exact_lat" value={gpsLat} />
        <input type="hidden" name="exact_lng" value={gpsLng} />
      </fieldset>

      {/* Broad area label */}
      <div className={styles.field}>
        <label htmlFor="broad_area_label" className={styles.fieldLabel}>
          Broad area label <span className={styles.required}>*</span>
        </label>
        <p className={styles.fieldHint}>
          A short name for the area, e.g. &quot;Forbury Gardens&quot; or &quot;Oracle roundabout&quot;.
          Public after approval.
        </p>
        <input
          id="broad_area_label"
          name="broad_area_label"
          type="text"
          className={styles.textInput}
          placeholder="e.g. Forbury Gardens"
          minLength={1}
          maxLength={100}
          required
        />
      </div>

      {/* Codename */}
      <div className={styles.field}>
        <label htmlFor="codename" className={styles.fieldLabel}>
          Codename <span className={styles.required}>*</span>
        </label>
        <p className={styles.fieldHint}>3–40 characters. Visible to seekers when approved.</p>
        <input
          id="codename"
          name="codename"
          type="text"
          className={styles.textInput}
          placeholder="e.g. Glasshouse Wink"
          minLength={3}
          maxLength={40}
          required
        />
      </div>

      {/* Difficulty */}
      <fieldset className={styles.fieldGroup}>
        <legend className={styles.fieldLabel}>Difficulty</legend>
        <div className={styles.radioGroup}>
          {(["easy", "moderate", "challenging"] as const).map((d) => (
            <label key={d} className={styles.radioLabel}>
              <input
                type="radio"
                name="difficulty"
                value={d}
                defaultChecked={d === "moderate"}
                required
              />
              <span className={styles.radioText}>
                <strong>{d.charAt(0).toUpperCase() + d.slice(1)}</strong>
                <span className={styles.radioHint}>
                  {d === "easy" && "Visible from a path, obvious clue"}
                  {d === "moderate" && "Requires short exploration, indirect clue"}
                  {d === "challenging" && "Needs careful searching, subtle clue"}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Clue text */}
      <div className={styles.field}>
        <label htmlFor="clue_text" className={styles.fieldLabel}>
          Clue text <span className={styles.required}>*</span>
        </label>
        <p className={styles.fieldHint}>
          10–500 characters. Private while pending; public after approval. Give seekers
          enough to find the hide without making it trivial.
        </p>
        <textarea
          id="clue_text"
          name="clue_text"
          className={styles.textInput}
          placeholder="e.g. &quot;Behind the stone lion facing the old library, on the third stone from the left.&quot;"
          minLength={10}
          maxLength={500}
          rows={3}
          required
        />
      </div>

      {/* Safety checklist */}
      <fieldset className={styles.fieldGroup}>
        <legend className={styles.fieldLabel}>
          Safety declaration <span className={styles.required}>*</span>
        </legend>
        <p className={styles.fieldHint}>
          All items must be confirmed. Hides violating safety rules will be rejected.
        </p>
        <div className={styles.checklist}>
          {SAFETY_ITEMS.map((item) => (
            <label key={item.key} className={styles.checkItem}>
              <input
                type="checkbox"
                name={`safety_${item.key}`}
                value="true"
                className={styles.checkbox}
                required
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Error */}
      {state.error && (
        <p className={styles.errorMessage} role="alert">
          {state.error}
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        className={styles.submitButton}
        disabled={state.submitting}
      >
        {state.submitting ? "Submitting..." : "Submit for review"}
      </button>
    </form>
  );
}
