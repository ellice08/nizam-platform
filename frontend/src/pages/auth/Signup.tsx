import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

const INDUSTRIES = [
  { value: "real_estate", label: "Real Estate" },
  { value: "hospitality", label: "Hospitality" },
  { value: "other", label: "Other" },
];

const RequestAccess = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [industry, setIndustry] = useState("real_estate");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!name.trim() || !email.trim()) {
      setError("Please enter your name and email.");
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: insertError } = await supabase
        .from("interest_submissions")
        .insert({
          name: name.trim(),
          email: email.trim(),
          company: company.trim() || null,
          phone: phone.trim() || null,
          industry,
          message: message.trim() || null,
        });
      if (insertError) throw insertError;
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <section className="container max-w-md py-20">
        <p className="text-[10px] uppercase tracking-[0.22em] text-primary mb-2 font-medium">Received</p>
        <h1 className="font-display text-4xl md:text-5xl font-semibold mb-4 leading-[1.1]">
          Thank you
        </h1>
        <p className="text-sm text-[hsl(var(--text-secondary))] leading-relaxed">
          Your request is with our team. We'll review your details and reach out
          personally to arrange the next step. We look forward to speaking with you.
        </p>
        <p className="mt-6 text-sm text-muted-foreground">
          <Link to="/" className="text-primary underline-offset-4 hover:underline">
            Back to home
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section className="container max-w-md py-20">
      <p className="text-[10px] uppercase tracking-[0.22em] text-primary mb-2 font-medium">By invitation</p>
      <h1 className="font-display text-4xl md:text-5xl font-semibold mb-4 leading-[1.1]">
        Request access
      </h1>
      <p className="text-sm text-[hsl(var(--text-secondary))] mb-8 leading-relaxed">
        Nizam is onboarded by our team, one organisation at a time. Share a few
        details and we'll arrange a conversation to design your AI workspace.
      </p>
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" placeholder="Your name" value={name}
            onChange={(e) => setName(e.target.value)} disabled={loading} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" placeholder="name@yourcompany.com" value={email}
            onChange={(e) => setEmail(e.target.value)} disabled={loading} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="company">Organisation</Label>
          <Input id="company" placeholder="Your company or firm" value={company}
            onChange={(e) => setCompany(e.target.value)} disabled={loading} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input id="phone" placeholder="Best number to reach you" value={phone}
            onChange={(e) => setPhone(e.target.value)} disabled={loading} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="industry">Industry</Label>
          <select
            id="industry"
            className="nz-input w-full"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            disabled={loading}
          >
            {INDUSTRIES.map((i) => (
              <option key={i.value} value={i.value}>{i.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="message">What would you like to achieve? (optional)</Label>
          <textarea
            id="message"
            className="nz-textarea h-24"
            placeholder="A note on your goals, current setup, or timeline — anything that helps us prepare."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={loading}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Sending your request..." : "Request access"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </section>
  );
};

export default RequestAccess;
