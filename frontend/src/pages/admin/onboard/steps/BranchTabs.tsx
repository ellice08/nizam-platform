import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Branch } from "../types";

type Props = {
  branches: Branch[];
  active: number;
  onActive: (i: number) => void;
  onRename?: (i: number, name: string) => void;
  editable?: boolean;
};

export const BranchTabs = ({ branches, active, onActive, onRename, editable }: Props) => {
  const [editing, setEditing] = useState<number | null>(null);

  if (branches.length <= 1) return null;

  return (
    <div className="flex items-center gap-1 border-b border-border mb-6 overflow-x-auto">
      {branches.map((b, i) => (
        <button
          key={b.id}
          type="button"
          onClick={() => onActive(i)}
          onDoubleClick={() => editable && setEditing(i)}
          className={cn(
            "px-4 py-2.5 text-sm whitespace-nowrap transition-colors duration-150 ease-nz border-b-2 -mb-px",
            active === i
              ? "border-primary text-foreground"
              : "border-transparent text-[hsl(var(--text-secondary))] hover:text-foreground"
          )}
        >
          {editing === i && editable ? (
            <input
              autoFocus
              defaultValue={b.name}
              onBlur={(e) => {
                onRename?.(i, e.target.value || b.name);
                setEditing(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="bg-transparent outline-none border-b border-primary nz-mono text-sm"
            />
          ) : (
            b.name
          )}
        </button>
      ))}
    </div>
  );
};

export default BranchTabs;
