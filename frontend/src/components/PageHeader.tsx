type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
};

export function PageHeader({ eyebrow, title, description, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10 pb-6 border-b border-border">
      <div>
        {eyebrow && (
          <p className="text-[10px] uppercase tracking-[0.22em] text-primary mb-3 font-medium">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-4xl md:text-5xl tracking-tight text-foreground">
          {title}
        </h1>
        {description && (
          <p className="mt-3 text-[hsl(var(--text-secondary))] max-w-2xl">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

export default PageHeader;
