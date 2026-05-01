import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Index = () => {
  return (
    <section className="container py-24 md:py-32">
      <div className="max-w-3xl">
        <p className="text-[10px] uppercase tracking-[0.24em] text-gold mb-4">
          AI Voice & Chat Management
        </p>
        <h1 className="font-display text-5xl md:text-7xl font-semibold leading-[1.05] tracking-tight">
          Conversation,
          <br />
          <span className="italic text-primary">refined</span> for business.
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-xl">
          Nizam orchestrates AI voice and chat across every customer touchpoint —
          a single, sovereign system for the modern enterprise.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/signup">Request access</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default Index;
