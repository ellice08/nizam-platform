import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const Login = () => {
  return (
    <section className="container max-w-md py-20">
      <p className="text-[10px] uppercase tracking-[0.22em] text-gold mb-2">Welcome back</p>
      <h1 className="font-display text-4xl font-semibold mb-8">Sign in to Nizam</h1>
      <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="you@company.com" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" placeholder="••••••••" />
        </div>
        <Button type="submit" className="w-full">Sign in</Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        New to Nizam? <Link to="/signup" className="text-primary underline-offset-4 hover:underline">Create an account</Link>
      </p>
    </section>
  );
};

export default Login;