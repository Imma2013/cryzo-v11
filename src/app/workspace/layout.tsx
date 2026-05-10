"use client";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="h-screen bg-black">{children}</div>;
}
