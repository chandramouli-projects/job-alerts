/* Entry point: the styles (same files and order as the old app), then the React app.
   The styles are still read from frontend/css so both apps look the same while both exist. */
import "../../frontend/css/base/base.css";
import "../../frontend/css/pages/loading.css";
import "../../frontend/css/components/header.css";
import "../../frontend/css/components/password-field.css";
import "../../frontend/css/pages/login.css";
import "../../frontend/css/pages/login-background.css";
import "../../frontend/css/pages/forgot-password.css";
import "../../frontend/css/pages/onboarding.css";
import "../../frontend/css/base/layout.css";
import "../../frontend/css/base/components.css";
import "../../frontend/css/components/job-card.css";
import "../../frontend/css/components/job-insights.css";
import "../../frontend/css/pages/jobs.css";
import "../../frontend/css/components/filters.css";
import "../../frontend/css/components/saved-searches.css";
import "../../frontend/css/components/job-details.css";
import "../../frontend/css/pages/my-jobs.css";
import "../../frontend/css/components/applications.css";
import "../../frontend/css/components/card-size.css";
import "../../frontend/css/components/progress.css";
import "../../frontend/css/pages/profile.css";
import "../../frontend/css/components/resume-upload.css";
import "../../frontend/css/components/rail.css";
import "../../frontend/css/components/notifications.css";
import "../../frontend/css/components/mail-connect.css";
import "../../frontend/css/components/hidden-jobs.css";
import "../../frontend/css/components/tooltip.css";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./core/pwa.js";
import "./test-hooks.js";

createRoot(document.getElementById("root")).render(<App />);
