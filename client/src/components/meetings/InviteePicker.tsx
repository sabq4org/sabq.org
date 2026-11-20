// «من يُدعى؟» في نافذة الاجتماع الجديد: جميع المنسوبين، أو مزيج من فئات أدوار
// (المراسلون، كتّاب الرأي…) وإدارات وأسماء متفرقة. العدّاد يحسب المدعوين
// الفعليين بلا تكرار؛ الحساب نفسه (shared/meetingInvitees) يعيده الخادم عند الإنشاء.

import { useMemo, useState } from "react";
import { Link2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  departmentMembers,
  resolveMeetingInvitees,
  roleGroupMembers,
  type InviteeCandidate,
} from "@shared/meetingInvitees";

export type InviteeStaff = InviteeCandidate & {
  name: string;
  avatarUrl: string | null;
  department: string | null;
};

type Props = {
  staff: InviteeStaff[];
  departments: { id: string; nameAr: string }[];
  roleGroups: { id: string; label: string }[];
  hostUserId: string | null;
  everyone: boolean;
  onEveryoneChange: (v: boolean) => void;
  selectedGroups: string[];
  onGroupsChange: (v: string[]) => void;
  selectedDepartments: string[];
  onDepartmentsChange: (v: string[]) => void;
  memberIds: string[];
  onMembersChange: (v: string[]) => void;
};

