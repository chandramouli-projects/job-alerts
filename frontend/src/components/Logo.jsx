/* Company logo, or its first letter when there is no logo or it doesn't load (old helpers.js logo()) */
import { useState } from "react";
import { PREVIEW } from "../core/constants.js";

export function Logo({ job: j }) {
  const [broken, setBroken] = useState(false);
  const letter = (j.company || "?")[0].toUpperCase();
  return (
    <span className="logo">
      {j.logo && !PREVIEW && !broken ? (
        <img src={j.logo} alt="" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        letter
      )}
    </span>
  );
}
