"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import s from "./onboarding.module.css";

/** Inputs for the sign-up flow. Every visible input has id `f-<name>` so errors can move focus to it. */

export function ErrorText({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <div id={id} className={s.error} role="alert">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 4.5v4.2M8 11v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      {message}
    </div>
  );
}

function Label({ htmlFor, label, optional }: { htmlFor: string; label: string; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className={s.label}>
      {label} {optional ? <span className={s.optional}>(optional)</span> : null}
    </label>
  );
}

const describedBy = (...ids: (string | false | undefined)[]) => ids.filter(Boolean).join(" ") || undefined;

export function Field(props: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  type?: string;
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel" | "url";
  defaultValue?: string;
  placeholder?: string;
  optional?: boolean;
  icon?: ReactNode;
  list?: string;
  autoFocus?: boolean;
}) {
  const id = `f-${props.name}`;
  return (
    <div className={s.field}>
      <Label htmlFor={id} label={props.label} optional={props.optional} />
      {props.hint ? <div id={`${id}-hint`} className={s.hint}>{props.hint}</div> : null}
      <div className={s.inputWrap}>
        {props.icon ? <span className={s.inputIcon}>{props.icon}</span> : null}
        <input
          id={id}
          name={props.name}
          type={props.type ?? "text"}
          autoComplete={props.autoComplete}
          inputMode={props.inputMode}
          defaultValue={props.defaultValue}
          placeholder={props.placeholder}
          list={props.list}
          autoFocus={props.autoFocus}
          aria-invalid={props.error ? true : undefined}
          aria-describedby={describedBy(props.hint && `${id}-hint`, props.error && `${id}-error`)}
          className={`${s.input} ${props.icon ? s.inputWithIcon : ""} ${props.error ? s.inputInvalid : ""}`}
        />
      </div>
      <ErrorText id={`${id}-error`} message={props.error} />
    </div>
  );
}

function strengthOf(password: string): { score: number; label: string } {
  if (!password) return { score: 0, label: "" };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^a-zA-Z0-9]/.test(password)) score += 1;
  if (password.length < 8) return { score: 1, label: "Too short" };
  return { score: Math.max(1, score), label: ["", "Weak", "Fair", "Good", "Strong"][Math.max(1, score)] };
}

export function PasswordField({ error }: { error?: string }) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const strength = strengthOf(value);
  const colours = ["#e7e2d8", "#b91c1c", "#ea580c", "#ca8a04", "#15803d"];
  return (
    <div className={s.field}>
      <Label htmlFor="f-password" label="Password" />
      <div className={s.inputWrap}>
        <span className={s.inputIcon}>
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
            <rect x="4" y="9" width="12" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M7 9V6.5a3 3 0 0 1 6 0V9" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </span>
        <input
          id="f-password"
          name="password"
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy("f-password-strength", error && "f-password-error")}
          className={`${s.input} ${s.inputWithIcon} ${error ? s.inputInvalid : ""}`}
          style={{ paddingRight: "76px" }}
        />
        <button type="button" className={s.revealButton} onClick={() => setVisible((v) => !v)} aria-pressed={visible}>
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      <div id="f-password-strength" className={s.strength} aria-live="polite">
        <span className={s.strengthBars} aria-hidden="true">
          {[1, 2, 3, 4].map((bar) => (
            <span key={bar} className={s.strengthBar} style={{ background: bar <= strength.score ? colours[strength.score] : undefined }} />
          ))}
        </span>
        {strength.label || "At least 8 characters"}
      </div>
      <ErrorText id="f-password-error" message={error} />
    </div>
  );
}

const splitList = (value: string | undefined) =>
  (value ?? "")
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * A text box that turns entries into tags. Enter, comma or Tab adds a tag;
 * Backspace on an empty box removes the last one. The tags are sent as one
 * hidden field, one tag per line.
 */
export function TagField(props: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  defaultValue?: string;
  placeholder?: string;
  optional?: boolean;
  /** Tags marked with a star are also sent in this field. */
  starName?: string;
  starDefault?: string;
  starHint?: string;
}) {
  const id = `f-${props.name}`;
  const hintId = useId();
  const [tags, setTags] = useState<string[]>(() => splitList(props.defaultValue));
  const [starred, setStarred] = useState<string[]>(() => splitList(props.starDefault));
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const items = splitList(raw).map((item) => item.slice(0, 80));
    if (!items.length) return;
    setTags((current) => {
      const lower = current.map((tag) => tag.toLowerCase());
      return [...current, ...items.filter((item) => !lower.includes(item.toLowerCase()))].slice(0, 40);
    });
    setDraft("");
  };
  const remove = (tag: string) => {
    setTags((current) => current.filter((item) => item !== tag));
    setStarred((current) => current.filter((item) => item !== tag));
  };
  const toggleStar = (tag: string) =>
    setStarred((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.key === "Enter" || event.key === "," || event.key === "Tab") && draft.trim()) {
      event.preventDefault();
      add(draft);
    } else if (event.key === "Backspace" && !draft && tags.length) {
      remove(tags[tags.length - 1]);
    }
  };

  return (
    <div className={s.field}>
      <Label htmlFor={id} label={props.label} optional={props.optional} />
      {props.hint ? <div id={hintId} className={s.hint}>{props.hint}</div> : null}
      <div
        className={`${s.tagBox} ${props.error ? s.inputInvalid : ""}`}
        onClick={(event) => {
          if (event.target === event.currentTarget) document.getElementById(id)?.focus();
        }}
      >
        {tags.map((tag) => {
          const isStarred = starred.includes(tag);
          return (
            <span key={tag} className={`${s.tag} ${isStarred ? s.tagStarred : ""}`}>
              {tag}
              {props.starName ? (
                <button
                  type="button"
                  className={s.tagButton}
                  onClick={() => toggleStar(tag)}
                  aria-pressed={isStarred}
                  aria-label={isStarred ? `Unmark ${tag} as most profitable` : `Mark ${tag} as most profitable`}
                  title="Most profitable"
                >
                  {isStarred ? "★" : "☆"}
                </button>
              ) : null}
              <button type="button" className={s.tagButton} onClick={() => remove(tag)} aria-label={`Remove ${tag}`}>
                ×
              </button>
            </span>
          );
        })}
        <input
          id={id}
          className={s.tagInput}
          value={draft}
          placeholder={tags.length ? "Add another" : props.placeholder}
          onChange={(event) => {
            const value = event.target.value;
            if (/[,\n]/.test(value)) add(value);
            else setDraft(value);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => add(draft)}
          aria-invalid={props.error ? true : undefined}
          aria-describedby={describedBy(props.hint && hintId, props.error && `${id}-error`)}
        />
      </div>
      {props.starName && tags.length ? <div className={s.hint}>{props.starHint}</div> : null}
      <input type="hidden" name={props.name} value={[...tags, ...(draft.trim() ? [draft.trim()] : [])].join("\n")} />
      {props.starName ? <input type="hidden" name={props.starName} value={starred.filter((tag) => tags.includes(tag)).join("\n")} /> : null}
      <ErrorText id={`${id}-error`} message={props.error} />
    </div>
  );
}

