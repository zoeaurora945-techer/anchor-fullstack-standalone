import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Check, Pencil } from "lucide-react";
import { t, type Language } from "@/lib/i18n";

export type EditableProject = {
  id: string;
  title: string;
  color: string;
  status: string | null;
  goalId: string | null;
};

export type ProjectEditPatch = {
  id: string;
  title: string;
  color: string;
  status: "active" | "paused" | "completed" | "archived";
  goalId: string | null;
};

export function ProjectEditor({
  project,
  language,
  goals,
  onClose,
  onSave,
}: {
  project: EditableProject;
  language: Language;
  goals: Array<{ id: string; title: string }>;
  onClose: () => void;
  onSave: (patch: ProjectEditPatch) => void;
}) {
  const copy = t(language);
  const [title, setTitle] = useState(project.title);
  const [color, setColor] = useState(project.color ?? "#7FB5D6");
  const [status, setStatus] = useState<"active" | "paused" | "completed" | "archived">(
    (project.status as "active" | "paused" | "completed" | "archived") ?? "active",
  );
  const [goalId, setGoalId] = useState(project.goalId ?? "");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({ id: project.id, title: title.trim(), color, status, goalId: goalId || null });
    setEditing(false);
  };

  const statusLabel = {
    active: copy.statusActive,
    paused: copy.statusPaused,
    completed: copy.statusCompleted,
    archived: copy.statusArchived,
  } as const;

  const statusColor = {
    active: "text-emerald-500",
    paused: "text-amber-500",
    completed: "text-slate-400",
    archived: "text-slate-300",
  } as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{copy.editProject}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Planet preview */}
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
          <div
            className="h-8 w-8 shrink-0 rounded-full"
            style={{
              background: `radial-gradient(circle at 35% 35%, ${color}ee, ${color}55)`,
              boxShadow: `0 0 12px 3px ${color}44`,
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{title}</p>
            <p className={`text-xs ${statusColor[status]}`}>{statusLabel[status]}</p>
          </div>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>

        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{copy.projectTitle}</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSave()} className="border-border bg-muted/50" autoFocus />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{copy.projectColor}</label>
              <div className="flex items-center gap-2">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-10 rounded border border-border bg-muted/50" />
                <Input value={color} onChange={(e) => setColor(e.target.value)} className="border-border bg-muted/50 font-mono text-xs" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{copy.projectStatus}</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as ProjectEditPatch["status"])} className="h-9 w-full rounded-md border border-border bg-muted/50 px-3 text-sm">
                <option value="active">{copy.statusActive}</option>
                <option value="paused">{copy.statusPaused}</option>
                <option value="completed">{copy.statusCompleted}</option>
                <option value="archived">{copy.statusArchived}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{copy.linkGoal}</label>
              <select value={goalId} onChange={(e) => setGoalId(e.target.value)} className="h-9 w-full rounded-md border border-border bg-muted/50 px-3 text-sm">
                <option value="">{copy.noLinkedGoal}</option>
                {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)} className="flex-1">{copy.cancel}</Button>
              <Button type="button" size="sm" onClick={handleSave} disabled={!title.trim()} className="flex-1"><Check className="mr-1.5 h-3.5 w-3.5" />{copy.save}</Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="flex-1">{copy.cancel}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
