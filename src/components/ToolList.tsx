import { useRef, useState, type KeyboardEvent } from "react";
import { useConnection } from "../state/connection";

export function ToolList({ selected, onSelect }: { selected: string | null; onSelect: (name: string) => void }) {
  const tools = useConnection((s) => s.tools);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const q = query.trim().toLowerCase();
  const visible = q
    ? tools.filter((t) => [t.name, t.title ?? "", t.description ?? ""].some((field) => field.toLowerCase().includes(q)))
    : tools;

  function onKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const target = buttons[Math.max(0, Math.min(buttons.length - 1, current + (e.key === "ArrowDown" ? 1 : -1)))];
    if (target) {
      e.preventDefault();
      target.focus();
    }
  }

  return (
    <nav className="tool-list" aria-label="Tools">
      <label htmlFor="tool-filter" className="visually-hidden">
        Filter tools
      </label>
      <input
        id="tool-filter"
        type="search"
        className="sf-input"
        placeholder="Filter tools"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <p className="sf-help" aria-live="polite">
        {visible.length} of {tools.length} tools
      </p>
      <ul ref={listRef} className="tool-items" onKeyDown={onKeyDown}>
        {visible.map((tool, i) => (
          <li key={`${i}:${tool.name}`}>
            <button
              type="button"
              className="tool-item"
              aria-current={tool.name === selected ? "true" : undefined}
              onClick={() => onSelect(tool.name)}
            >
              <span className="tool-name">{tool.title ?? tool.name}</span>
              {tool.title && <span className="tool-id">{tool.name}</span>}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
