"use client";

import { useFormState, useFormStatus } from "react-dom";
import { onboardAction, type OnboardState } from "./actions";
import type { Faction, FactionId } from "@/lib/game-data";
import styles from "./onboarding.module.css";

const initialState: OnboardState = {};

function FactionCard({
  faction,
  selected,
  onSelect,
}: {
  faction: Faction;
  selected: boolean;
  onSelect: (id: FactionId) => void;
}) {
  return (
    <label
      className={`${styles.factionCard} ${selected ? styles.selected : ""}`}
      style={
        {
          "--accent": faction.accent,
          "--soft-accent": faction.softAccent,
        } as React.CSSProperties
      }
    >
      <input
        type="radio"
        name="faction"
        value={faction.id}
        className={styles.hiddenRadio}
        onChange={() => onSelect(faction.id)}
        required
      />
      <div className={styles.factionBadge} aria-hidden="true" />
      <h3>{faction.name}</h3>
      <p className={styles.factionSignal}>{faction.signal}</p>
      <blockquote className={styles.factionMotto}>{faction.motto}</blockquote>
      <dl className={styles.factionStats}>
        <div>
          <dt>Score</dt>
          <dd>{faction.score?.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Cells</dt>
          <dd>{faction.territories}</dd>
        </div>
      </dl>
    </label>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.submitButton} disabled={pending}>
      {pending ? "Joining..." : "Join faction"}
    </button>
  );
}

export function OnboardingForm({ factions }: { factions: Faction[] }) {
  const [state, formAction] = useFormState(onboardAction, initialState);
  const [selectedFaction, setSelectedFaction] = React.useState<FactionId | null>(null);

  return (
    <form action={formAction} className={styles.form} noValidate>
      {/* Faction selection */}
      <fieldset className={styles.factionGrid}>
        <legend className={styles.fieldLabel}>Select your faction</legend>
        {factions.map((faction) => (
          <FactionCard
            key={faction.id}
            faction={faction}
            selected={selectedFaction === faction.id}
            onSelect={setSelectedFaction}
          />
        ))}
      </fieldset>

      {/* Display name */}
      <div className={styles.field}>
        <label htmlFor="displayName" className={styles.fieldLabel}>
          Display name
        </label>
        <p className={styles.fieldHint}>
          3–24 characters. Visible to other players. Unique across all factions.
        </p>
        <input
          id="displayName"
          name="displayName"
          type="text"
          className={styles.textInput}
          placeholder="e.g. MossRunner or ShadowPaw"
          minLength={3}
          maxLength={24}
          required
          autoComplete="nickname"
        />
      </div>

      {/* Error messages */}
      {state.error && !state.issues && (
        <p className={styles.errorMessage} role="alert">
          {state.error}
        </p>
      )}
      {state.issues?.map((issue) => (
        <p key={issue.field} className={styles.errorMessage} role="alert">
          {issue.message}
        </p>
      ))}

      <div className={styles.actions}>
        <SubmitButton />
      </div>
    </form>
  );
}

// Need React for useState
import React from "react";
