"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import {
  createMember,
  deleteMember,
  setMemberStatus,
  setMemberQuota,
  resetMemberPassword,
  getMemberUsageHistory,
  type MemberRow,
  type UsageDay,
} from "@/lib/auth/admin-actions";
import { useSettings, ACCENT_COLORS } from "@/lib/settings/context";
import { useToast } from "@/components/toast";

type DialogState =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "quota"; member: MemberRow }
  | { kind: "password"; member: MemberRow }
  | { kind: "delete"; member: MemberRow }
  | { kind: "usage"; member: MemberRow };

export function MemberManager({
  initialMembers,
  currentAdminId,
}: {
  initialMembers: MemberRow[];
  currentAdminId: string;
}) {
  const { isDark, t, accent } = useSettings();
  const colors = ACCENT_COLORS[accent] ?? ACCENT_COLORS.cyan;
  const { addToast } = useToast();

  const [members, setMembers] = useState<MemberRow[]>(initialMembers);
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [isPending, startTransition] = useTransition();

  const cardClass = isDark
    ? "rounded-[10px] border border-white/[0.08] bg-[#0f0f10]"
    : "rounded-[10px] border border-black/[0.08] bg-white";

  const totals = useMemo(() => {
    return members.reduce(
      (acc, m) => {
        acc.uploads += m.today_uploads;
        acc.prints += m.today_prints;
        acc.aiGenerates += m.today_ai_generates;
        acc.apiCalls += m.today_api_calls;
        return acc;
      },
      { uploads: 0, prints: 0, aiGenerates: 0, apiCalls: 0 },
    );
  }, [members]);

  function refresh() {
    // Server actions already revalidate; force a reload of fresh data.
    window.location.reload();
  }

  function handleToggleFreeze(member: MemberRow) {
    const next = member.status === "active" ? "frozen" : "active";
    startTransition(async () => {
      const res = await setMemberStatus(member.id, next);
      if (res.success) {
        setMembers((prev) =>
          prev.map((m) => (m.id === member.id ? { ...m, status: next } : m)),
        );
        addToast(
          next === "frozen" ? t("账号已冻结", "Account frozen") : t("账号已解冻", "Account unfrozen"),
          "success",
        );
      } else {
        addToast(res.error ?? t("操作失败", "Operation failed"), "error");
      }
    });
  }

  const statCards = [
    { labelZh: "今日上传", labelEn: "Uploads Today", value: totals.uploads },
    { labelZh: "今日印花提取", labelEn: "Prints Today", value: totals.prints },
    { labelZh: "今日 AI 生图", labelEn: "AI Images Today", value: totals.aiGenerates },
    { labelZh: "今日 API 调用", labelEn: "API Calls Today", value: totals.apiCalls },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Today usage overview */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <section key={card.labelZh} className={`p-5 ${cardClass}`}>
            <p className={`text-xs ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
              {t(card.labelZh, card.labelEn)}
            </p>
            <p
              className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
                isDark ? "text-white" : "text-zinc-900"
              }`}
            >
              {card.value}
            </p>
          </section>
        ))}
      </div>

      {/* Member table */}
      <section className={cardClass}>
        <div
          className={`flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 ${
            isDark ? "border-white/[0.08]" : "border-black/[0.08]"
          }`}
        >
          <div>
            <h2 className={`text-sm font-semibold ${isDark ? "text-white" : "text-zinc-900"}`}>
              {t("成员账号", "Member Accounts")}
            </h2>
            <p className={`mt-0.5 text-xs ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
              {t(`共 ${members.length} 个账号`, `${members.length} accounts total`)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDialog({ kind: "create" })}
            className={primaryButtonClass("px-3.5 py-2 text-[13px] font-semibold")}
            style={{ backgroundColor: colors.primary }}
          >
            <IconGlyph name="plus" className="h-4 w-4" />
            {t("新增账号", "Add Account")}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr
                className={`text-[11px] uppercase tracking-wider ${
                  isDark ? "text-zinc-600" : "text-zinc-400"
                }`}
              >
                <th className="px-5 py-3 font-medium">{t("成员", "Member")}</th>
                <th className="px-3 py-3 font-medium">{t("角色", "Role")}</th>
                <th className="px-3 py-3 font-medium">{t("状态", "Status")}</th>
                <th className="px-3 py-3 font-medium">{t("每日生图配额", "Daily Quota")}</th>
                <th className="px-3 py-3 font-medium">{t("今日上传", "Uploads")}</th>
                <th className="px-3 py-3 font-medium">{t("今日印花", "Prints")}</th>
                <th className="px-3 py-3 font-medium">{t("今日生图", "AI Gen")}</th>
                <th className="px-3 py-3 font-medium">{t("API 调用", "API")}</th>
                <th className="px-5 py-3 text-right font-medium">{t("操作", "Actions")}</th>
              </tr>
            </thead>
            <tbody className={isDark ? "divide-y divide-white/[0.06]" : "divide-y divide-black/[0.06]"}>
              {members.map((member) => {
                const isSelf = member.id === currentAdminId;
                const frozen = member.status === "frozen";

                return (
                  <tr key={member.id} className={frozen ? "opacity-60" : undefined}>
                    <td className="px-5 py-3">
                      <p className={`text-[13px] font-medium ${isDark ? "text-zinc-200" : "text-zinc-900"}`}>
                        {member.display_name || member.email.split("@")[0]}
                        {isSelf ? (
                          <span className={`ml-1.5 text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                            {t("(我)", "(me)")}
                          </span>
                        ) : null}
                      </p>
                      <p className={`font-mono text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                        {member.email}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          member.role === "admin"
                            ? "bg-amber-500/10 text-amber-500"
                            : isDark
                              ? "bg-white/[0.06] text-zinc-300"
                              : "bg-black/[0.05] text-zinc-600"
                        }`}
                      >
                        {member.role === "admin" ? t("管理员", "Admin") : t("员工", "Employee")}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          frozen ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-500"
                        }`}
                      >
                        {frozen ? t("已冻结", "Frozen") : t("正常", "Active")}
                      </span>
                    </td>
                    <td className={`px-3 py-3 font-mono text-[13px] tabular-nums ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                      {member.role === "admin" ? t("不限", "Unlimited") : member.daily_image_quota}
                    </td>
                    <td className={`px-3 py-3 font-mono text-[13px] tabular-nums ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                      {member.today_uploads}
                    </td>
                    <td className={`px-3 py-3 font-mono text-[13px] tabular-nums ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                      {member.today_prints}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`font-mono text-[13px] tabular-nums ${
                          member.role !== "admin" &&
                          member.daily_image_quota > 0 &&
                          member.today_ai_generates >= member.daily_image_quota
                            ? "text-red-500"
                            : isDark
                              ? "text-zinc-300"
                              : "text-zinc-700"
                        }`}
                      >
                        {member.today_ai_generates}
                        {member.role !== "admin" ? `/${member.daily_image_quota}` : ""}
                      </span>
                    </td>
                    <td className={`px-3 py-3 font-mono text-[13px] tabular-nums ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                      {member.today_api_calls}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <RowButton
                          label={t("用量", "Usage")}
                          icon="activity"
                          isDark={isDark}
                          onClick={() => setDialog({ kind: "usage", member })}
                        />
                        <RowButton
                          label={t("配额", "Quota")}
                          icon="gauge"
                          isDark={isDark}
                          onClick={() => setDialog({ kind: "quota", member })}
                        />
                        <RowButton
                          label={t("改密", "Password")}
                          icon="key"
                          isDark={isDark}
                          onClick={() => setDialog({ kind: "password", member })}
                        />
                        {!isSelf ? (
                          <>
                            <RowButton
                              label={frozen ? t("解冻", "Unfreeze") : t("冻结", "Freeze")}
                              icon={frozen ? "unlock" : "lock"}
                              variant={frozen ? "success" : "warning"}
                              isDark={isDark}
                              disabled={isPending}
                              onClick={() => handleToggleFreeze(member)}
                            />
                            <RowButton
                              label={t("删除", "Delete")}
                              icon="trash"
                              isDark={isDark}
                              danger
                              onClick={() => setDialog({ kind: "delete", member })}
                            />
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {dialog.kind === "create" ? (
        <CreateMemberDialog
          isDark={isDark}
          t={t}
          accentColor={colors.primary}
          onClose={() => setDialog({ kind: "none" })}
          onCreated={refresh}
        />
      ) : null}

      {dialog.kind === "quota" ? (
        <QuotaDialog
          member={dialog.member}
          isDark={isDark}
          t={t}
          accentColor={colors.primary}
          onClose={() => setDialog({ kind: "none" })}
          onSaved={(quota) => {
            setMembers((prev) =>
              prev.map((m) => (m.id === dialog.member.id ? { ...m, daily_image_quota: quota } : m)),
            );
            setDialog({ kind: "none" });
          }}
        />
      ) : null}

      {dialog.kind === "password" ? (
        <PasswordDialog
          member={dialog.member}
          isDark={isDark}
          t={t}
          accentColor={colors.primary}
          onClose={() => setDialog({ kind: "none" })}
        />
      ) : null}

      {dialog.kind === "delete" ? (
        <DeleteDialog
          member={dialog.member}
          isDark={isDark}
          t={t}
          onClose={() => setDialog({ kind: "none" })}
          onDeleted={() => {
            setMembers((prev) => prev.filter((m) => m.id !== dialog.member.id));
            setDialog({ kind: "none" });
          }}
        />
      ) : null}

      {dialog.kind === "usage" ? (
        <UsageDialog
          member={dialog.member}
          isDark={isDark}
          t={t}
          accentColor={colors.primary}
          onClose={() => setDialog({ kind: "none" })}
        />
      ) : null}
    </div>
  );
}

/* ---------- small building blocks ---------- */

type ButtonIconName = "activity" | "gauge" | "key" | "lock" | "plus" | "trash" | "unlock" | "x";

const buttonMotionClass =
  "inline-flex items-center justify-center gap-2 outline-none transition-all duration-150 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[var(--accent)] active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

function primaryButtonClass(extra = "") {
  return `${buttonMotionClass} rounded-lg text-white shadow-sm hover:shadow-lg ${extra}`;
}

function secondaryButtonClass(isDark: boolean, extra = "") {
  return [
    buttonMotionClass,
    "rounded-lg border shadow-sm",
    isDark
      ? "border-white/[0.1] bg-white/[0.04] text-zinc-200 hover:border-white/[0.2] hover:bg-white/[0.08] hover:text-white"
      : "border-black/[0.08] bg-white text-zinc-700 hover:border-black/[0.16] hover:bg-zinc-50 hover:text-zinc-950",
    extra,
  ].join(" ");
}

function solidDangerButtonClass(extra = "") {
  return `${buttonMotionClass} rounded-lg bg-red-600 text-white shadow-sm hover:bg-red-500 hover:shadow-lg ${extra}`;
}

function IconGlyph({ name, className = "h-3.5 w-3.5" }: { name: ButtonIconName; className?: string }) {
  const paths: Record<ButtonIconName, React.ReactNode> = {
    activity: <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l2-7 4 14 2-7h6" />,
    gauge: <path strokeLinecap="round" strokeLinejoin="round" d="M4 14a8 8 0 1 1 16 0M12 14l4-4M8 18h8" />,
    key: <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a4 4 0 1 0-3.3 6.26L9 16H6v3H3v2h5.4l5.86-5.86A4 4 0 0 0 15 7Z" />,
    lock: <path strokeLinecap="round" strokeLinejoin="round" d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z" />,
    plus: <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />,
    trash: <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V5h6v2M8 10v9m4-9v9m4-9v9M6 7l1 14h10l1-14" />,
    unlock: <path strokeLinecap="round" strokeLinejoin="round" d="M7 11V8a5 5 0 0 1 9.5-2.2M6 11h12v9H6z" />,
    x: <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />,
  };

  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function RowButton({
  label,
  onClick,
  isDark,
  danger,
  disabled,
  icon,
  variant = "neutral",
}: {
  label: string;
  onClick: () => void;
  isDark: boolean;
  danger?: boolean;
  disabled?: boolean;
  icon?: ButtonIconName;
  variant?: "neutral" | "success" | "warning";
}) {
  const toneClass = danger
    ? "border-red-400/25 bg-red-500/10 text-red-500 hover:border-red-400/45 hover:bg-red-500/15 hover:text-red-400"
    : variant === "warning"
      ? "border-amber-400/25 bg-amber-500/10 text-amber-500 hover:border-amber-400/45 hover:bg-amber-500/15 hover:text-amber-400"
      : variant === "success"
        ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-500 hover:border-emerald-400/45 hover:bg-emerald-500/15 hover:text-emerald-400"
        : isDark
          ? "border-white/[0.1] bg-white/[0.035] text-zinc-300 hover:border-white/[0.2] hover:bg-white/[0.08] hover:text-white"
          : "border-black/[0.08] bg-white text-zinc-600 hover:border-black/[0.16] hover:bg-zinc-50 hover:text-zinc-950";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[buttonMotionClass, "h-8 rounded-lg border px-2.5 text-[12px] font-semibold shadow-sm", toneClass].join(" ")}
    >
      {icon ? <IconGlyph name={icon} /> : null}
      <span>{label}</span>
    </button>
  );
}

function DialogShell({
  title,
  isDark,
  onClose,
  children,
}: {
  title: string;
  isDark: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className={`w-full max-w-md rounded-[10px] border p-6 ${
          isDark ? "border-white/[0.1] bg-[#101011]" : "border-black/[0.1] bg-white"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className={`text-sm font-semibold ${isDark ? "text-white" : "text-zinc-900"}`}>{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={secondaryButtonClass(isDark, "h-8 w-8 p-0")}
          >
            <IconGlyph name="x" className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function inputClass(isDark: boolean) {
  return `w-full rounded-md border px-3 py-2 text-[13px] outline-none transition-colors ${
    isDark
      ? "border-white/[0.1] bg-white/[0.03] text-zinc-100 placeholder:text-zinc-600 focus:border-white/[0.25]"
      : "border-black/[0.1] bg-white text-zinc-900 placeholder:text-zinc-400 focus:border-black/[0.3]"
  }`;
}

function labelClass(isDark: boolean) {
  return `mb-1 block text-xs font-medium ${isDark ? "text-zinc-400" : "text-zinc-600"}`;
}

/* ---------- dialogs ---------- */

function CreateMemberDialog({
  isDark,
  t,
  accentColor,
  onClose,
  onCreated,
}: {
  isDark: boolean;
  t: (zh: string, en: string) => string;
  accentColor: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { addToast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"admin" | "employee">("employee");
  const [quota, setQuota] = useState(50);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createMember({ email, password, displayName, role, dailyImageQuota: quota });
      if (res.success) {
        addToast(t("账号创建成功", "Account created"), "success");
        onCreated();
      } else {
        addToast(res.error ?? t("创建失败", "Creation failed"), "error");
      }
    });
  }

  return (
    <DialogShell title={t("新增账号", "Add Account")} isDark={isDark} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <label htmlFor="cm-name" className={labelClass(isDark)}>{t("姓名 / 昵称", "Display Name")}</label>
          <input id="cm-name" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass(isDark)} placeholder={t("张三", "John Doe")} />
        </div>
        <div>
          <label htmlFor="cm-email" className={labelClass(isDark)}>{t("邮箱", "Email")}</label>
          <input id="cm-email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass(isDark)} placeholder="user@example.com" />
        </div>
        <div>
          <label htmlFor="cm-password" className={labelClass(isDark)}>{t("初始密码", "Initial Password")}</label>
          <input id="cm-password" required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass(isDark)} placeholder={t("至少 6 位", "Min 6 characters")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="cm-role" className={labelClass(isDark)}>{t("角色", "Role")}</label>
            <select id="cm-role" value={role} onChange={(e) => setRole(e.target.value as "admin" | "employee")} className={inputClass(isDark)}>
              <option value="employee">{t("员工", "Employee")}</option>
              <option value="admin">{t("管理员", "Admin")}</option>
            </select>
          </div>
          <div>
            <label htmlFor="cm-quota" className={labelClass(isDark)}>{t("每日生图配额", "Daily Quota")}</label>
            <input id="cm-quota" type="number" min={0} value={quota} onChange={(e) => setQuota(Number(e.target.value))} className={inputClass(isDark)} />
          </div>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className={primaryButtonClass("mt-2 px-4 py-2 text-[13px] font-semibold")}
          style={{ backgroundColor: accentColor }}
        >
          {isPending ? t("创建中...", "Creating...") : t("创建账号", "Create Account")}
        </button>
      </form>
    </DialogShell>
  );
}

function QuotaDialog({
  member,
  isDark,
  t,
  accentColor,
  onClose,
  onSaved,
}: {
  member: MemberRow;
  isDark: boolean;
  t: (zh: string, en: string) => string;
  accentColor: string;
  onClose: () => void;
  onSaved: (quota: number) => void;
}) {
  const { addToast } = useToast();
  const [quota, setQuota] = useState(member.daily_image_quota);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await setMemberQuota(member.id, quota);
      if (res.success) {
        addToast(t("配额已更新", "Quota updated"), "success");
        onSaved(quota);
      } else {
        addToast(res.error ?? t("更新失败", "Update failed"), "error");
      }
    });
  }

  return (
    <DialogShell title={t("调整每日生图配额", "Adjust Daily Quota")} isDark={isDark} onClose={onClose}>
      <p className={`text-[13px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
        {member.display_name || member.email}
      </p>
      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
        <div>
          <label htmlFor="qd-quota" className={labelClass(isDark)}>
            {t("每天最多可生成图片数", "Max images per day")}
          </label>
          <input id="qd-quota" type="number" min={0} value={quota} onChange={(e) => setQuota(Number(e.target.value))} className={inputClass(isDark)} />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className={primaryButtonClass("px-4 py-2 text-[13px] font-semibold")}
          style={{ backgroundColor: accentColor }}
        >
          {isPending ? t("保存中...", "Saving...") : t("保存", "Save")}
        </button>
      </form>
    </DialogShell>
  );
}

function PasswordDialog({
  member,
  isDark,
  t,
  accentColor,
  onClose,
}: {
  member: MemberRow;
  isDark: boolean;
  t: (zh: string, en: string) => string;
  accentColor: string;
  onClose: () => void;
}) {
  const { addToast } = useToast();
  const [password, setPassword] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await resetMemberPassword(member.id, password);
      if (res.success) {
        addToast(t("密码已重置", "Password reset"), "success");
        onClose();
      } else {
        addToast(res.error ?? t("重置失败", "Reset failed"), "error");
      }
    });
  }

  return (
    <DialogShell title={t("重置密码", "Reset Password")} isDark={isDark} onClose={onClose}>
      <p className={`text-[13px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
        {member.display_name || member.email}
      </p>
      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
        <div>
          <label htmlFor="pd-password" className={labelClass(isDark)}>{t("新密码", "New Password")}</label>
          <input id="pd-password" required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass(isDark)} placeholder={t("至少 6 位", "Min 6 characters")} />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className={primaryButtonClass("px-4 py-2 text-[13px] font-semibold")}
          style={{ backgroundColor: accentColor }}
        >
          {isPending ? t("重置中...", "Resetting...") : t("重置密码", "Reset Password")}
        </button>
      </form>
    </DialogShell>
  );
}

