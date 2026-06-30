import { useEffect, useState } from "react";
import { Trash2, X, icons as LucideIcons, FileText } from "lucide-react";
import type { LucideProps } from "lucide-react";
import {
  BUILT_IN_TEMPLATES,
  getCustomTemplates,
  deleteCustomTemplate,
  stripBlockIds,
  type Template,
} from "../../lib/templates";
import { usePagesStore } from "../../store/pages.store";

interface Props {
  open: boolean;
  onClose: () => void;
}

function TemplateIcon({ name, size = 22 }: { name: string; size?: number }) {
  const Icon = (LucideIcons as Record<string, React.FC<LucideProps>>)[name];
  if (Icon) return <Icon size={size} />;
  // custom templates salvam emoji no campo icon
  return <span style={{ fontSize: size * 0.9, lineHeight: 1 }}>{name}</span>;
}

export default function TemplateGallery({ open, onClose }: Props) {
  const { createPage } = usePagesStore();
  const [customTemplates, setCustomTemplates] = useState<Template[]>([]);

  useEffect(() => {
    if (open) setCustomTemplates(getCustomTemplates());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleUse(template: Template) {
    onClose();
    await createPage(undefined, {
      title: template.name,
      content: JSON.stringify(stripBlockIds(template.content)),
    });
  }

  function handleDelete(id: string) {
    deleteCustomTemplate(id);
    setCustomTemplates(getCustomTemplates());
  }

  if (!open) return null;

  return (
    <div className="tpl-overlay" onClick={onClose}>
      <div className="tpl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tpl-header">
          <span>Templates</span>
          <button className="tpl-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="tpl-body">
          <p className="tpl-section-label">Prontos para usar</p>
          <div className="tpl-grid">
            {BUILT_IN_TEMPLATES.map((tpl) => (
              <TemplateCard key={tpl.id} template={tpl} onUse={handleUse} />
            ))}
          </div>

          <p className="tpl-section-label" style={{ marginTop: 20 }}>
            Meus templates
            {customTemplates.length === 0 && (
              <span className="tpl-section-hint"> — salve uma página como template pelo botão de exportar</span>
            )}
          </p>
          {customTemplates.length > 0 && (
            <div className="tpl-grid">
              {customTemplates.map((tpl) => (
                <TemplateCard
                  key={tpl.id}
                  template={tpl}
                  onUse={handleUse}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  onUse,
  onDelete,
}: {
  template: Template;
  onUse: (t: Template) => void;
  onDelete?: (id: string) => void;
}) {
  return (
    <div className="tpl-card">
      <div className="tpl-card-icon">
        {template.isLucideIcon
          ? <TemplateIcon name={template.icon} size={20} />
          : template.icon
            ? <span style={{ fontSize: 20 }}>{template.icon}</span>
            : <FileText size={20} />
        }
      </div>
      <div className="tpl-card-body">
        <p className="tpl-card-name">{template.name}</p>
        <p className="tpl-card-desc">{template.description}</p>
      </div>
      <div className="tpl-card-actions">
        {onDelete && (
          <button
            className="tpl-card-delete"
            onClick={() => onDelete(template.id)}
            title="Excluir template"
          >
            <Trash2 size={13} />
          </button>
        )}
        <button className="tpl-card-use" onClick={() => onUse(template)}>
          Usar
        </button>
      </div>
    </div>
  );
}
