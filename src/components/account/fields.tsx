import type { CSSProperties, ReactNode } from "react";
import { colors } from "@/components/report/ui";

/** Form controls for the account pages. Errors are linked to their input for screen readers. */

const inputStyle: CSSProperties = {
  minHeight: "48px",
  padding: "0 14px",
  border: "1px solid #CBD5E1",
  borderRadius: "10px",
  fontSize: "16px",
  fontFamily: "inherit",
  color: colors.text,
  background: "#FFFFFF",
  boxSizing: "border-box",
  width: "100%",
};

function Wrapper({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
      <label htmlFor={id} style={{ fontSize: "14px", fontWeight: 600, color: colors.label }}>
        {label}
      </label>
      {hint ? (
        <div id={`${id}-hint`} style={{ fontSize: "13px", color: colors.muted, marginTop: "-2px" }}>
          {hint}
        </div>
      ) : null}
      {children}
      {error ? (
        <div id={`${id}-error`} role="alert" style={{ fontSize: "13px", fontWeight: 600, color: "#B91C1C" }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}

const describedBy = (id: string, hint?: string, error?: string) =>
  [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;

export function TextField(props: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  type?: string;
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel" | "url";
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const id = `f-${props.name}`;
  return (
    <Wrapper id={id} label={props.label} hint={props.hint} error={props.error}>
      <input
        id={id}
        name={props.name}
        type={props.type ?? "text"}
        autoComplete={props.autoComplete}
        inputMode={props.inputMode}
        defaultValue={props.defaultValue}
        required={props.required}
        placeholder={props.placeholder}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={describedBy(id, props.hint, props.error)}
        style={{ ...inputStyle, borderColor: props.error ? "#DC2626" : "#CBD5E1" }}
      />
    </Wrapper>
  );
}

export function TextArea(props: { name: string; label: string; hint?: string; error?: string; defaultValue?: string; required?: boolean; placeholder?: string }) {
  const id = `f-${props.name}`;
  return (
    <Wrapper id={id} label={props.label} hint={props.hint} error={props.error}>
      <textarea
        id={id}
        name={props.name}
        rows={4}
        defaultValue={props.defaultValue}
        required={props.required}
        placeholder={props.placeholder}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={describedBy(id, props.hint, props.error)}
        style={{ ...inputStyle, minHeight: "104px", padding: "12px 14px", resize: "vertical", lineHeight: 1.5, borderColor: props.error ? "#DC2626" : "#CBD5E1" }}
      />
    </Wrapper>
  );
}

export function Select(props: { name: string; label: string; hint?: string; error?: string; defaultValue?: string; options: { value: string; label: string }[] }) {
  const id = `f-${props.name}`;
  return (
    <Wrapper id={id} label={props.label} hint={props.hint} error={props.error}>
      <select
        id={id}
        name={props.name}
        defaultValue={props.defaultValue ?? ""}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={describedBy(id, props.hint, props.error)}
        style={{ ...inputStyle, borderColor: props.error ? "#DC2626" : "#CBD5E1" }}
      >
        <option value="" disabled>
          Choose one
        </option>
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Wrapper>
  );
}

export function Checkbox({ name, label, hint, defaultChecked, error }: { name: string; label: ReactNode; hint?: string; defaultChecked?: boolean; error?: string }) {
  const id = `f-${name}`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <label htmlFor={id} style={{ display: "flex", gap: "12px", alignItems: "flex-start", fontSize: "15px", cursor: "pointer", padding: "10px 0" }}>
        <input
          id={id}
          name={name}
          type="checkbox"
          defaultChecked={defaultChecked}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          style={{ width: "20px", height: "20px", marginTop: "1px", flexShrink: 0, accentColor: "#2563EB" }}
        />
        <span>
          {label}
          {hint ? (
            <span id={`${id}-hint`} style={{ display: "block", fontSize: "13px", color: colors.muted, marginTop: "2px" }}>
              {hint}
            </span>
          ) : null}
        </span>
      </label>
      {error ? (
        <div id={`${id}-error`} role="alert" style={{ fontSize: "13px", fontWeight: 600, color: "#B91C1C" }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "10px", padding: "12px 14px", fontSize: "14px", color: "#7F1D1D" }}>
      {message}
    </div>
  );
}

export const twoColumns: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))",
  gap: "16px",
};
