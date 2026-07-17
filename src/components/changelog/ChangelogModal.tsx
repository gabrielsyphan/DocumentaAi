import { Sparkles, X as XIcon } from "lucide-react";
import { CHANGELOG } from "../../lib/changelog";

interface Props {
  open: boolean;
  currentVersion: string;
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function ChangelogModal({ open, currentVersion, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="cl-overlay" onClick={onClose}>
      <div className="cl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cl-header">
          <span className="cl-title">
            <Sparkles size={14} /> Notas de atualização
          </span>
          <button className="cl-close" onClick={onClose} title="Fechar">
            <XIcon size={14} />
          </button>
        </div>

        <div className="cl-list">
          {CHANGELOG.map((release) => (
            <section key={release.version} className="cl-release">
              <div className="cl-release-header">
                <span className="cl-version">v{release.version}</span>
                {release.version === currentVersion && (
                  <span className="cl-current-badge">instalada</span>
                )}
                <span className="cl-release-title">{release.title}</span>
                <span className="cl-date">{formatDate(release.date)}</span>
              </div>
              <ul className="cl-items">
                {release.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
