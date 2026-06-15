import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const Index = () => {
  return (
    <section className="container py-24 md:py-32">
      <div className="max-w-3xl">
        <p className="text-[10px] uppercase tracking-[0.24em] text-primary mb-6 font-medium">
          AI Voice & Chat Management
        </p>
        <h1 className="font-display text-5xl md:text-7xl leading-[1.05] tracking-tight text-foreground">
          Conversation,
          <br />
          <span className="italic text-primary">refined</span> for business.
        </h1>
        <p className="mt-8 text-lg text-[hsl(var(--text-secondary))] max-w-xl leading-relaxed">
          Nizam orchestrates AI voice and chat across every customer touchpoint —
          a single, sovereign system for the modern enterprise.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg" className="bg-primary hover:bg-primary-hover text-primary-foreground gap-2">
            <Link to="/signup">
              Request access
              <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="border-border bg-transparent hover:bg-elevated text-foreground">
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </div>

      <div className="mt-24 grid md:grid-cols-3 gap-px bg-border border border-border rounded-lg overflow-hidden">
        {[
          { k: "Voice", v: "Inbound & outbound calling, branch-aware routing." },
          { k: "Chat", v: "WhatsApp, web widget, and SMS in one inbox." },
          { k: "Knowledge", v: "Grounded responses from your own content only." },
        ].map((f) => (
          <div key={f.k} className="bg-surface p-8">
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium">{f.k}</p>
            <p className="mt-4 font-display text-2xl text-foreground">{f.v}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default Index;
