"use client";

import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";

function getLanguage(filePath: string) {
  if (filePath.endsWith(".json")) return json();
  if (filePath.endsWith(".css")) return css();
  if (filePath.endsWith(".html")) return html();
  return javascript({ jsx: true, typescript: filePath.endsWith(".ts") || filePath.endsWith(".tsx") });
}

export function CodeEditor({
  filePath,
  content,
}: {
  filePath: string;
  content: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (viewRef.current) {
      viewRef.current.destroy();
    }

    const state = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        oneDark,
        getLanguage(filePath),
        EditorView.editable.of(false),
        EditorView.theme({
          "&": { height: "100%" },
          ".cm-scroller": { overflow: "auto" },
        }),
      ],
    });

    viewRef.current = new EditorView({
      state,
      parent: containerRef.current,
    });

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [filePath, content]);

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
}
