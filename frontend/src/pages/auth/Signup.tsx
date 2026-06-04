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
        <p className="text-[10px] uppercase tracking-[0.22em] text-gold mb-2">Thank you</p>
        <h1 className="font-display text-4xl font-semibold mb-6">Request received</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Thanks for your interest in Nizam. Our team will review your details and
          reach out shortly to schedule a conversation.
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
      <p className="text-[10px] uppercase tracking-[0.22em] text-gold mb-2">Get started</p>
      <h1 className="font-display text-4xl font-semibold mb-3">Request access</h1>
      <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
        Tell us about your business and we'll be in touch to set up your AI workspace.
      </p>
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" placeholder="Jane Smith" value={name}
            onChange={(e) => setName(e.target.value)} disabled={loading} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" placeholder="you@company.com" value={email}
            onChange={(e) => setEmail(e.target.value)} disabled={loading} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="company">Company</Label>
          <Input id="company" placeholder="Acme, Inc." value={company}
            onChange={(e) => setCompany(e.target.value)} disabled={loading} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input id="phone" placeholder="+234 ..." value={phone}
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
          <Label htmlFor="message">What are you looking for? (optional)</Label>
          <textarea
            id="message"
            className="nz-textarea h-24"
            placeholder="Tell us a bit about your needs..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={loading}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Submitting..." : "Request access"}
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