const toggle = (list: string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

function Chip({
  label, count, selected, onClick, testId,
}: { label: string; count: number; selected: boolean; onClick: () => void; testId: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={count === 0 && !selected}
      aria-pressed={selected}
      className={cn(
        "inline-flex min-h-[40px] items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors disabled:opacity-50",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:border-primary/50",
      )}
      data-testid={testId}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[11px] tabular-nums",
          selected ? "bg-white/25 text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}

export function InviteePicker(props: Props) {
  const {
    staff: allStaff, departments, roleGroups, hostUserId, everyone, onEveryoneChange,
    selectedGroups, onGroupsChange, selectedDepartments, onDepartmentsChange, memberIds, onMembersChange,
  } = props;
  const [search, setSearch] = useState("");

  // المضيف يدخل دائماً — لا يُعدّ ضمن المدعوين
  const staff = useMemo(() => allStaff.filter((s) => s.userId !== hostUserId), [allStaff, hostUserId]);

  const groupCounts = useMemo(
    () => new Map(roleGroups.map((g) => [g.id, roleGroupMembers(staff, g.id).length])),
    [roleGroups, staff],
  );
  const deptCounts = useMemo(
    () => new Map(departments.map((d) => [d.id, departmentMembers(staff, d.id).length])),
    [departments, staff],
  );
  const visibleDepartments = departments.filter(
    (d) => (deptCounts.get(d.id) ?? 0) > 0 || selectedDepartments.includes(d.id),
  );

  const resolved = useMemo(
    () =>
      resolveMeetingInvitees(staff, {
        roleGroups: selectedGroups,
        departmentIds: selectedDepartments,
        memberIds,
      }),
    [staff, selectedGroups, selectedDepartments, memberIds],
  );

  const filteredStaff = useMemo(() => {
    const q = search.trim();
    if (!q) return staff;
    return staff.filter((s) => s.name.includes(q) || (s.department ?? "").includes(q));
  }, [staff, search]);

  const breakdown = useMemo(() => {
    const parts: string[] = [];
    for (const g of roleGroups) {
      if (selectedGroups.includes(g.id)) parts.push(`${g.label} ${groupCounts.get(g.id) ?? 0}`);
    }
    for (const d of departments) {
      if (selectedDepartments.includes(d.id)) parts.push(`${d.nameAr} ${deptCounts.get(d.id) ?? 0}`);
    }
    if (resolved.extraNames) parts.push(`${resolved.extraNames} بالاسم`);
    const sum =
      selectedGroups.reduce((n, id) => n + (groupCounts.get(id) ?? 0), 0) +
      selectedDepartments.reduce((n, id) => n + (deptCounts.get(id) ?? 0), 0) +
      resolved.extraNames;
    const dupes = sum - resolved.userIds.length;
    return parts.join(" + ") + (dupes > 0 ? ` (بلا تكرار ${dupes})` : "");
  }, [roleGroups, departments, selectedGroups, selectedDepartments, groupCounts, deptCounts, resolved]);

  const total = everyone ? staff.length : resolved.userIds.length;
  const linkOnly = !everyone && resolved.userIds.length === 0 && !selectedGroups.length && !selectedDepartments.length;

  return (
    <div className="space-y-3" data-testid="invitee-picker">
      <div>
        <div className="text-xs font-bold">من يُدعى؟</div>
        <div className="text-[11px] leading-5 text-muted-foreground">
          اجمع أكثر من فئة، وأضف أسماء متفرقة إن احتجت.
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5">
        <div>
          <div className="text-sm font-bold">جميع المنسوبين</div>
          <div className="text-[11px] leading-5 text-muted-foreground">كل من له حساب في اللوحة</div>
        </div>
        <Switch checked={everyone} onCheckedChange={onEveryoneChange} data-testid="switch-invite-everyone" />
      </div>

      {!everyone ? (
        <div className="space-y-4">
          {roleGroups.length ? (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">الفئات</div>
              <div className="flex flex-wrap gap-2">
                {roleGroups.map((g) => (
                  <Chip
                    key={g.id}
                    label={g.label}
                    count={groupCounts.get(g.id) ?? 0}
                    selected={selectedGroups.includes(g.id)}
                    onClick={() => onGroupsChange(toggle(selectedGroups, g.id))}
                    testId={`chip-group-${g.id}`}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {visibleDepartments.length ? (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">الإدارات</div>
              <div className="flex flex-wrap gap-2">
                {visibleDepartments.map((d) => (
                  <Chip
                    key={d.id}
                    label={d.nameAr}
                    count={deptCounts.get(d.id) ?? 0}
                    selected={selectedDepartments.includes(d.id)}
                    onClick={() => onDepartmentsChange(toggle(selectedDepartments, d.id))}
                    testId={`chip-department-${d.id}`}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <label htmlFor="invitee-search" className="text-xs font-semibold text-muted-foreground">
              أسماء إضافية
            </label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="invitee-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالاسم أو الإدارة"
                className="rounded-full pr-9"
              />
            </div>
            <div className="max-h-52 overflow-y-auto rounded-lg border border-border">
              {filteredStaff.map((s) => {
                const viaGroup = resolved.viaGroup.has(s.userId);
                const picked = memberIds.includes(s.userId);
                return (
                  <button
                    key={s.userId}
                    type="button"
                    onClick={() => !viaGroup && onMembersChange(toggle(memberIds, s.userId))}
                    aria-pressed={viaGroup || picked}
                    className={cn(
                      "flex w-full items-center gap-2 border-b border-border px-3 py-2 text-right text-sm last:border-b-0",
                      picked && !viaGroup ? "bg-primary/10" : viaGroup ? "cursor-default" : "hover:bg-muted/50",
                    )}
                    data-testid={`row-invitee-${s.userId}`}
                  >
                    <Avatar className="h-7 w-7">
                      {s.avatarUrl ? <AvatarImage src={s.avatarUrl} alt="" /> : null}
                      <AvatarFallback className="text-[10px]">{s.name.trim().slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      {s.name}
                      {s.department ? (
                        <span className="mr-1 text-xs text-muted-foreground">· {s.department}</span>
                      ) : null}
                    </span>
                    {viaGroup ? (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        ضمن فئة
                      </span>
                    ) : picked ? (
                      <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-primary-foreground">
                        مختار
                      </span>
                    ) : null}
                  </button>
                );
              })}
              {filteredStaff.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">لا نتائج</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-3 rounded-xl bg-primary/10 px-4 py-3" data-testid="invitee-total">
        {linkOnly ? (
          <div>
            <div className="text-sm font-bold">بالرابط فقط</div>
            <div className="text-[11px] leading-5 text-muted-foreground">
              لم تختر فئة أو اسمًا: يدخل من تشاركه رابط الدعوة
            </div>
          </div>
        ) : (
          <>
            <span className="text-3xl font-bold leading-none tabular-nums text-primary">{total}</span>
            <div className="min-w-0">
              <div className="text-sm font-bold">مدعوًا</div>
              <div className="text-[11px] leading-5 text-muted-foreground">
                {everyone ? "جميع المنسوبين النشطين" : breakdown}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-border px-3.5 py-2.5">
        <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">ومن لديه الرابط</div>
          <div className="text-[11px] leading-5 text-muted-foreground">
            تشاركه بعد الإنشاء مع من تريد، ولو من خارج الفئات
          </div>
        </div>
      </div>
    </div>
  );
}
