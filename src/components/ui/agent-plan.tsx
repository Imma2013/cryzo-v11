"use client";

import React, { useState } from "react";
import {
  CheckCircle2,
  Circle,
  CircleAlert,
  CircleDotDashed,
  CircleX,
} from "lucide-react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";

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

export default function AgentPlan({ tasks: externalTasks }: { tasks?: Task[] }) {
  const [tasks, setTasks] = useState<Task[]>(externalTasks ?? []);
  const [expandedTasks, setExpandedTasks] = useState<string[]>(
    externalTasks?.filter((t) => t.status === "in-progress").map((t) => t.id) ?? []
  );
  const [expandedSubtasks, setExpandedSubtasks] = useState<{
    [key: string]: boolean;
  }>({});

  const prefersReducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  React.useEffect(() => {
    if (externalTasks) {
      setTasks(externalTasks);
      setExpandedTasks(
        externalTasks.filter((t) => t.status === "in-progress").map((t) => t.id)
      );
    }
  }, [externalTasks]);

  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTasks((prev) =>
      prev.includes(taskId)
        ? prev.filter((id) => id !== taskId)
        : [...prev, taskId]
    );
  };

  const toggleSubtaskExpansion = (taskId: string, subtaskId: string) => {
    const key = `${taskId}-${subtaskId}`;
    setExpandedSubtasks((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const taskVariants = {
    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : -5 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  };

  const subtaskListVariants = {
    hidden: { opacity: 0, height: 0 },
    visible: { height: "auto", opacity: 1, transition: { duration: 0.25 } },
    exit: { height: 0, opacity: 0, transition: { duration: 0.2 } },
  };

  const subtaskVariants = {
    hidden: { opacity: 0, x: prefersReducedMotion ? 0 : -10 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.2 } },
  };

  const subtaskDetailsVariants = {
    hidden: { opacity: 0, height: 0 },
    visible: { opacity: 1, height: "auto", transition: { duration: 0.25 } },
  };

  const statusBadgeVariants = {
    initial: { scale: 1 },
    animate: { scale: prefersReducedMotion ? 1 : [1, 1.08, 1], transition: { duration: 0.35 } },
  };

  if (tasks.length === 0) return null;

  return (
    <div className="text-white">
      <motion.div
        className="rounded-lg border border-zinc-800 bg-zinc-900/70 overflow-hidden"
        initial={{ opacity: 0, y: 10 }}
        animate={{
          opacity: 1,
          y: 0,
          transition: { duration: 0.3, ease: [0.2, 0.65, 0.3, 0.9] },
        }}
      >
        <LayoutGroup>
          <div className="p-3 overflow-hidden">
            <ul className="space-y-1 overflow-hidden">
              {tasks.map((task, index) => {
                const isExpanded = expandedTasks.includes(task.id);
                const isCompleted = task.status === "completed";

                return (
                  <motion.li
                    key={task.id}
                    className={index !== 0 ? "mt-1 pt-2" : ""}
                    initial="hidden"
                    animate="visible"
                    variants={taskVariants}
                  >
                    <motion.div
                      className="group flex items-center px-3 py-1.5 rounded-md cursor-pointer"
                      onClick={() => toggleTaskExpansion(task.id)}
                      whileHover={{
                        backgroundColor: "rgba(255,255,255,0.03)",
                        transition: { duration: 0.2 },
                      }}
                    >
                      <div className="mr-2 flex-shrink-0">
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={task.status}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.2 }}
                          >
                            {task.status === "completed" ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : task.status === "in-progress" ? (
                              <CircleDotDashed className="h-4 w-4 text-blue-400" />
                            ) : task.status === "need-help" ? (
                              <CircleAlert className="h-4 w-4 text-yellow-500" />
                            ) : task.status === "failed" ? (
                              <CircleX className="h-4 w-4 text-red-500" />
                            ) : (
                              <Circle className="h-4 w-4 text-zinc-500" />
                            )}
                          </motion.div>
                        </AnimatePresence>
                      </div>

                      <div className="flex min-w-0 flex-grow items-center justify-between">
                        <span
                          className={`text-sm ${isCompleted ? "text-zinc-500 line-through" : "text-zinc-200"}`}
                        >
                          {task.title}
                        </span>

                        <motion.span
                          className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            task.status === "completed"
                              ? "bg-green-500/10 text-green-400"
                              : task.status === "in-progress"
                                ? "bg-blue-500/10 text-blue-400"
                                : task.status === "need-help"
                                  ? "bg-yellow-500/10 text-yellow-400"
                                  : task.status === "failed"
                                    ? "bg-red-500/10 text-red-400"
                                    : "bg-zinc-800 text-zinc-500"
                          }`}
                          variants={statusBadgeVariants}
                          initial="initial"
                          animate="animate"
                          key={task.status}
                        >
                          {task.status}
                        </motion.span>
                      </div>
                    </motion.div>

                    <AnimatePresence mode="wait">
                      {isExpanded && task.subtasks.length > 0 && (
                        <motion.div
                          className="relative overflow-hidden"
                          variants={subtaskListVariants}
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                          layout
                        >
                          <div className="absolute top-0 bottom-0 left-[20px] border-l border-dashed border-zinc-700" />
                          <ul className="mt-1 mr-2 mb-1.5 ml-3 space-y-0.5">
                            {task.subtasks.map((subtask) => {
                              const subtaskKey = `${task.id}-${subtask.id}`;
                              const isSubtaskExpanded = expandedSubtasks[subtaskKey];

                              return (
                                <motion.li
                                  key={subtask.id}
                                  className="flex flex-col py-0.5 pl-6 cursor-pointer"
                                  onClick={() =>
                                    toggleSubtaskExpansion(task.id, subtask.id)
                                  }
                                  variants={subtaskVariants}
                                  initial="hidden"
                                  animate="visible"
                                  layout
                                >
                                  <motion.div
                                    className="flex flex-1 items-center rounded-md p-1"
                                    whileHover={{
                                      backgroundColor: "rgba(255,255,255,0.03)",
                                      transition: { duration: 0.2 },
                                    }}
                                    layout
                                  >
                                    <div className="mr-2 flex-shrink-0">
                                      <AnimatePresence mode="wait">
                                        <motion.div
                                          key={subtask.status}
                                          initial={{ opacity: 0, scale: 0.8 }}
                                          animate={{ opacity: 1, scale: 1 }}
                                          exit={{ opacity: 0, scale: 0.8 }}
                                          transition={{ duration: 0.2 }}
                                        >
                                          {subtask.status === "completed" ? (
                                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                          ) : subtask.status === "in-progress" ? (
                                            <CircleDotDashed className="h-3.5 w-3.5 text-blue-400" />
                                          ) : subtask.status === "need-help" ? (
                                            <CircleAlert className="h-3.5 w-3.5 text-yellow-500" />
                                          ) : subtask.status === "failed" ? (
                                            <CircleX className="h-3.5 w-3.5 text-red-500" />
                                          ) : (
                                            <Circle className="h-3.5 w-3.5 text-zinc-600" />
                                          )}
                                        </motion.div>
                                      </AnimatePresence>
                                    </div>

                                    <span
                                      className={`text-xs ${subtask.status === "completed" ? "text-zinc-500 line-through" : "text-zinc-300"}`}
                                    >
                                      {subtask.title}
                                    </span>
                                  </motion.div>

                                  <AnimatePresence mode="wait">
                                    {isSubtaskExpanded && (
                                      <motion.div
                                        className="mt-1 ml-1.5 border-l border-dashed border-zinc-700 pl-5 text-xs text-zinc-500 overflow-hidden"
                                        variants={subtaskDetailsVariants}
                                        initial="hidden"
                                        animate="visible"
                                        exit="hidden"
                                        layout
                                      >
                                        <p className="py-1">
                                          {subtask.description}
                                        </p>
                                        {subtask.tools &&
                                          subtask.tools.length > 0 && (
                                            <div className="mt-0.5 mb-1 flex flex-wrap items-center gap-1.5">
                                              <span className="font-medium text-zinc-500">
                                                Tools:
                                              </span>
                                              <div className="flex flex-wrap gap-1">
                                                {subtask.tools.map(
                                                  (tool, idx) => (
                                                    <motion.span
                                                      key={idx}
                                                      className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400"
                                                      initial={{
                                                        opacity: 0,
                                                        y: -5,
                                                      }}
                                                      animate={{
                                                        opacity: 1,
                                                        y: 0,
                                                        transition: {
                                                          duration: 0.2,
                                                          delay: idx * 0.05,
                                                        },
                                                      }}
                                                    >
                                                      {tool}
                                                    </motion.span>
                                                  )
                                                )}
                                              </div>
                                            </div>
                                          )}
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </motion.li>
                              );
                            })}
                          </ul>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.li>
                );
              })}
            </ul>
          </div>
        </LayoutGroup>
      </motion.div>
    </div>
  );
}
