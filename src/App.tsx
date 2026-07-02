import { useEffect, useState } from "react";
import { usePagesStore } from "./store/pages.store";
import AppShell from "./components/layout/AppShell";
import type { Page } from "./types";
import { Bell, X, FileText } from "lucide-react";

function ReminderPopup({ reminders, onClose }: { reminders: Page[]; onClose: () => void }) {
  const { selectPage } = usePagesStore();
  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="reminder-popup-overlay" onClick={onClose}>
      <div className="reminder-popup" onClick={(e) => e.stopPropagation()}>
        <div className="reminder-popup-header">
          <span className="reminder-popup-title">
            <Bell size={14} />
            {reminders.length === 1 ? "1 lembrete" : `${reminders.length} lembretes`} para hoje
          </span>
          <button className="reminder-popup-close" onClick={onClose}><X size={14} /></button>
        </div>
        <p className="reminder-popup-date">{today}</p>
        <div className="reminder-popup-list">
          {reminders.map((p) => (
            <button
              key={p.id}
              className="reminder-popup-item"
              onClick={() => { selectPage(p.id); onClose(); }}
            >
              <span className="reminder-popup-emoji">{p.emoji ?? <FileText size={13} />}</span>
              <span className="reminder-popup-name">{p.title || "Sem título"}</span>
            </button>
          ))}
        </div>
        <button className="reminder-popup-dismiss" onClick={onClose}>Dispensar</button>
      </div>
    </div>
  );
}

export default function App() {
  const { load, pages } = usePagesStore();
  const [reminders, setReminders] = useState<Page[]>([]);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    load();
  }, []);

  // Mostra o popup uma vez por sessão, após as páginas carregarem
  useEffect(() => {
    if (shown || pages.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const due = pages.filter((p) => p.type !== "daily" && p.reminder_date === today);
    if (due.length > 0) {
      setReminders(due);
      setShown(true);
    } else {
      setShown(true); // marca como verificado mesmo sem lembretes
    }
  }, [pages, shown]);

  return (
    <>
      <AppShell />
      {reminders.length > 0 && (
        <ReminderPopup reminders={reminders} onClose={() => setReminders([])} />
      )}
    </>
  );
}
