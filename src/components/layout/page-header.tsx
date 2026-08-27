import { PageHelp, type PageHelpProps } from "@/components/layout/page-help";

interface PageHeaderProps {
  title: string;
  description?: string;
  help?: PageHelpProps;
  children?: React.ReactNode;
}

export function PageHeader({ title, description, help, children }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-balance">{title}</h1>
          {help && <PageHelp {...help} />}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">{children}</div>
      )}
    </div>
  );
}
