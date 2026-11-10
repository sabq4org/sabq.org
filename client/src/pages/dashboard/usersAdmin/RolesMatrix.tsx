import type { ReactNode } from "react";
import { PERMISSION_TRACKS } from "@shared/userAdmin";
import { READER_LIKE_ROLE_KEYS } from "@shared/effectiveRoles";
import type { AdminRole } from "./types";

const MATRIX_TRACKS = PERMISSION_TRACKS.filter((t) => ["articles", "opinion", "social"].includes(t.key));

export function RolesMatrix({ roles }: { roles: AdminRole[] }) {
  const cols = roles.filter((r) => r.status !== "archived" && !READER_LIKE_ROLE_KEYS.has(r.name.trim().toLowerCase()));
  return (
    <div className="overflow-x-auto rounded-lg border" data-testid="roles-matrix">
      <table className="w-full min-w-[760px] border-collapse">
        <thead>
          <tr>
            <th scope="col" className="sticky start-0 z-10 whitespace-nowrap border-b bg-muted px-3 py-2.5 text-start text-[12.5px] font-semibold text-muted-foreground">
              الخطوة
            </th>
            {cols.map((r) => (
              <th key={r.id} scope="col" className="whitespace-nowrap border-b bg-muted/50 px-3 py-2.5 text-center align-bottom text-[12.5px] font-semibold text-muted-foreground">
                {r.nameAr}
                {r.status !== "active" && <span className="block text-[11px] font-normal">({r.status === "closed" ? "مغلق" : "معطّل"})</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MATRIX_TRACKS.map((track) => (
            <MatrixGroup key={track.key} label={track.label} span={cols.length + 1}>
              {track.steps.map((step) => (
                <tr key={step.code}>
                  <th scope="row" className="sticky start-0 z-10 whitespace-nowrap border-b bg-background px-3 py-2 text-start text-sm font-normal">
                    {step.label}
                  </th>
                  {cols.map((r) => {
                    const s = r.steps.find((x) => x.code === step.code);
                    return (
                      <td key={r.id} className="whitespace-nowrap border-b px-3 py-2 text-center text-sm">
                        {s?.granted ? (
                          <span className="font-bold text-success" aria-label="نعم">✓</span>
                        ) : s?.locked ? (
                          <span className="text-xs font-semibold text-warning">محجوب دائمًا</span>
                        ) : (
                          <span className="text-muted-foreground" aria-label="لا">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </MatrixGroup>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatrixGroup({ label, span, children }: { label: string; span: number; children: ReactNode }) {
  return (
    <>
      <tr>
        <td colSpan={span} className="border-b bg-muted/50 px-3 py-2 text-start text-[12.5px] font-semibold text-muted-foreground">
          {label}
        </td>
      </tr>
      {children}
    </>
  );
}
