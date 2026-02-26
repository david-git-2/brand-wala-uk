import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";
import { AppProviders } from "./app/providers.jsx";
import { installNetworkActivityTracker } from "./lib/networkActivity";

installNetworkActivityTracker();

ReactDOM.createRoot(document.getElementById("root")).render(
  // <React.StrictMode>
  <HashRouter>
    <AppProviders>
      <App />
    </AppProviders>
  </HashRouter>,
  // </React.StrictMode>
);
