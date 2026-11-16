import type { CSSProperties, ReactNode } from "react";
import type { CheckRow, RowStatus, Severity } from "@/lib/audit/types";

/** Shared building blocks for the report, styled to match the design. */

export const colors = {
  green: "#15803D",
  blue: "#2563EB",
  orange: "#EA580C",
  yellow: "#CA8A04",
  red: "#DC2626",
  grey: "#94A3B8",
  track: "#E2E8F0",
  text: "#0F172A",
  muted: "#475569",
  label: "#334155",
};

export const mono: CSSProperties = { fontFamily: "ui-monospace,Menlo,Consolas,monospace", fontSize: "13px" };

const TONES = {
  green: { background: "#DCFCE7", color: "#15803D" },
  red: { background: "#FEE2E2", color: "#B91C1C" },
  orange: { background: "#FFEDD5", color: "#C2410C" },
  yellow: { background: "#FEF9C3", color: "#854D0E" },
  grey: { background: "#F1F5F9", color: "#475569" },
} as const;
export type Tone = keyof typeof TONES;

export const SEVERITY_TONE: Record<Severity, Tone> = { critical: "red", high: "orange", medium: "yellow", low: "grey" };
export const SEVERITY_COLOR: Record<Severity, string> = {
  critical: colors.red,
  high: colors.orange,
  medium: colors.yellow,
  low: colors.grey,
};
const ROW_TONE: Record<RowStatus, Tone> = { pass: "green", fail: "red", warn: "yellow", info: "grey" };
const ROW_LABEL: Record<RowStatus, string> = { pass: "Pass", fail: "Fail", warn: "Warn", info: "Info" };

export function scoreColor(score: number): string {
  if (score >= 80) return colors.green;
  if (score >= 70) return colors.blue;
  if (score >= 50) return colors.orange;
  return colors.red;
}

export function Card({ children, style, id }: { children: ReactNode; style?: CSSProperties; id?: string }) {
  return (
    <div
      id={id}
      style={{
        background: "#FFFFFF",
        border: "1px solid #E2E8F0",
        borderRadius: "16px",
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: colors.label }}>{children}</h3>;
}

/** Card heading with a count chip on the right ("3 issues"). */
export function CardHeader({ title, chip, tone }: { title: ReactNode; chip?: ReactNode; tone?: Tone }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
      <CardTitle>{title}</CardTitle>
      {chip !== undefined ? <Chip tone={tone ?? "grey"}>{chip}</Chip> : null}
    </div>
  );
}

