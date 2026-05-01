import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const Signup = () => {
  return (
    <section className="container max-w-md py-20">
      <p className="text-[10px] uppercase tracking-[0.22em] text-gold mb-2">Get started</p>
      <h1 className="font-display text-4xl font-semibold mb-8">Create your workspace</h1>
      <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
        <div className="space-y-2">
          <Label htmlFor="company">Company</Label>
          <Input id="company" placeholder="Acme, Inc." />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" placeholder="you@company.com" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" placeholder="At least 8 characters" />
        </div>
        <Button type="submit" className="w-full">Create account</Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        Already have an account? <Link to="/login" className="text-primary underline-offset-4 hover:underline">Sign in</Link>
      </p>
    </section>
  );
};

export default Signup;