import "./storage-shim.js";
import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./KiAct_BCorp_Diagnostic.jsx";
createRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);
