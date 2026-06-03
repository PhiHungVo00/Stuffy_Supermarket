import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Sentry monitoring (uncomment and configure for production):
// import * as Sentry from "@sentry/react";
// Sentry.init({
//   dsn: "https://your-dsn-here@o0.ingest.sentry.io/0",
//   tracesSampleRate: 1.0,
// });

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
