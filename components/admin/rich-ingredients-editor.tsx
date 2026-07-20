"use client";

// ============================================================
// Le Rasa Bakery — admin rich-text Ingredients editor.
// ------------------------------------------------------------
// A tiny contentEditable editor with a single "Bold" toolbar action, used in
// the Add/Edit Product form so the admin can bold selected words in the
// Ingredients description. Emits raw HTML via onChange; the server sanitizes
// it (see lib/ingredients-rich) before storing, so only safe formatting
// survives. Kept intentionally minimal — no external editor dependency.
// ============================================================

import { useEffect, useRef } from "react";

const WINE = "#873853";
const BERRY = "#5C2A41";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
};

export default function RichIngredientsEditor({ value, onChange, placeholder }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Push the incoming value into the DOM only when it differs AND the editor
  // isn't focused, so typing (which fires onChange → re-render) never yanks the
  // caret back to the start. Handles switching between products / reset too.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return;
    const next = value || "";
    if (el.innerHTML !== next) el.innerHTML = next;
  }, [value]);

  function emit() {
    onChange(ref.current?.innerHTML ?? "");
  }

  function toggleBold() {
    // execCommand is deprecated but universally supported and by far the
    // simplest way to bold the current selection in a contentEditable.
    // Force presentational <b> tags (not <span style="font-weight">) so the
    // server sanitizer — which strips all attributes — keeps the bold.
    try {
      document.execCommand("styleWithCSS", false, "false");
    } catch {
      /* not supported everywhere; <b> is already the default */
    }
    document.execCommand("bold");
    ref.current?.focus();
    emit();
  }

  return (
    <div>
      <style>{`
        .lr-rte:empty:before {
          content: attr(data-placeholder);
          color: rgba(92,42,65,0.45);
        }
        .lr-rte:focus { border-color: ${WINE}; }
        .lr-rte b, .lr-rte strong { font-weight: 800; }
      `}</style>

      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button
          type="button"
          // preventDefault on mousedown keeps the text selection in the editor
          // when the toolbar button is clicked (otherwise focus/selection is lost).
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleBold}
          aria-label="Bold selected text"
          title="Bold (select text first)"
          style={{
            minWidth: 40,
            padding: "6px 12px",
            borderRadius: 8,
            border: `1px solid ${WINE}`,
            background: "white",
            color: WINE,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          B
        </button>
      </div>

      <div
        ref={ref}
        className="lr-rte"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder ?? ""}
        onInput={emit}
        onBlur={emit}
        style={{
          minHeight: 90,
          width: "100%",
          boxSizing: "border-box",
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid rgba(135,56,83,0.25)",
          fontSize: "0.95rem",
          lineHeight: 1.5,
          color: BERRY,
          outline: "none",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}
      />
    </div>
  );
}