export function ChoiceChips(props: { name: string; label: string; options: string[]; defaultValue?: string; error?: string }) {
  const known = props.options.includes(props.defaultValue ?? "");
  const [value, setValue] = useState(props.defaultValue ? (known ? props.defaultValue : "Other") : props.options[0]);
  return (
    <div className={s.field}>
      <fieldset className={s.chips} aria-describedby={props.error ? `f-${props.name}-error` : undefined}>
        <legend className={s.label} style={{ marginBottom: "10px" }}>
          {props.label}
        </legend>
        {[...props.options, "Other"].map((option, index) => (
          <label key={option} className={s.chip}>
            <input
              id={index === 0 ? `f-${props.name}` : undefined}
              type="radio"
              name={props.name}
              value={option}
              checked={value === option}
              onChange={() => setValue(option)}
            />
            <span>{option}</span>
          </label>
        ))}
      </fieldset>
      {value === "Other" ? (
        <input
          name={`${props.name}Other`}
          aria-label={`Other ${props.label.toLowerCase()}`}
          defaultValue={known ? "" : props.defaultValue}
          placeholder="Type it here"
          className={s.input}
          autoFocus
        />
      ) : null}
      <ErrorText id={`f-${props.name}-error`} message={props.error} />
    </div>
  );
}

export function ToggleCard({ name, title, text, icon, defaultChecked }: { name: string; title: string; text: string; icon: ReactNode; defaultChecked?: boolean }) {
  return (
    <label className={s.card}>
      <input type="checkbox" name={name} id={`f-${name}`} defaultChecked={defaultChecked} />
      <span className={s.cardIcon} aria-hidden="true">
        {icon}
      </span>
      <span>
        <span className={s.cardTitle} style={{ display: "block" }}>
          {title}
        </span>
        <span className={s.cardText} style={{ display: "block" }}>
          {text}
        </span>
      </span>
      <span className={s.cardCheck} aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 16 16">
          <path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </label>
  );
}

export const icons = {
  user: (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="7" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 17c1-3.2 3.6-4.8 6.5-4.8s5.5 1.6 6.5 4.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  store: (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 8l1.5-4.5h11L17 8M3 8v9h14V8M3 8h14M8 17v-5h4v5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
  mail: (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 5.5l7 5.5 7-5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
  phone: (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5 2.5h3l1.5 4-2 1.2a9 9 0 0 0 4.8 4.8l1.2-2 4 1.5v3a2 2 0 0 1-2 2A14.5 14.5 0 0 1 3 4.5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
  globe: (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2.5 10h15M10 2.5c2.2 2.3 3 4.8 3 7.5s-.8 5.2-3 7.5c-2.2-2.3-3-4.8-3-7.5s.8-5.2 3-7.5z" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
  pin: (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 18s5.5-5.2 5.5-9.5a5.5 5.5 0 0 0-11 0C4.5 12.8 10 18 10 18z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="10" cy="8.5" r="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  search: (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M15 15l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  chart: (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  map: (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21s6-5.6 6-10.5a6 6 0 0 0-12 0C6 15.4 12 21 12 21z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="10.5" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  ),
  code: (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 8.5h18M9.5 12.5l-2 2 2 2M14.5 12.5l2 2-2 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  check: (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  arrow: (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11M11 5.5l4.5 4.5-4.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

export const COUNTRIES = [
  "Pakistan", "United States", "United Kingdom", "Canada", "Australia", "United Arab Emirates", "Saudi Arabia", "Qatar",
  "Kuwait", "Oman", "Bahrain", "India", "Bangladesh", "Ireland", "New Zealand", "South Africa", "Germany", "France",
  "Spain", "Italy", "Netherlands", "Belgium", "Sweden", "Norway", "Denmark", "Switzerland", "Austria", "Portugal",
  "Poland", "Turkey", "Egypt", "Nigeria", "Kenya", "Malaysia", "Singapore", "Philippines", "Indonesia", "Japan",
  "Mexico", "Brazil", "Argentina", "Chile", "Colombia",
];
