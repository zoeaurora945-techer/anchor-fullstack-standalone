import { t, type Language } from "@/lib/i18n";

export type BoardMode = "quadrant" | "list";

/** 四象限视图 / 任务列表视图 的滑动胶囊切换器。 */
export function BoardModeSwitch({
  mode,
  onModeChange,
  language,
}: {
  mode: BoardMode;
  onModeChange: (mode: BoardMode) => void;
  language: Language;
}) {
  const copy = t(language);
  return (
    <div className="relative flex w-52 rounded-full border border-border bg-muted/60 p-1 text-xs font-medium">
      <span
        className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-background shadow-sm transition-transform duration-200"
        style={{ transform: mode === "quadrant" ? "translateX(0)" : "translateX(100%)" }}
      />
      <button
        type="button"
        onClick={() => onModeChange("quadrant")}
        className={`relative z-10 w-1/2 px-3 py-1.5 text-center transition-colors ${
          mode === "quadrant" ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {copy.boardView}
      </button>
      <button
        type="button"
        onClick={() => onModeChange("list")}
        className={`relative z-10 w-1/2 px-3 py-1.5 text-center transition-colors ${
          mode === "list" ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {copy.listView}
      </button>
    </div>
  );
}
