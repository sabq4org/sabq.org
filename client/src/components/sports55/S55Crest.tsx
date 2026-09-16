import { useState } from "react";
import type { RslTeam } from "@/components/rsl/rslTypes";

/** شعار الفريق الحقيقي (من المزوّد) مع بديل نصّي عند فشل الصورة */
export function S55Crest({ team, size }: { team: RslTeam; size?: "mini" | "lg" }) {
  const [err, setErr] = useState(false);
  const initials = (team?.name || "?").replace(/^ال/, "").trim().slice(0, 2) || "?";
  return (
    <span className={`crest${size ? ` ${size}` : ""}`} title={team?.name}>
      {team?.logo && !err ? (
        <img src={team.logo} alt="" loading="lazy" onError={() => setErr(true)} />
      ) : (
        <span className="fallback">{initials}</span>
      )}
    </span>
  );
}
