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
        <span className="inline-flex items-center rounded-full bg-gradient-to-r from-violet-500/10 to-cyan-500/10 px-3 py-1 text-xs font-semibold text-violet-300 ring-1 ring-violet-500/20">
          POD 工作台
        </span>
        <h2 className="mt-3 text-2xl font-bold text-white">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{description}</p>
      </div>
      {children}
    </section>
  );
}
