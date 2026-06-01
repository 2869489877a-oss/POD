import type { ReactNode } from "react";

type PageShellProps = {
  title: string;
  description: string;
  children?: ReactNode;
};

export function PageShell({ title, description, children }: PageShellProps) {
  return (
    <section className="space-y-6">
      <div className="pb-5">
        <span className="inline-flex items-center rounded-full bg-gradient-to-r from-emerald-50 to-teal-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200/60">
          POD 工作台
        </span>
        <h2 className="mt-3 text-2xl font-bold text-slate-900">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  );
}
