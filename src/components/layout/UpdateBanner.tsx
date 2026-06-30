import { Download, RefreshCw } from "lucide-react";
import { useUpdater } from "../../hooks/useUpdater";

export default function UpdateBanner() {
  const { update, progress, installing, installUpdate } = useUpdater();

  if (!update) return null;

  return (
    <div className="update-banner">
      <div className="update-banner-info">
        <span className="update-banner-dot" />
        <span>v{update.version} disponível</span>
      </div>
      <button
        className="update-banner-btn"
        onClick={installUpdate}
        disabled={installing}
      >
        {installing ? (
          <>
            <RefreshCw size={11} className="update-spinning" />
            {progress !== null ? `${progress}%` : "Baixando…"}
          </>
        ) : (
          <>
            <Download size={11} />
            Atualizar
          </>
        )}
      </button>
    </div>
  );
}