function DeleteDialog({
  member,
  isDark,
  t,
  onClose,
  onDeleted,
}: {
  member: MemberRow;
  isDark: boolean;
  t: (zh: string, en: string) => string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { addToast } = useToast();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteMember(member.id);
      if (res.success) {
        addToast(t("账号已删除", "Account deleted"), "success");
        onDeleted();
      } else {
        addToast(res.error ?? t("删除失败", "Deletion failed"), "error");
      }
    });
  }

  return (
    <DialogShell title={t("删除账号", "Delete Account")} isDark={isDark} onClose={onClose}>
      <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
        {t(
          `确定要永久删除「${member.display_name || member.email}」吗？该账号的登录权限将立即失效，此操作不可恢复。`,
          `Permanently delete "${member.display_name || member.email}"? Login access is revoked immediately. This cannot be undone.`,
        )}
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className={secondaryButtonClass(isDark, "px-3.5 py-1.5 text-[13px] font-semibold")}
        >
          {t("取消", "Cancel")}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className={solidDangerButtonClass("px-3.5 py-1.5 text-[13px] font-semibold")}
        >
          {isPending ? t("删除中...", "Deleting...") : t("确认删除", "Confirm Delete")}
        </button>
      </div>
    </DialogShell>
  );
}

function UsageDialog({
  member,
  isDark,
  t,
  accentColor,
  onClose,
}: {
  member: MemberRow;
  isDark: boolean;
  t: (zh: string, en: string) => string;
  accentColor: string;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<UsageDay[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getMemberUsageHistory(member.id, 7).then((data) => {
      if (!cancelled) setHistory(data);
    });
    return () => {
      cancelled = true;
    };
  }, [member.id]);

  const maxTotal = Math.max(
    1,
    ...(history ?? []).map((d) => d.upload + d.print_extract + d.ai_generate + d.api_call),
  );

  return (
    <DialogShell title={t("近 7 天用量", "Last 7 Days Usage")} isDark={isDark} onClose={onClose}>
      <p className={`text-[13px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
        {member.display_name || member.email}
      </p>

      {!history ? (
        <p className={`mt-4 text-[13px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
          {t("加载中...", "Loading...")}
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {history.map((day) => {
            const total = day.upload + day.print_extract + day.ai_generate + day.api_call;
            return (
              <div key={day.date} className="flex items-center gap-3">
                <span className={`w-20 shrink-0 font-mono text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                  {day.date.slice(5)}
                </span>
                <div className={`h-2 flex-1 overflow-hidden rounded-full ${isDark ? "bg-white/[0.06]" : "bg-black/[0.05]"}`}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(total / maxTotal) * 100}%`, backgroundColor: accentColor }}
                  />
                </div>
                <span
                  className={`w-32 shrink-0 text-right font-mono text-[11px] tabular-nums ${
                    isDark ? "text-zinc-400" : "text-zinc-600"
                  }`}
                  title={t(
                    `上传 ${day.upload} / 印花 ${day.print_extract} / 生图 ${day.ai_generate} / API ${day.api_call}`,
                    `Upload ${day.upload} / Print ${day.print_extract} / AI ${day.ai_generate} / API ${day.api_call}`,
                  )}
                >
                  {day.upload}·{day.print_extract}·{day.ai_generate}·{day.api_call}
                </span>
              </div>
            );
          })}
          <p className={`mt-1 text-[11px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
            {t("数字含义：上传 · 印花提取 · AI 生图 · API 调用", "Numbers: uploads · prints · AI images · API calls")}
          </p>
        </div>
      )}
    </DialogShell>
  );
}
