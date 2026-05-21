import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
// initNative is called inside App.jsx — importing capacitor.js here AND
// having AuthContext.jsx import it too creates a Rolldown TDZ at the entry point.

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
