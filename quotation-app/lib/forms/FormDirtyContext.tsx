"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type FormDirtyContextValue = {
  isDirty: boolean;
  setDirty: (dirty: boolean) => void;
};

const FormDirtyContext = createContext<FormDirtyContextValue | null>(null);

// Shared between a document's edit form and its action buttons (e.g. "Push
// to Xero") — they're independent sibling components with no other
// connection, so this is how the push button knows the form has unsaved
// edits that won't be reflected in the push.
export function FormDirtyProvider({ children }: { children: ReactNode }) {
  const [isDirty, setDirty] = useState(false);
  return (
    <FormDirtyContext.Provider value={{ isDirty, setDirty }}>{children}</FormDirtyContext.Provider>
  );
}

export function useFormDirty(): FormDirtyContextValue {
  const ctx = useContext(FormDirtyContext);
  if (!ctx) throw new Error("useFormDirty must be used within a FormDirtyProvider");
  return ctx;
}
