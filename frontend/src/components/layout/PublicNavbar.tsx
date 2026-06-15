import { Link, NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ElliceLockup } from "@/components/ElliceLockup";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/login", label: "Sign in" },
];

export function PublicNavbar() {
  return (
    <header className="w-full border-b border-border bg-background sticky top-0 z-40">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-1.5">
          <ElliceLockup className="h-7" />
          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                `text-sm transition-colors duration-150 ease-nz hover:text-foreground ${
                  isActive ? "text-foreground" : "text-[hsl(var(--text-secondary))]"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex text-[hsl(var(--text-secondary))] hover:text-foreground hover:bg-elevated">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm" className="bg-primary hover:bg-primary-hover text-primary-foreground">
            <Link to="/signup">Request access</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

export default PublicNavbar;
