import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, X, RotateCcw } from "lucide-react";
import { t, type Language } from "@/lib/i18n";

export type EditableTask = {
  id: string;
  title: string;
  status?: string | null;
  notes?: string | null;
  dueAt?: Date | string | null;
  duePrecision?: string | null;
  importance?: string | null;
  urgencyMode?: string | null;
  manualUrgent?: boolean | null;
  projectId?: string | null;
  doneAt?: Date | string | null;
};

export type TaskEditPatch = {
  id: string;
  title: string;
  notes: string | null;
  dueAt: Date | null;
  duePrecision: "unknown" | "datetime";
  importance: "important" | "not_important";
  urgencyMode: "auto" | "manual";
  manualUrgent: boolean;
  projectId: string | null;
};

/** 把 Date/ISO 字符串转成 <input type="datetime-local"> 需要的本地时间格式。 */
function toLocalInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function TaskEditorDialog({
  task,
  language,
  projects,
  onClose,
  onSave,
  onDelete,
  onRestore,
}: {
  task: EditableTask;
  language: Language;
  projects: Array<{ id: string; title: string }>;
  onClose: () => void;
  onSave: (patch: TaskEditPatch) => void;
  onDelete?: (id: string) => void;
  onRestore?: (id: string) => void;
}) {
  const copy = t(language);
  const isDone = task.status === "done" || task.status === "dropped";
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [dueLocal, setDueLocal] = useState(() => toLocalInput(task.dueAt));
  const [importance, setImportance] = useState<"important" | "not_important">(
    (task.importance as "important" | "not_important") ?? "important",
  );
  const [urgencyMode, setUrgencyMode] = useState<"auto" | "manual">(
    (task.urgencyMode as "auto" | "manual") ?? "auto",
  );
  const [manualUrgent, setManualUrgent] = useState(Boolean(task.manualUrgent));
  const [projectId, setProjectId] = useState(task.projectId ?? "");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      id: task.id,
      title: title.trim(),
      notes: notes.trim() || null,
      dueAt: dueLocal ? new Date(dueLocal) : null,
      duePrecision: dueLocal ? "datetime" : "unknown",
      importance,
      urgencyMode,
      manualUrgent: urgencyMode === "manual" ? manualUrgent : false,
      projectId: projectId || null,
    });
    onClose();
  };

  const selectClass = "h-9 w-full rounded-md border border-border bg-muted/50 px-3 text-sm";
  const labelClass = "mb-1 block text-xs font-medium text-muted-foreground";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-auto rounded-2xl border border-border bg-card p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{copy.editTask}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isDone && onRestore && (
          <div className="mb-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onRestore(task.id)}
              className="w-full text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              {language === "zh" ? "恢复为待办任务" : "Restore to todo"}
            </Button>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className={labelClass}>{copy.taskTitle}</label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && handleSave()}
              placeholder={copy.taskTitle}
              className="border-border bg-muted/50"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{copy.importance}</label>
              <select
                value={importance}
                onChange={(event) => setImportance(event.target.value as "important" | "not_important")}
                className={selectClass}
              >
                <option value="important">{copy.important}</option>
                <option value="not_important">{copy.notImportant}</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>{copy.project}</label>
              <select
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                className={selectClass}
              >
                <option value="">{copy.noProject}</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>{copy.dueTime}</label>
            <Input
              type="datetime-local"
              value={dueLocal}
              onChange={(event) => setDueLocal(event.target.value)}
              className="border-border bg-muted/50"
            />
          </div>

          <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-3">
            <div>
              <label className={labelClass}>{copy.urgencyMode}</label>
              <select
                value={urgencyMode}
                onChange={(event) => setUrgencyMode(event.target.value as "auto" | "manual")}
                className={selectClass}
              >
                <option value="auto">{copy.urgentAuto}</option>
                <option value="manual">{copy.urgencyManual}</option>
              </select>
            </div>
            {urgencyMode === "manual" ? (
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-xs text-foreground">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-muted-foreground"
                    checked={manualUrgent}
                    onChange={(event) => setManualUrgent(event.target.checked)}
                  />
                  <span>{copy.markUrgent}</span>
                </label>
              </div>
            ) : null}
          </div>

          <div>
            <label className={labelClass}>{copy.notes}</label>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={copy.notes}
              className="min-h-20 border-border bg-muted/50"
            />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          {onDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onDelete(task.id);
                onClose();
              }}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              {copy.delete}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {copy.cancel}
            </Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={!title.trim()}>
              {copy.save}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
