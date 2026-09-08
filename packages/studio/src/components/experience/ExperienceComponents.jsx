"use client";

import { forwardRef } from "react";

function classes(...values) {
  return values.filter(Boolean).join(" ");
}

export function ExperiencePage({ children, className = "" }) {
  return (
    <div
      className={classes(
        "h-full w-full overflow-y-auto bg-[var(--ms-color-background)] text-[var(--ms-color-text-primary)]",
        className,
      )}
    >
      <main className="mx-auto min-h-full w-full max-w-[1560px] px-4 py-6 sm:px-6 lg:px-7 lg:py-7">
        {children}
      </main>
    </div>
  );
}

export function WorkspaceHeader({ eyebrow, title, description, actions, className = "" }) {
  return (
    <header className={classes("flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="max-w-3xl">
        {eyebrow && <p className="text-[var(--ms-font-caption)] font-bold uppercase tracking-[0.28em] text-[var(--ms-color-gold-primary)]">{eyebrow}</p>}
        <h1 className="mt-2 text-[length:var(--ms-font-page-heading)] font-semibold leading-[1.08] tracking-[-0.035em]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[length:var(--ms-font-small)] leading-5 text-[var(--ms-color-text-secondary)]">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}

export function WorkspaceHero({ children, className = "" }) {
  return (
    <section
      className={classes(
        "relative overflow-hidden rounded-[var(--ms-radius-card-hero)] border border-[var(--ms-color-border-emphasized)] bg-[linear-gradient(135deg,rgba(212,168,88,0.09),rgba(25,23,20,0.98)_52%,rgba(232,32,112,0.05))] p-5 shadow-[var(--ms-shadow-gold)] sm:p-6",
        className,
      )}
    >
      <div aria-hidden="true" className="absolute -right-24 -top-28 h-64 w-64 rounded-full bg-[var(--ms-color-pink-primary)] opacity-[0.07] blur-3xl" />
      <div className="relative">{children}</div>
    </section>
  );
}

export function WorkspaceSection({ title, description, actions, children, className = "" }) {
  return (
    <section className={classes("mt-6", className)}>
      {(title || description || actions) && (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            {title && <h2 className="text-[length:var(--ms-font-section-heading)] font-semibold tracking-[-0.02em]">{title}</h2>}
            {description && <p className="mt-1 text-[length:var(--ms-font-small)] text-[var(--ms-color-text-muted)]">{description}</p>}
          </div>
          {actions && <div>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export const WorkspaceCard = forwardRef(function WorkspaceCard(
  { as: Element = "div", children, className = "", interactive = false, ...props },
  ref,
) {
  return (
    <Element
      ref={ref}
      className={classes(
        "rounded-[var(--ms-radius-card)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-panel)] p-4 shadow-[var(--ms-shadow-card)]",
        interactive && "transition-[transform,border-color,background-color,box-shadow] duration-[var(--ms-motion-card)] ease-[var(--ms-ease-standard)] hover:-translate-y-0.5 hover:border-[var(--ms-color-border-emphasized)] hover:bg-[var(--ms-color-panel-hover)] hover:shadow-[var(--ms-shadow-card-hover)]",
        className,
      )}
      {...props}
    >
      {children}
    </Element>
  );
});

export function StudioLauncherCard({ href, icon, title, description, meta, className = "" }) {
  return (
    <WorkspaceCard as="a" href={href} interactive className={classes("group block min-h-40", className)}>
      <div className="flex items-start justify-between gap-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-[var(--ms-radius-card-small)] border border-[var(--ms-color-border-emphasized)] bg-[rgba(212,168,88,0.08)] text-[var(--ms-color-gold-primary)]">{icon}</span>
        <span aria-hidden="true" className="text-[var(--ms-color-gold-muted)] transition-transform duration-[var(--ms-motion-hover)] group-hover:translate-x-1">→</span>
      </div>
      <h3 className="mt-6 text-[length:var(--ms-font-card-heading)] font-semibold">{title}</h3>
      <p className="mt-2 text-[length:var(--ms-font-small)] leading-5 text-[var(--ms-color-text-secondary)]">{description}</p>
      {meta && <p className="mt-4 text-[length:var(--ms-font-caption)] uppercase tracking-[0.18em] text-[var(--ms-color-text-muted)]">{meta}</p>}
    </WorkspaceCard>
  );
}

export function MetricCard({ label, value, detail, className = "" }) {
  return (
    <WorkspaceCard className={className}>
      <p className="text-[length:var(--ms-font-caption)] font-semibold uppercase tracking-[0.18em] text-[var(--ms-color-text-muted)]">{label}</p>
      <p className="mt-3 text-[length:var(--ms-font-metric)] font-semibold tracking-[-0.04em] text-[var(--ms-color-text-primary)]">{value}</p>
      {detail && <p className="mt-1 text-[length:var(--ms-font-small)] text-[var(--ms-color-text-secondary)]">{detail}</p>}
    </WorkspaceCard>
  );
}

export const PrimaryButton = forwardRef(function PrimaryButton({ as: Element = "button", className = "", children, ...props }, ref) {
  return <Element ref={ref} className={classes("inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--ms-radius-button)] bg-[var(--ms-color-pink-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-[var(--ms-shadow-pink)] transition-[background-color,transform,box-shadow] duration-[var(--ms-motion-hover)] hover:-translate-y-px hover:bg-[var(--ms-color-pink-hover)]", className)} {...props}>{children}</Element>;
});

export const SecondaryButton = forwardRef(function SecondaryButton({ as: Element = "button", className = "", children, ...props }, ref) {
  return <Element ref={ref} className={classes("inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--ms-radius-button)] border border-[var(--ms-color-border-emphasized)] bg-[rgba(212,168,88,0.06)] px-5 py-2.5 text-sm font-semibold text-[var(--ms-color-text-primary)] transition-[background-color,border-color,transform] duration-[var(--ms-motion-hover)] hover:-translate-y-px hover:bg-[rgba(212,168,88,0.12)]", className)} {...props}>{children}</Element>;
});

const badgeTones = {
  neutral: "border-[var(--ms-color-border-subtle)] bg-white/[0.04] text-[var(--ms-color-text-secondary)]",
  gold: "border-[var(--ms-color-border-emphasized)] bg-[rgba(212,168,88,0.09)] text-[#f0d9a8]",
  success: "border-[rgba(99,197,155,0.35)] bg-[rgba(99,197,155,0.09)] text-[var(--ms-color-success)]",
  warning: "border-[rgba(229,184,92,0.35)] bg-[rgba(229,184,92,0.09)] text-[var(--ms-color-warning)]",
  error: "border-[rgba(239,107,114,0.35)] bg-[rgba(239,107,114,0.09)] text-[var(--ms-color-error)]",
};

export function StatusBadge({ children, tone = "neutral", dot = false, className = "" }) {
  return <span className={classes("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[length:var(--ms-font-caption)] font-semibold uppercase tracking-[0.13em]", badgeTones[tone] || badgeTones.neutral, className)}>{dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}{children}</span>;
}

function StateShell({ title, description, action, icon, tone = "gold", role, className = "" }) {
  const toneClass = tone === "error" ? "text-[var(--ms-color-error)]" : "text-[var(--ms-color-gold-primary)]";
  return (
    <div role={role} className={classes("rounded-[var(--ms-radius-card)] border border-dashed border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-panel)] px-6 py-10 text-center", className)}>
      {icon && <div className={classes("mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-current bg-black/10", toneClass)}>{icon}</div>}
      <h3 className="mt-4 text-[length:var(--ms-font-card-heading)] font-semibold">{title}</h3>
      {description && <p className="mx-auto mt-2 max-w-lg text-[length:var(--ms-font-small)] leading-5 text-[var(--ms-color-text-secondary)]">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function EmptyState(props) { return <StateShell {...props} />; }
export function LoadingState({ title = "Loading", description = "Gathering your workspace data…", ...props }) { return <StateShell role="status" title={title} description={description} icon={<span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />} {...props} />; }
export function ErrorState({ title = "Something went wrong", description, ...props }) { return <StateShell role="alert" tone="error" title={title} description={description} icon={<span aria-hidden="true">!</span>} {...props} />; }
