import React from "react";
import { cn } from "@/lib/cn";

// Beautiful custom components reflecting the premium dark theme

export function Card({ children, className, noPadding = false }: { children: React.ReactNode, className?: string, noPadding?: boolean }) {
  return (
    <div className={cn("bg-card border border-card-border rounded-2xl shadow-xl shadow-black/20 overflow-hidden backdrop-blur-sm", className)}>
      <div className={cn(!noPadding && "p-6")}>
        {children}
      </div>
    </div>
  );
}

export function Button({ 
  children, variant = 'primary', size = 'default', className, ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { 
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger',
  size?: 'sm' | 'default' | 'lg'
}) {
  const variants = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 border border-primary/50",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-secondary-border",
    outline: "bg-transparent border border-border text-foreground hover:bg-muted/50",
    ghost: "bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50",
    danger: "bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20"
  };
  
  const sizes = {
    sm: "px-3 py-1.5 text-xs rounded-lg",
    default: "px-4 py-2 text-sm rounded-xl",
    lg: "px-6 py-3 text-base rounded-xl font-medium"
  };

  return (
    <button 
      className={cn(
        "inline-flex items-center justify-center font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Badge({ children, variant = 'default', className }: { children: React.ReactNode, variant?: 'default' | 'success' | 'warning' | 'danger' | 'primary', className?: string }) {
  const variants = {
    default: "bg-muted text-muted-foreground border-border",
    success: "bg-success/10 text-success border-success/20",
    warning: "bg-warning/10 text-warning border-warning/20",
    danger: "bg-destructive/10 text-destructive border-destructive/20",
    primary: "bg-primary/10 text-primary border-primary/20"
  };

  return (
    <span className={cn("px-2.5 py-0.5 text-xs font-semibold rounded-full border", variants[variant], className)}>
      {children}
    </span>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input 
      className={cn(
        "w-full bg-input border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground",
        "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all",
        className
      )} 
      {...props} 
    />
  );
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select 
      className={cn(
        "w-full bg-input border border-border rounded-xl px-4 py-2.5 text-sm text-foreground",
        "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none cursor-pointer",
        className
      )} 
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ children, className }: { children: React.ReactNode, className?: string }) {
  return <label className={cn("block text-sm font-medium text-muted-foreground mb-1.5", className)}>{children}</label>;
}

export function ProbabilityGauge({ value, label, size = 200 }: { value: number, label?: string, size?: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - value * circumference;
  
  let color = "var(--color-warning)";
  if (value >= 0.6) color = "var(--color-success)";
  if (value < 0.4) color = "var(--color-destructive)";

  return (
    <div className="relative flex flex-col items-center justify-center">
      <svg width={size} height={size} viewBox="0 0 100 100" className="transform -rotate-90">
        <circle
          cx="50" cy="50" r={radius}
          fill="transparent"
          stroke="var(--color-muted)"
          strokeWidth="8"
        />
        <circle
          cx="50" cy="50" r={radius}
          fill="transparent"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-display font-bold text-foreground">
          {(value * 100).toFixed(1)}%
        </span>
        {label && <span className="text-xs font-medium text-muted-foreground mt-1 uppercase tracking-wider">{label}</span>}
      </div>
    </div>
  );
}
