"use client";

import React, { useState, useEffect, useCallback } from "react";
import styles from "./moderation.module.css";

interface HideItem {
  id: string;
  mcId: string;
  h3PublicCell: string;
  broadAreaLabel: string;
  codename: string;
  difficulty: string;
  submittedAt: string;
  playerId: string;
  identityPhotoUrl: string;
  cluePhotoUrl: string;
  safetyDeclaration: Record<string, boolean>;
  factionColourConfirmed: boolean;
}

function ActionButton({
  children,
  variant,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  variant: "approve" | "reject" | "info";
  onClick: () => void;
  disabled?: boolean;
}) {
  const cls =
    variant === "approve"
      ? styles.btnApprove
      : variant === "reject"
        ? styles.btnReject
        : styles.btnInfo;
  return (
    <button className={`${styles.actionBtn} ${cls}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function HideCard({
  hide,
  onAction,
}: {
  hide: HideItem;
  onAction: (id: string, action: "approve" | "reject" | "request-info", reason?: string) => Promise<void>;
}) {
  const [rejectReason, setRejectReason] = useState("");
  const [infoNote, setInfoNote] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const doAction = async (action: "approve" | "reject" | "request-info", reason?: string) => {
    setLoading(true);
    setErr("");
    try {
      await onAction(hide.id, action, reason);
      setDone(true);
    } catch {
      setErr("Action failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className={styles.doneCard}>
        <span className={styles.doneText}>
          {hide.mcId} processed ✓
        </span>
      </div>
    );
  }

  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.mcId}>{hide.mcId}</span>
        <span className={styles.difficulty}>{hide.difficulty}</span>
        <time className={styles.date} dateTime={hide.submittedAt}>
          {new Date(hide.submittedAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </time>
      </div>

      <div className={styles.cardBody}>
        <p className={styles.codename}>{hide.codename}</p>
        <p className={styles.area}>{hide.broadAreaLabel}</p>

        <div className={styles.photos}>
          <div className={styles.photoWrap}>
            <p className={styles.photoLabel}>Identity photo (private)</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={hide.identityPhotoUrl}
              alt="Identity"
              className={styles.thumb}
            />
          </div>
          <div className={styles.photoWrap}>
            <p className={styles.photoLabel}>Clue photo (pending)</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={hide.cluePhotoUrl}
              alt="Clue"
              className={styles.thumb}
            />
          </div>
        </div>

        <details className={styles.safetyDetails}>
          <summary className={styles.safetySummary}>Safety checklist</summary>
          <ul className={styles.safetyList}>
            {Object.entries(hide.safetyDeclaration).map(([k, v]) => (
              <li key={k} className={v ? styles.safetyOk : styles.safetyFail}>
                {v ? "✓" : "✗"} {k.replace(/([A-Z])/g, " $1").toLowerCase()}
              </li>
            ))}
          </ul>
        </details>

        <p className={styles.factionConfirm}>
          Faction colour confirmed: {hide.factionColourConfirmed ? "✓" : "✗"}
        </p>
        <p className={styles.cellInfo}>H3 cell: {hide.h3PublicCell}</p>
      </div>

      {/* Reject form */}
      {showReject && (
        <div className={styles.actionForm}>
          <label className={styles.formLabel}>
            Reject reason (required)
            <textarea
              className={styles.textarea}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why this hide is being rejected..."
              rows={3}
            />
          </label>
          <div className={styles.formActions}>
            <button
              className={styles.btnCancel}
              onClick={() => setShowReject(false)}
              disabled={loading}
            >
              Cancel
            </button>
            <ActionButton
              variant="reject"
              onClick={() => doAction("reject", rejectReason)}
              disabled={loading || !rejectReason.trim()}
            >
              {loading ? "Rejecting..." : "Confirm reject"}
            </ActionButton>
          </div>
        </div>
      )}

      {/* Request info form */}
      {showInfo && (
        <div className={styles.actionForm}>
          <label className={styles.formLabel}>
            Note to player
            <textarea
              className={styles.textarea}
              value={infoNote}
              onChange={(e) => setInfoNote(e.target.value)}
              placeholder="What additional information do you need?"
              rows={3}
            />
          </label>
          <div className={styles.formActions}>
            <button
              className={styles.btnCancel}
              onClick={() => setShowInfo(false)}
              disabled={loading}
            >
              Cancel
            </button>
            <ActionButton
              variant="info"
              onClick={() => doAction("request-info", infoNote || undefined)}
              disabled={loading}
            >
              {loading ? "Sending..." : "Send request"}
            </ActionButton>
          </div>
        </div>
      )}

      {err && <p className={styles.errMsg} role="alert">{err}</p>}

      {/* Action buttons */}
      {!showReject && !showInfo && (
        <div className={styles.actions}>
          <ActionButton variant="approve" onClick={() => doAction("approve")} disabled={loading}>
            Approve
          </ActionButton>
          <ActionButton variant="reject" onClick={() => setShowReject(true)} disabled={loading}>
            Reject
          </ActionButton>
          <ActionButton variant="info" onClick={() => setShowInfo(true)} disabled={loading}>
            Request info
          </ActionButton>
        </div>
      )}
    </article>
  );
}

export function ModerationClient() {
  const [hides, setHides] = useState<HideItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchHides = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/moderation/hides");
      if (res.status === 403) {
        setError("You are not a moderator.");
        return;
      }
      if (!res.ok) {
        setError("Failed to load queue.");
        return;
      }
      const data = await res.json();
      setHides(data.hides ?? []);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, []);


  useEffect(() => {
    // Inline fetch to avoid setState-in-effect lint rule
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/moderation/hides");
        if (res.status === 403) {
          setError("You are not a moderator.");
          return;
        }
        if (!res.ok) {
          setError("Failed to load queue.");
          return;
        }
        const data = await res.json();
        setHides(data.hides ?? []);
      } catch {
        setError("Network error.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleAction = async (
    id: string,
    action: "approve" | "reject" | "request-info",
    reason?: string,
  ) => {
    const res = await fetch(`/api/moderation/hides/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? "Action failed");
    }

    // Remove processed hide from queue
    setHides((prev) => prev.filter((h) => h.id !== id));
  };

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <a href="/dashboard" className={styles.backLink}>← Dashboard</a>
          <h1 className={styles.title}>Moderation queue</h1>
          <button className={styles.refreshBtn} onClick={() => void fetchHides()}>
            ↻ Refresh
          </button>
        </div>

        {loading && hides.length === 0 && <p className={styles.loading}>Loading...</p>}
        {error && <p className={styles.errMsg} role="alert">{error}</p>}

        {hides.length === 0 && !loading && !error && (
          <div className={styles.empty}>
            <p>No hides pending review. Good work!</p>
          </div>
        )}

        <div className={styles.queue}>
          {hides.map((h) => (
            <HideCard key={h.id} hide={h} onAction={handleAction} />
          ))}
        </div>
      </div>
    </main>
  );
}
