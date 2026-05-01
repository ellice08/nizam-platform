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
          <p className="text-[10px] uppercase tracking-[0.22em] text-gold mb-2">{eyebrow}</p>
        )}
        <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-muted-foreground max-w-2xl">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

export default PageHeader;