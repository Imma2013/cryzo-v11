"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  CircleAlert,
  CircleDotDashed,
  CircleX,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export interface Subtask {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  tools?: string[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  level: number;
  dependencies: string[];
  subtasks: Subtask[];
}

function StatusIcon({ status, small = false }: { status: string; small?: boolean }) {
  const className = small ? "h-3.5 w-3.5" : "h-4 w-4";

  if (status === "completed") {
    return <CheckCircle2 className={`${className} text-green-500`} />;
  }
  if (status === "in-progress") {
    return <CircleDotDashed className={`${className} text-blue-400`} />;
  }
  if (status === "need-help") {
    return <CircleAlert className={`${className} text-yellow-500`} />;
  }
  if (status === "failed") {
    return <CircleX className={`${className} text-red-500`} />;
  }
  return <Circle className={`${className} text-zinc-500`} />;
}

function statusClasses(status: string) {
  if (status === "completed") return "bg-green-500/10 text-green-400";
  if (status === "in-progress") return "bg-blue-500/10 text-blue-400";
  if (status === "need-help") return "bg-yellow-500/10 text-yellow-400";
  if (status === "failed") return "bg-red-500/10 text-red-400";
  return "bg-zinc-800 text-zinc-500";
}

export default function AgentPlan({ tasks = [] }: { tasks?: Task[] }) {
  /*
   * Streamed task data is controlled by the parent. Do not mirror it into local
   * state: partial AI messages can arrive many times per second, and syncing a
   * fresh tasks array in an effect can create a render/update feedback loop.
   */
  const [taskExpansionOverrides, setTaskExpansionOverrides] = useState<
    Record<string, boolean>
  >({});
  const [expandedSubtasks, setExpandedSubtasks] = useState<Record<string, boolean>>(
    {},
  );
  const prefersReducedMotion = useReducedMotion();

  if (tasks.length === 0) return null;

  const toggleTaskExpansion = (task: Task) => {
    const currentlyExpanded =
      taskExpansionOverrides[task.id] ?? task.status === "in-progress";
    setTaskExpansionOverrides((prev) => ({
      ...prev,
      [task.id]: !currentlyExpanded,
    }));
  };

  const toggleSubtaskExpansion = (taskId: string, subtaskId: string) => {
    const key = `${taskId}-${subtaskId}`;
    setExpandedSubtasks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="text-white">
      <motion.div
        className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/70"
        initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
      >
        <div className="overflow-hidden p-3">
          <ul className="space-y-1 overflow-hidden">
            {tasks.map((task, index) => {
              const isExpanded =
                taskExpansionOverrides[task.id] ?? task.status === "in-progress";
              const isCompleted = task.status === "completed";

              return (
                <li key={task.id} className={index !== 0 ? "mt-1 pt-2" : ""}>
                  <button
                    type="button"
                    onClick={() => toggleTaskExpansion(task)}
                    className="group flex w-full items-center rounded-md px-3 py-1.5 text-left hover:bg-white/[0.03]"
                  >
                    <div className="mr-2 shrink-0">
                      <StatusIcon status={task.status} />
                    </div>
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                      <span
                        className={`min-w-0 text-sm ${
                          isCompleted ? "text-zinc-500 line-through" : "text-zinc-200"
                        }`}
                      >
                        {task.title}
                      </span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${statusClasses(
                          task.status,
                        )}`}
                      >
                        {task.status}
                      </span>
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {isExpanded && task.subtasks.length > 0 && (
                      <motion.div
                        key={`${task.id}-subtasks`}
                        className="relative overflow-hidden"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
                      >
                        <div className="absolute bottom-0 left-[20px] top-0 border-l border-dashed border-zinc-700" />
                        <ul className="mb-1.5 ml-3 mr-2 mt-1 space-y-0.5">
                          {task.subtasks.map((subtask) => {
                            const subtaskKey = `${task.id}-${subtask.id}`;
                            const isSubtaskExpanded = !!expandedSubtasks[subtaskKey];

                            return (
                              <li key={subtask.id} className="py-0.5 pl-6">
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleSubtaskExpansion(task.id, subtask.id)
                                  }
                                  className="flex w-full items-center rounded-md p-1 text-left hover:bg-white/[0.03]"
                                >
                                  <div className="mr-2 shrink-0">
                                    <StatusIcon status={subtask.status} small />
                                  </div>
                                  <span
                                    className={`text-xs ${
                                      subtask.status === "completed"
                                        ? "text-zinc-500 line-through"
                                        : "text-zinc-300"
                                    }`}
                                  >
                                    {subtask.title}
                                  </span>
                                </button>

                                <AnimatePresence initial={false}>
                                  {isSubtaskExpanded && (
                                    <motion.div
                                      key={`${subtaskKey}-details`}
                                      className="ml-1.5 mt-1 overflow-hidden border-l border-dashed border-zinc-700 pl-5 text-xs text-zinc-500"
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: "auto" }}
                                      exit={{ opacity: 0, height: 0 }}
                                      transition={{
                                        duration: prefersReducedMotion ? 0 : 0.16,
                                      }}
                                    >
                                      <p className="py-1">{subtask.description}</p>
                                      {subtask.tools && subtask.tools.length > 0 && (
                                        <div className="mb-1 mt-0.5 flex flex-wrap items-center gap-1.5">
                                          <span className="font-medium text-zinc-500">
                                            Tools:
                                          </span>
                                          <div className="flex flex-wrap gap-1">
                                            {subtask.tools.map((tool) => (
                                              <span
                                                key={tool}
                                                className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400"
                                              >
                                                {tool}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </li>
                            );
                          })}
                        </ul>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        </div>
      </motion.div>
    </div>
  );
}
