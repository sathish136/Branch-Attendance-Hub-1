import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { X, AlertTriangle } from "lucide-react";

// --- Card ---
export function Card({ className, children }: { className?: string, children: React.ReactNode }) {
  return (
    <div className={cn("bg-card text-card-foreground rounded-xl border border-border shadow-sm", className)}>
      {children}
    </div>
  );
}

// --- Button ---
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    const baseStyle = "inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg active:scale-[0.98]";
    
    const variants = {
      primary: "bg-primary text-primary-foreground hover:brightness-110 shadow-sm shadow-primary/20 focus:ring-primary/50",
      secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 focus:ring-secondary",
      outline: "border border-border bg-transparent hover:bg-muted text-foreground focus:ring-border",
      ghost: "bg-transparent hover:bg-muted text-foreground focus:ring-muted",
      danger: "bg-red-500 text-white hover:bg-red-600 focus:ring-red-500/50 shadow-sm"
    };

    const sizes = {
      sm: "text-xs px-3 py-1.5",
      md: "text-sm px-4 py-2",
      lg: "text-base px-6 py-3"
    };

    return (
      <button ref={ref} className={cn(baseStyle, variants[variant], sizes[size], className)} {...props} />
    );
  }
);
Button.displayName = "Button";

// --- Input & Select ---
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "flex w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground",
          "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          "flex w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground",
          "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      >
        {children}
      </select>
    );
  }
);
Select.displayName = "Select";

export const Label = ({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn("block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide", className)} {...props}>
    {children}
  </label>
);

// --- Table ---
export function Table({ className, children }: { className?: string, children: React.ReactNode }) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border">
      <table className={cn("w-full text-sm text-left border-collapse", className)}>
        {children}
      </table>
    </div>
  );
}
export const Th = ({ className, children }: { className?: string, children: React.ReactNode }) => (
  <th className={cn("px-4 py-3 bg-muted/50 font-semibold text-muted-foreground text-xs uppercase tracking-wider border-b border-border whitespace-nowrap", className)}>
    {children}
  </th>
);
export const Td = ({ className, children }: { className?: string, children: React.ReactNode }) => (
  <td className={cn("px-4 py-3 border-b border-border/50 text-foreground group-hover:bg-muted/30 transition-colors", className)}>
    {children}
  </td>
);
export const Tr = ({ className, children }: { className?: string, children: React.ReactNode }) => (
  <tr className={cn("group hover:bg-muted/20 transition-colors", className)}>
    {children}
  </tr>
);

// --- Badge ---
export function Badge({ children, variant = "default", className }: { children: React.ReactNode, variant?: "default" | "success" | "warning" | "danger" | "info" | "neutral", className?: string }) {
  const variants = {
    default: "bg-primary/10 text-primary border-primary/20",
    success: "bg-green-100 text-green-700 border-green-200",
    warning: "bg-amber-100 text-amber-700 border-amber-200",
    danger: "bg-red-100 text-red-700 border-red-200",
    info: "bg-blue-100 text-blue-700 border-blue-200",
    neutral: "bg-gray-100 text-gray-700 border-gray-200"
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border", variants[variant], className)}>
      {children}
    </span>
  );
}

// --- Modal ---
export function Modal({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-md rounded-2xl shadow-2xl border border-border overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/20">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-muted text-muted-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

// --- Page Header ---
export function PageHeader({ title, description, action }: { title: string, description?: string, action?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

// --- ConfirmDialog ---
interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmDialog({ open, title = "Confirm", message, confirmLabel = "Confirm", onConfirm, onCancel, danger = true }: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl p-6 w-full max-w-sm mx-4 z-10">
        <div className="flex items-start gap-3">
          {danger && <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />}
          <div>
            <h3 className="font-semibold text-sm text-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{message}</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              "px-3 py-1.5 text-sm rounded-lg font-medium transition-colors",
              danger ? "bg-red-500 text-white hover:bg-red-600" : "bg-primary text-primary-foreground hover:brightness-110"
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm() {
  const [state, setState] = useState<{ message: string; title?: string; confirmLabel?: string; danger?: boolean; resolve: (v: boolean) => void } | null>(null);

  const confirm = (message: string, opts?: { title?: string; confirmLabel?: string; danger?: boolean }) =>
    new Promise<boolean>(resolve => setState({ message, ...opts, resolve }));

  const dialog = state ? (
    <ConfirmDialog
      open={true}
      message={state.message}
      title={state.title}
      confirmLabel={state.confirmLabel}
      danger={state.danger ?? true}
      onConfirm={() => { state.resolve(true); setState(null); }}
      onCancel={() => { state.resolve(false); setState(null); }}
    />
  ) : null;

  return { confirm, dialog };
}
