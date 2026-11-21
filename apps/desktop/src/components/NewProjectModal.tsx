import { FolderOpen, Layers, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  createProjectFromTemplate,
  listProjectTemplates,
  pickParentFolder,
} from '../services/frameworksClient';
import type { ProjectTemplateId, ProjectTemplateSummary } from '../types/frameworks';
import type { WorkspaceInfo } from '../types/workspace';

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (workspace: WorkspaceInfo) => Promise<void> | void;
}

export function NewProjectModal({ open, onClose, onCreated }: NewProjectModalProps) {
  const [templates, setTemplates] = useState<ProjectTemplateSummary[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplateId>('axum');
  const [projectName, setProjectName] = useState('my-rust-app');
  const [parentDir, setParentDir] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    void listProjectTemplates()
      .then((list) => {
        setTemplates(list);
        if (list.length > 0 && !list.some((t) => t.id === selectedTemplate)) {
          setSelectedTemplate(list[0].id);
        }
      })
      .catch(() => {});
  }, [open, selectedTemplate]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, submitting]);

  if (!open) {
    return null;
  }

  const handleBrowseParent = async () => {
    setError(null);
    try {
      const picked = await pickParentFolder();
      if (picked) {
        setParentDir(picked);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = projectName.trim();
    const trimmedParent = parentDir.trim();
    if (!trimmedName) {
      setError('Enter a project name.');
      return;
    }
    if (!trimmedParent) {
      setError('Choose or enter a parent directory.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const info = await createProjectFromTemplate(trimmedParent, trimmedName, selectedTemplate);
      await onCreated(info);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-project-modal-title"
      data-testid="new-project-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[1px]"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-[var(--accent)]" />
            <h2
              id="new-project-modal-title"
              className="text-sm font-semibold text-[var(--text-primary)]"
            >
              New Rust Project
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close new project dialog"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="anar-scroll flex-1 space-y-4 overflow-y-auto p-4">
          {error && (
            <div
              role="alert"
              className="rounded-[var(--radius-md)] border border-[var(--status-err)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--status-err)]"
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--text-secondary)]">Project Name</span>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="my-rust-app"
                aria-label="Project name"
                className="w-full rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2.5 py-1.5 font-[family-name:var(--font-mono)] text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                Parent Directory
              </span>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={parentDir}
                  onChange={(e) => setParentDir(e.target.value)}
                  placeholder="/path/to/projects"
                  aria-label="Parent directory"
                  className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2.5 py-1.5 font-[family-name:var(--font-mono)] text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
                <button
                  type="button"
                  onClick={handleBrowseParent}
                  className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                >
                  <FolderOpen className="h-3.5 w-3.5 text-[var(--accent)]" />
                  <span>Browse</span>
                </button>
              </div>
            </label>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              Template ({templates.length})
            </span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {templates.map((tpl) => {
                const selected = tpl.id === selectedTemplate;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    data-testid={`template-card-${tpl.id}`}
                    onClick={() => setSelectedTemplate(tpl.id)}
                    className={`flex flex-col items-start rounded-[var(--radius-md)] border p-2.5 text-left transition-colors ${
                      selected
                        ? 'border-[var(--accent)] bg-[var(--accent-muted)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[var(--text-primary)]">
                        {tpl.name}
                      </span>
                      <span className="rounded bg-[var(--bg-panel)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                        {tpl.category}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-[var(--text-secondary)]">
                      {tpl.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--text-on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{submitting ? 'Creating…' : 'Create & Open'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
