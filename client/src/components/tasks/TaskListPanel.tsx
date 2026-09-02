import { useState } from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { t, type Language } from "@/lib/i18n";
import { formatShortDate, formatTime } from "@/lib/utils";
import type { EditableTask } from "./TaskEditorDialog";

type ListTask = EditableTask & {
  status?: string;
  doneAt?: Date | string | null;
  quadrant?: string | null;
};

/** 聚合任务列表：待办区 + 可折叠的已完成区，整行点击即编辑。 */
export function TaskListPanel({
  tasks,
  language,
  onToggleDone,
  onEditTask,
  onRestore,
}: {
  tasks: ListTask[];
  language: Language;
  onToggleDone: (id: string) => void;
  onEditTask: (task: EditableTask) => void;
  onRestore?: (id: string) => void;
}) {
  const copy = t(language);
  const [showDone, setShowDone] = useState(false);

  const todo = tasks.filter((task) => task.status !== "done" && task.status !== "dropped");
  const done = tasks.filter((task) => task.status === "done");

  const byDue = (a: ListTask, b: ListTask) => {
    const ad = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bd = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    return ad - bd;
  };

  const renderRow = (task: ListTask) => (
    <div
      key={task.id}
      onClick={() => onEditTask(task)}
      className="group flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-card/70 p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40"
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          if (task.status === "done" || task.status === "dropped") {
            onRestore?.(task.id);
          } else {
            onToggleDone(task.id);
          }
        }}
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border transition hover:bg-emerald-500 hover:text-white ${
          task.status === "done" || task.status === "dropped"
            ? "border-emerald-400 bg-emerald-500 text-white"
            : "border-muted-foreground/30 text-transparent hover:border-emerald-500"
        }`}
        aria-label="toggle done"
      >
        <Check className="h-3 w-3" />
      </button>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-medium ${
            task.status === "done" ? "text-muted-foreground line-through" : ""
          }`}
        >
          {task.title}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {task.dueAt ? `${formatShortDate(task.dueAt)} ${formatTime(task.dueAt)}` : copy.noTime}
        </p>
      </div>
    </div>
  );

  return (
    <div className="rounded-3xl border border-border bg-card/40 p-4">
      <div className="space-y-2">
        {todo.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            {copy.emptyTodo}
          </p>
        ) : (
          [...todo].sort(byDue).map(renderRow)
        )}
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => setShowDone((prev) => !prev)}
          className="flex w-full items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-foreground transition hover:bg-muted"
        >
          <span className="flex items-center gap-2">
            {showDone ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            <span>{showDone ? copy.hideDone : copy.showDone}</span>
          </span>
          <span className="text-muted-foreground">{done.length}</span>
        </button>
        {showDone ? (
          <div className="mt-2 space-y-2">
            {done.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                {copy.emptyDone}
              </p>
            ) : (
              done.map(renderRow)
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