export function Chip({ tone, children, style }: { tone: Tone; children: ReactNode; style?: CSSProperties }) {
  return (
    <span
      style={{
        ...TONES[tone],
        fontSize: "12px",
        fontWeight: 700,
        padding: "3px 10px",
        borderRadius: "6px",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      style={{
        ...TONES[tone],
        fontSize: "12px",
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: "6px",
        minWidth: "40px",
        textAlign: "center",
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

/** Chip text and tone for a count of problems ("No issues", "3 issues"). */
export function issueChip(count: number, noun = "issue", tone: Tone = "orange"): { chip: string; tone: Tone } {
  if (count === 0) return { chip: `No ${noun}s`, tone: "green" };
  return { chip: `${count.toLocaleString("en")} ${count === 1 ? noun : `${noun}s`}`, tone };
}

export function Rows({ rows }: { rows: CheckRow[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {rows.map((row, index) => (
        <div
          key={index}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "10px 0",
            borderTop: "1px solid #E2E8F0",
            fontSize: "14px",
          }}
        >
          <Badge tone={ROW_TONE[row.status]}>{ROW_LABEL[row.status]}</Badge>
          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
            {row.path ? <span style={mono}>{row.path}</span> : null}
            {row.text}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div style={{ background: "#F5F7FA", borderRadius: "12px", padding: "12px", minWidth: 0 }}>
      <div style={{ fontSize: "22px", fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: "12px", color: colors.muted }}>{label}</div>
    </div>
  );
}

export function StatGrid({ children, columns = 3 }: { children: ReactNode; columns?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: "12px" }}>
      {children}
    </div>
  );
}

export interface Segment {
  label: string;
  value: number;
  color: string;
}

/** A single horizontal bar split into parts, with a legend below. */
export function StackBar({ segments, label, legend = true }: { segments: Segment[]; label: string; legend?: boolean }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return (
    <>
      <div
        role="img"
        aria-label={label}
        style={{ display: "flex", height: "20px", borderRadius: "10px", overflow: "hidden", background: colors.track }}
      >
        {total > 0
          ? segments.map((segment) =>
              segment.value > 0 ? (
                <div key={segment.label} style={{ width: `${(100 * segment.value) / total}%`, background: segment.color }} />
              ) : null,
            )
          : null}
      </div>
      {legend ? <Legend segments={segments} /> : null}
    </>
  );
}

export function Legend({ segments, format }: { segments: Segment[]; format?: (value: number) => string }) {
  return (
    <div style={{ display: "flex", gap: "8px 20px", flexWrap: "wrap", fontSize: "13px" }}>
      {segments.map((segment) => (
        <div key={segment.label} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: segment.color }} />
          {segment.label} <strong>{format ? format(segment.value) : segment.value.toLocaleString("en")}</strong>
        </div>
      ))}
    </div>
  );
}

/** Labelled horizontal bars, each sized against the largest value. */
export function BarList({ items }: { items: Segment[] }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {items.map((item) => (
        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px" }}>
          <span style={{ width: "84px", flexShrink: 0 }}>{item.label}</span>
          <div style={{ flex: 1, height: "12px", background: colors.track, borderRadius: "6px" }}>
            <div
              style={{
                width: `${(100 * item.value) / max}%`,
                minWidth: item.value > 0 ? "6px" : 0,
                height: "12px",
                background: item.color,
                borderRadius: "6px",
              }}
            />
          </div>
          <strong style={{ width: "40px", textAlign: "right" }}>{item.value.toLocaleString("en")}</strong>
        </div>
      ))}
    </div>
  );
}

const CIRCUMFERENCE = 339.3;

export function ScoreGauge({ score, label }: { score: number; label: string }) {
  const filled = (CIRCUMFERENCE * Math.max(0, Math.min(100, score))) / 100;
  return (
    <svg width="200" height="200" viewBox="0 0 140 140" role="img" aria-label={`Overall SEO health score ${score} percent`}>
      <circle cx="70" cy="70" r="54" fill="none" stroke={colors.track} strokeWidth="14" />
      <circle
        cx="70"
        cy="70"
        r="54"
        fill="none"
        stroke={scoreColor(score)}
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
        transform="rotate(-90 70 70)"
      />
      <text x="70" y="76" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="34" fontWeight="800" fill={colors.text}>
        {score}%
      </text>
      <text x="70" y="94" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="10" fill={colors.muted}>
        {label}
      </text>
    </svg>
  );
}

export function Donut({ segments, centre, caption, label }: { segments: Segment[]; centre: string; caption: string; label: string }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  let offset = 0;
  return (
    <svg width="170" height="170" viewBox="0 0 140 140" role="img" aria-label={label}>
      <circle cx="70" cy="70" r="54" fill="none" stroke={colors.track} strokeWidth="16" />
      {total > 0
        ? segments.map((segment) => {
            const length = (CIRCUMFERENCE * segment.value) / total;
            const circle = (
              <circle
                key={segment.label}
                cx="70"
                cy="70"
                r="54"
                fill="none"
                stroke={segment.color}
                strokeWidth="16"
                strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 70 70)"
              />
            );
            offset += length;
            return segment.value > 0 ? circle : null;
          })
        : null}
      <text x="70" y="76" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="30" fontWeight="800" fill={colors.text}>
        {centre}
      </text>
      <text x="70" y="92" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="10" fill={colors.muted}>
        {caption}
      </text>
    </svg>
  );
}

export function SectionHeading({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "8px" }}>
      <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 800, letterSpacing: "-0.01em" }}>{title}</h2>
      <div style={{ fontSize: "14px", color: colors.muted }}>{sub}</div>
    </div>
  );
}

export function Grid({ children, min = 340 }: { children: ReactNode; min?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`, gap: "24px" }}>
      {children}
    </div>
  );
}

export const primaryButton: CSSProperties = {
  minHeight: "48px",
  padding: "0 24px",
  border: 0,
  borderRadius: "10px",
  background: "#2563EB",
  color: "#FFFFFF",
  fontWeight: 700,
  fontSize: "15px",
  fontFamily: "inherit",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  boxSizing: "border-box",
  textAlign: "center",
};

export const secondaryButton: CSSProperties = {
  ...primaryButton,
  border: "1px solid #2563EB",
  background: "#FFFFFF",
  color: "#1D4ED8",
};

/** The blue band that invites the visitor to have issues fixed for them. */
export function FixBand({ title, text, action, href }: { title: string; text: string; action: string; href: string }) {
  return (
    <div
      style={{
        background: "#EFF6FF",
        border: "1px solid #BFDBFE",
        borderRadius: "16px",
        padding: "20px 24px",
        display: "flex",
        gap: "16px",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ flex: 1, minWidth: "min(260px, 100%)" }}>
        <div style={{ fontSize: "17px", fontWeight: 800, color: "#1E3A8A" }}>{title}</div>
        <div style={{ fontSize: "14px", color: "#1E293B", marginTop: "4px" }}>{text}</div>
      </div>
      <a href={href} style={{ ...primaryButton, color: "#FFFFFF" }}>
        {action}
      </a>
    </div>
  );
}

export function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ flexShrink: 0, marginTop: "2px" }}>
      <path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="#15803D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
