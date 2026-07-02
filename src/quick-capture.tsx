import React from "react";
import ReactDOM from "react-dom/client";
import QuickCaptureApp from "./QuickCaptureApp";
import "./index.css";

// Aplica o tema salvo antes do primeiro render para evitar flash
const saved = (localStorage.getItem("documentaai-theme") ?? "dark") as string;
document.documentElement.setAttribute("data-theme", saved);

// Acompanha mudanças de tema feitas na janela principal
window.addEventListener("storage", (e) => {
  if (e.key === "documentaai-theme" && e.newValue) {
    document.documentElement.setAttribute("data-theme", e.newValue);
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QuickCaptureApp />
  </React.StrictMode>
);
