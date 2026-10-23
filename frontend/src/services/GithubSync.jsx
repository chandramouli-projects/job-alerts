/* The "Connect job search" panel (old openGh() in frontend/js/services/github-sync.js).
   Registers sheet kind "gh"; open it with openGh(). */
import { S } from "../core/state.js";
import { registerSheet } from "../components/Sheet.jsx";
import { ghSave } from "./github-sync.js";

// what is typed in the panel; reset each time the panel opens
const draft = { at: 0, token: "", repo: "" };

function GhBody() {
  return (
    <>
      <div className="card">
        <h3>Make a key</h3>
        <ol className="why" style={{ color: "var(--ink)" }}>
          <li>
            Open{" "}
            <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">
              GitHub → New fine-grained token
            </a>
          </li>
          <li>
            Repository access: only <b>job-alerts</b>
          </li>
          <li>
            Permissions: <b>Contents → Read and write</b> (nothing else)
          </li>
          <li>Expiration: 1 year. Generate and copy the key.</li>
        </ol>
      </div>
      <label className="lbl" htmlFor="ghTok">
        Paste the key
      </label>
      <input
        className="inp"
        id="ghTok"
        placeholder="github_pat_…"
        defaultValue={draft.token}
        onChange={e => (draft.token = e.target.value)}
      />
      <div style={{ marginTop: 12 }}>
        <label className="lbl" htmlFor="ghRepo">
          Repository
        </label>
        <input
          className="inp"
          id="ghRepo"
          defaultValue={draft.repo}
          onChange={e => (draft.repo = e.target.value)}
        />
      </div>
    </>
  );
}

registerSheet("gh", props => {
  if (draft.at !== props.at)
    Object.assign(draft, { at: props.at, token: S.U.settings.ghToken, repo: S.U.settings.ghRepo });
  return {
    title: "Connect job search",
    body: <GhBody key={props.at} />,
    foot: (
      <button
        className="btn"
        data-ghsave=""
        style={{ flex: 1 }}
        onClick={() => ghSave(draft.token, draft.repo)}
      >
        Connect
      </button>
    ),
  };
});
