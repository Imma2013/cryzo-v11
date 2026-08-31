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
  editable = false,
  onChange,
}: {
  filePath: string;
  content: string;
  editable?: boolean;
  onChange?: (value: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current) return;

    viewRef.current?.destroy();

    const state = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        oneDark,
        getLanguage(filePath),
        EditorView.editable.of(editable),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current?.(update.state.doc.toString());
          }
        }),
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
  }, [filePath, editable]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === content) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: content },
    });
  }, [content]);

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
}
