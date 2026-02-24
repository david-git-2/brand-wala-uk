import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

import { AuthProvider } from "./auth/AuthProvider";
import { CartProvider } from "./cart/CartProvider.jsx";
import { installNetworkActivityTracker } from "./lib/networkActivity";

installNetworkActivityTracker();

ReactDOM.createRoot(document.getElementById("root")).render(
  // <React.StrictMode>
  <HashRouter>
    <AuthProvider>
      <CartProvider>
        <App />
      </CartProvider>
    </AuthProvider>
  </HashRouter>,
  // </React.StrictMode>
);
