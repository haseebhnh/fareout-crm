"use client";

import Link from "next/link";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  AppWindow,
  Apple,
  ArrowRight,
  BarChart3,
  Boxes,
  Brain,
  Building2,
  CalendarCheck,
  Check,
  CircleDollarSign,
  Clock,
  Code2,
  FolderKanban,
  GitBranch,
  Globe,
  Headphones,
  LayoutTemplate,
  ListChecks,
  MessageCircle,
  Phone,
  Send,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";

import { OotrixLogo, OotrixMark } from "@/components/marketing/ootrix-logo";
import { Reveal } from "@/components/marketing/reveal";

// Every icon here comes from lucide-react — the brand rules call for a
// single icon family across the product, and the CRM already uses it.

const PRODUCTS = [
  { icon: Users, name: "CRM", blurb: "One record per customer, across every team." },
  { icon: MessageCircle, name: "WhatsApp CRM", blurb: "Shared inbox on the official Business API." },
  { icon: Phone, name: "Calling System", blurb: "Place and log calls without leaving the record." },
  { icon: GitBranch, name: "Sales Pipeline", blurb: "Drag-and-drop deals with forecast totals." },
  { icon: Clock, name: "Customer Timeline", blurb: "Every message, call and order in sequence." },
  { icon: Send, name: "Marketing Automation", blurb: "Broadcasts and journeys that run themselves." },
  { icon: Brain, name: "AI Assistant", blurb: "Drafts replies and answers from your knowledge base." },
  { icon: BarChart3, name: "Analytics", blurb: "Response times, revenue and team performance." },
  { icon: Building2, name: "HR", blurb: "People records, roles and documents in one place." },
  { icon: CalendarCheck, name: "Attendance", blurb: "Shifts, check-ins and leave tracking." },
  { icon: ListChecks, name: "Tasks", blurb: "Assign work and see what's actually moving." },
  { icon: FolderKanban, name: "Projects", blurb: "Plan delivery alongside the customers it serves." },
  { icon: Boxes, name: "Inventory", blurb: "Stock levels that stay honest across branches." },
  { icon: CircleDollarSign, name: "Finance", blurb: "Invoices, payments and margins, connected." },
  { icon: Building2, name: "Multi-Branch", blurb: "Run every location from a single console." },
];

// Custom development work OOTRIX builds for clients — distinct from the
// PRODUCTS list above, which is the SaaS platform's own module set.
const SERVICES = [
  { icon: Globe, name: "Websites", blurb: "Marketing sites and landing pages that convert." },
  { icon: AppWindow, name: "Web Apps", blurb: "Custom dashboards and internal tools, built to spec." },
  { icon: Code2, name: "PHP / Custom Build", blurb: "Bespoke backends when off-the-shelf won't fit." },
  { icon: LayoutTemplate, name: "WordPress", blurb: "Themes, plugins and full builds on WordPress." },
  { icon: ShoppingCart, name: "E-commerce", blurb: "Storefronts with payments, catalog and checkout." },
  { icon: Smartphone, name: "Android (APK)", blurb: "Native Android apps, packaged and distributed." },
  { icon: Apple, name: "iOS", blurb: "Native iPhone and iPad apps for the App Store." },
];

const INDUSTRIES = [
  "Travel Agencies",
  "Jewellery Stores",
  "Retail Chains",
  "Restaurants",
  "Clinics",
  "Real Estate",
  "Educational Institutes",
  "Small Businesses",
  "Enterprises",
];

const PLANS = [
  {
    id: "trial",
    name: "Free Trial",
    price: "Free",
    period: "for 14 days",
    tagline: "Everything in GO, no card required.",
    cta: "Start free trial",
    featured: false,
    features: [
      "Full product access",
      "Up to 3 team members",
      "WhatsApp shared inbox",
      "Sales pipeline & contacts",
      "Email support",
    ],
  },
  {
    id: "go",
    name: "GO",
    price: "$49",
    period: "per month",
    tagline: "For growing teams running day-to-day operations.",
    cta: "Choose GO",
    featured: true,
    features: [
      "Everything in Free Trial",
      "Up to 15 team members",
      "Marketing automation",
      "AI assistant & knowledge base",
      "Analytics dashboards",
      "Priority support",
    ],
  },
  {
    id: "plus",
    name: "Plus",
    price: "$149",
    period: "per month",
    tagline: "For multi-branch businesses that need the full system.",
    cta: "Choose Plus",
    featured: false,
    features: [
      "Everything in GO",
      "Unlimited team members",
      "HR, attendance & payroll records",
      "Inventory & finance",
      "Multi-branch management",
      "Dedicated onboarding",
    ],
  },
];

export default function MarketingPage() {
  return (
    <>
      <SiteNav />
      <main>
        <Hero />
        <TrustBar />
        <Products />
        <Services />
        <Industries />
        <Pricing />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}

function SiteNav() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 8));

  return (
    <motion.header
      className="sticky top-0 z-50 border-b backdrop-blur-xl"
      animate={{
        boxShadow: scrolled
          ? "0 8px 30px -18px color-mix(in oklab, var(--oo-deep) 55%, transparent)"
          : "0 0px 0px 0px transparent",
      }}
      transition={{ duration: 0.25 }}
      style={{
        borderColor: "var(--oo-border)",
        background: "color-mix(in oklab, var(--oo-surface) 82%, transparent)",
      }}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" aria-label="OOTRIX home">
          <OotrixLogo />
        </Link>

        <div
          className="hidden items-center gap-8 text-sm font-medium md:flex"
          style={{ color: "var(--oo-text-soft)" }}
        >
          <a href="#products" className="transition-opacity hover:opacity-60">
            Products
          </a>
          <a href="#services" className="transition-opacity hover:opacity-60">
            Services
          </a>
          <a href="#industries" className="transition-opacity hover:opacity-60">
            Industries
          </a>
          <a href="#pricing" className="transition-opacity hover:opacity-60">
            Pricing
          </a>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="hidden rounded-full px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-70 sm:block"
            style={{ color: "var(--oo-ink)" }}
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:-translate-y-px sm:px-5"
            style={{ background: "var(--oo-primary)" }}
          >
            Start free
          </Link>
        </div>
      </nav>
    </motion.header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Ambient wash. Two soft radial tints rather than a linear
          gradient sheet — the brand asks for minimal, and this reads as
          light in the room instead of a coloured panel. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60rem 32rem at 12% -10%, color-mix(in oklab, var(--oo-secondary) 16%, transparent), transparent 62%), radial-gradient(46rem 28rem at 92% 4%, color-mix(in oklab, var(--oo-primary) 12%, transparent), transparent 60%)",
        }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-10 -z-10 size-[26rem] rounded-full blur-3xl"
        style={{ background: "color-mix(in oklab, var(--oo-secondary) 18%, transparent)" }}
        animate={{ x: [0, 24, 0], y: [0, -16, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-16 top-24 -z-10 size-[22rem] rounded-full blur-3xl"
        style={{ background: "color-mix(in oklab, var(--oo-primary) 14%, transparent)" }}
        animate={{ x: [0, -20, 0], y: [0, 22, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="mx-auto max-w-6xl px-5 pb-20 pt-16 sm:px-8 sm:pb-28 sm:pt-24">
        <Reveal>
          <span
            className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold tracking-wide"
            style={{
              borderColor: "var(--oo-border)",
              color: "var(--oo-primary)",
              background: "var(--oo-muted)",
            }}
          >
            <Sparkles className="size-3.5" />
            AI-powered business operating system
          </span>
        </Reveal>

        <Reveal delay={80}>
          <h1 className="mt-7 max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
            Connect with customers.
            <br />
            Automate the busywork.
            <br />
            <span style={{ color: "var(--oo-primary)" }}>Grow faster.</span>
          </h1>
        </Reveal>

        <Reveal delay={160}>
          <p
            className="mt-6 max-w-xl text-base leading-relaxed sm:text-lg"
            style={{ color: "var(--oo-text-soft)" }}
          >
            OOTRIX brings your CRM, WhatsApp, calling, sales, teams,
            inventory and finance into one platform — so nothing falls
            through the cracks and every branch runs the same way.
          </p>
        </Reveal>

        <Reveal delay={240}>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/signup"
              className="group inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5"
              style={{ background: "var(--oo-primary)" }}
            >
              Start your free trial
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#products"
              className="inline-flex items-center justify-center gap-2 rounded-full border px-6 py-3.5 text-sm font-semibold transition-colors"
              style={{
                borderColor: "var(--oo-border)",
                color: "var(--oo-ink)",
              }}
            >
              See what&apos;s included
            </a>
          </div>
        </Reveal>

        <Reveal delay={320}>
          <p
            className="mt-5 text-xs"
            style={{ color: "var(--oo-text-faint)" }}
          >
            14 days free · No credit card required · Cancel anytime
          </p>
        </Reveal>

        <Reveal delay={400}>
          <HeroVisual />
        </Reveal>
      </div>
    </section>
  );
}

/**
 * Abstract product visual. Deliberately not a screenshot: the app is
 * mid-redesign, and a stale screenshot on the landing page ages badly
 * and misrepresents what a visitor gets. This suggests the shape of the
 * product without claiming a specific screen.
 */
function HeroVisual() {
  const rows = [
    { label: "WhatsApp", value: "24 open", pct: 82, tone: "var(--oo-primary)" },
    { label: "Pipeline", value: "$128k", pct: 64, tone: "var(--oo-secondary)" },
    { label: "Tasks", value: "18 due", pct: 43, tone: "var(--oo-accent)" },
  ];

  return (
    <div
      className="mt-16 overflow-hidden rounded-3xl border shadow-2xl"
      style={{
        borderColor: "var(--oo-border)",
        background: "var(--oo-surface-2)",
        boxShadow: "0 40px 80px -32px color-mix(in oklab, var(--oo-deep) 55%, transparent)",
      }}
    >
      <div
        className="flex items-center gap-2 border-b px-5 py-3.5"
        style={{ borderColor: "var(--oo-border)", background: "var(--oo-muted)" }}
      >
        <OotrixMark className="h-4 w-auto" decorative />
        <span
          className="text-xs font-semibold tracking-widest"
          style={{ color: "var(--oo-text-faint)" }}
        >
          DASHBOARD
        </span>
      </div>

      <div className="grid gap-4 p-5 sm:grid-cols-3 sm:p-7">
        {rows.map((row, i) => (
          <Reveal key={row.label} delay={480 + i * 90}>
            <div
              className="rounded-2xl border p-5"
              style={{ borderColor: "var(--oo-border)" }}
            >
              <p
                className="text-xs font-semibold tracking-wide"
                style={{ color: "var(--oo-text-faint)" }}
              >
                {row.label.toUpperCase()}
              </p>
              <p className="mt-2 text-2xl font-bold tracking-tight">
                {row.value}
              </p>
              <div
                className="mt-4 h-1.5 overflow-hidden rounded-full"
                style={{ background: "var(--oo-muted)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${row.pct}%`, background: row.tone }}
                />
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  );
}

function TrustBar() {
  const stats = [
    { value: 180, suffix: "+", label: "Companies registered" },
    { value: 15, suffix: "", label: "Products in one platform" },
    { value: 9, suffix: "", label: "Industries served" },
    { value: null, display: "24/7", label: "Support" },
  ] as const;

  return (
    <section
      className="border-y py-14"
      style={{ borderColor: "var(--oo-border)", background: "var(--oo-muted)" }}
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <p
            className="text-center text-xs font-semibold tracking-[0.2em]"
            style={{ color: "var(--oo-text-faint)" }}
          >
            TRUSTED BY GROWING BUSINESSES
          </p>
        </Reveal>
        <div className="mt-9 grid grid-cols-2 gap-8 sm:grid-cols-4">
          {stats.map((stat, i) => (
            <Reveal key={stat.label} delay={i * 90}>
              <div className="text-center">
                <p
                  className="text-3xl font-bold tracking-tight sm:text-4xl"
                  style={{ color: "var(--oo-primary)" }}
                >
                  {stat.value !== null ? (
                    <Counter to={stat.value} suffix={stat.suffix} />
                  ) : (
                    stat.display
                  )}
                </p>
                <p
                  className="mt-1.5 text-sm"
                  style={{ color: "var(--oo-text-soft)" }}
                >
                  {stat.label}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Counts up from 0 to `to` once scrolled into view. Falls visible the
 * same way `Reveal` does: the final number is always what's in the DOM
 * on first paint via SSR (`to`), and the animation only overwrites it
 * client-side after mount — a failed/slow animation never leaves a
 * stat reading "0".
 */
function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(to);
  const inViewRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !inViewRef.current) {
            inViewRef.current = true;
            const start = performance.now();
            const duration = 1100;
            const step = (now: number) => {
              const progress = Math.min((now - start) / duration, 1);
              const eased = 1 - Math.pow(1 - progress, 3);
              setDisplay(Math.round(to * eased));
              if (progress < 1) requestAnimationFrame(step);
            };
            setDisplay(0);
            requestAnimationFrame(step);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [to]);

  return (
    <span ref={ref}>
      {display}
      {suffix}
    </span>
  );
}

function SectionHead({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <Reveal>
      <div className="mx-auto max-w-2xl text-center">
        <p
          className="text-xs font-semibold tracking-[0.2em]"
          style={{ color: "var(--oo-secondary)" }}
        >
          {eyebrow}
        </p>
        <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
          {title}
        </h2>
        <p
          className="mt-4 text-base leading-relaxed"
          style={{ color: "var(--oo-text-soft)" }}
        >
          {body}
        </p>
      </div>
    </Reveal>
  );
}

function Products() {
  return (
    <section id="products" className="scroll-mt-20 py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHead
          eyebrow="ONE PLATFORM"
          title="Everything your business runs on"
          body="Fifteen products that share the same customer record, the same permissions and the same reporting — instead of six tools that don't talk to each other."
        />

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCTS.map((product, i) => (
            <Reveal key={product.name} delay={(i % 3) * 80}>
              <motion.div
                className="group h-full rounded-2xl border p-6"
                style={{
                  borderColor: "var(--oo-border)",
                  background: "var(--oo-surface-2)",
                }}
                whileHover={{ y: -4, boxShadow: "0 20px 40px -24px color-mix(in oklab, var(--oo-deep) 45%, transparent)" }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
              >
                <motion.div
                  className="flex size-11 items-center justify-center rounded-xl"
                  style={{
                    background: "color-mix(in oklab, var(--oo-secondary) 20%, transparent)",
                    color: "var(--oo-primary)",
                  }}
                  whileHover={{ scale: 1.08 }}
                  transition={{ type: "spring", stiffness: 400, damping: 18 }}
                >
                  <product.icon className="size-5" />
                </motion.div>
                <h3 className="mt-4 text-base font-semibold tracking-tight">
                  {product.name}
                </h3>
                <p
                  className="mt-1.5 text-sm leading-relaxed"
                  style={{ color: "var(--oo-text-soft)" }}
                >
                  {product.blurb}
                </p>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Services() {
  return (
    <section
      id="services"
      className="scroll-mt-20 border-y py-24 sm:py-28"
      style={{ borderColor: "var(--oo-border)", background: "var(--oo-muted)" }}
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHead
          eyebrow="BEYOND THE PLATFORM"
          title="We also build it for you"
          body="Websites, web and mobile apps, e-commerce stores and custom software — for businesses that need something built, not just a platform to run on."
        />

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map((service, i) => (
            <Reveal key={service.name} delay={(i % 4) * 70}>
              <motion.div
                className="group h-full rounded-2xl border p-6"
                style={{
                  borderColor: "var(--oo-border)",
                  background: "var(--oo-surface-2)",
                }}
                whileHover={{ y: -4, boxShadow: "0 20px 40px -24px color-mix(in oklab, var(--oo-deep) 45%, transparent)" }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
              >
                <motion.div
                  className="flex size-11 items-center justify-center rounded-xl"
                  style={{
                    background: "color-mix(in oklab, var(--oo-accent) 20%, transparent)",
                    color: "var(--oo-accent)",
                  }}
                  whileHover={{ scale: 1.08 }}
                  transition={{ type: "spring", stiffness: 400, damping: 18 }}
                >
                  <service.icon className="size-5" />
                </motion.div>
                <h3 className="mt-4 text-base font-semibold tracking-tight">
                  {service.name}
                </h3>
                <p
                  className="mt-1.5 text-sm leading-relaxed"
                  style={{ color: "var(--oo-text-soft)" }}
                >
                  {service.blurb}
                </p>
              </motion.div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={280}>
          <div className="mt-12 text-center">
            <a
              href="#final-cta"
              className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5"
              style={{ background: "var(--oo-primary)" }}
            >
              Talk to us about your project
              <ArrowRight className="size-4" />
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Industries() {
  return (
    <section
      id="industries"
      className="scroll-mt-20 border-y py-24 sm:py-28"
      style={{ borderColor: "var(--oo-border)", background: "var(--oo-muted)" }}
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHead
          eyebrow="BUILT FOR YOUR SECTOR"
          title="Configured for how you actually work"
          body="A jewellery store and a clinic don't run the same way. Fields, pipelines and automations adapt to your business instead of forcing you into a generic template."
        />

        <div className="mt-12 flex flex-wrap justify-center gap-3">
          {INDUSTRIES.map((industry, i) => (
            <Reveal key={industry} delay={i * 55}>
              <span
                className="inline-flex items-center rounded-full border px-5 py-2.5 text-sm font-medium transition-transform hover:-translate-y-0.5"
                style={{
                  borderColor: "var(--oo-border)",
                  background: "var(--oo-surface-2)",
                }}
              >
                {industry}
              </span>
            </Reveal>
          ))}
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {[
            { icon: Zap, title: "Live in days", body: "Import your contacts and connect WhatsApp the same week. No six-month rollout." },
            { icon: ShieldCheck, title: "Your data stays yours", body: "Row-level security isolates every company. Bring your own AI keys." },
            { icon: Headphones, title: "Real people, fast", body: "Onboarding help and support from a team that knows the product." },
          ].map((item, i) => (
            <Reveal key={item.title} delay={i * 90}>
              <div
                className="h-full rounded-2xl border p-6"
                style={{
                  borderColor: "var(--oo-border)",
                  background: "var(--oo-surface-2)",
                }}
              >
                <item.icon
                  className="size-5"
                  style={{ color: "var(--oo-primary)" }}
                />
                <h3 className="mt-4 font-semibold tracking-tight">{item.title}</h3>
                <p
                  className="mt-1.5 text-sm leading-relaxed"
                  style={{ color: "var(--oo-text-soft)" }}
                >
                  {item.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHead
          eyebrow="PRICING"
          title="Start free. Upgrade when it's earning."
          body="Try the whole platform for 14 days without a card. Keep it only if it's working for you."
        />

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {PLANS.map((plan, i) => (
            <Reveal key={plan.id} delay={i * 110}>
              <motion.div
                className="relative flex h-full flex-col rounded-3xl border p-7"
                style={{
                  borderColor: plan.featured
                    ? "var(--oo-primary)"
                    : "var(--oo-border)",
                  background: "var(--oo-surface-2)",
                  boxShadow: plan.featured
                    ? "0 24px 60px -28px color-mix(in oklab, var(--oo-primary) 55%, transparent)"
                    : undefined,
                }}
                whileHover={{ y: -6 }}
                transition={{ type: "spring", stiffness: 280, damping: 22 }}
              >
                {plan.featured && (
                  <span
                    className="absolute -top-3 left-7 rounded-full px-3 py-1 text-[11px] font-bold tracking-wide"
                    style={{
                      background: "var(--oo-accent)",
                      color: "var(--oo-deep)",
                    }}
                  >
                    MOST POPULAR
                  </span>
                )}

                <h3 className="text-lg font-bold tracking-tight">{plan.name}</h3>
                <p
                  className="mt-1.5 text-sm leading-relaxed"
                  style={{ color: "var(--oo-text-soft)" }}
                >
                  {plan.tagline}
                </p>

                <div className="mt-6 flex items-baseline gap-2">
                  <span className="text-4xl font-bold tracking-tight">
                    {plan.price}
                  </span>
                  <span
                    className="text-sm"
                    style={{ color: "var(--oo-text-faint)" }}
                  >
                    {plan.period}
                  </span>
                </div>

                <ul className="mt-7 flex-1 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm">
                      <Check
                        className="mt-0.5 size-4 shrink-0"
                        style={{ color: "var(--oo-primary)" }}
                      />
                      <span style={{ color: "var(--oo-text-soft)" }}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/signup"
                  className="mt-8 inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5"
                  style={
                    plan.featured
                      ? { background: "var(--oo-primary)", color: "#fff" }
                      : {
                          border: "1px solid var(--oo-border)",
                          color: "var(--oo-ink)",
                        }
                  }
                >
                  {plan.cta}
                </Link>
              </motion.div>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <p
            className="mt-10 text-center text-xs"
            style={{ color: "var(--oo-text-faint)" }}
          >
            Prices in USD. Plans are billed monthly and can be cancelled at any time.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section id="final-cta" className="scroll-mt-20 px-5 pb-24 sm:px-8">
      <div
        className="mx-auto max-w-6xl overflow-hidden rounded-3xl px-8 py-16 text-center sm:py-20"
        style={{
          background:
            "linear-gradient(135deg, var(--oo-primary), var(--oo-deep))",
        }}
      >
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Ready to run everything from one place?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-base text-white/75">
            Start your 14-day free trial today. No credit card, no setup fee,
            and your data is yours to export whenever you want.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
              style={{ color: "var(--oo-primary)" }}
            >
              Start free trial
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-full border border-white/25 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Sign in
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t py-12" style={{ borderColor: "var(--oo-border)" }}>
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-5 sm:px-8 md:flex-row">
        <div className="flex flex-col items-center gap-2 md:items-start">
          <OotrixLogo />
          <p
            className="text-xs tracking-[0.18em]"
            style={{ color: "var(--oo-text-faint)" }}
          >
            CONNECT · MANAGE · GROW
          </p>
        </div>

        <div
          className="flex flex-wrap items-center justify-center gap-6 text-sm"
          style={{ color: "var(--oo-text-soft)" }}
        >
          <a href="#products" className="transition-opacity hover:opacity-60">
            Products
          </a>
          <a href="#services" className="transition-opacity hover:opacity-60">
            Services
          </a>
          <a href="#industries" className="transition-opacity hover:opacity-60">
            Industries
          </a>
          <a href="#pricing" className="transition-opacity hover:opacity-60">
            Pricing
          </a>
          <Link href="/login" className="transition-opacity hover:opacity-60">
            Sign in
          </Link>
        </div>
      </div>

      <p
        className="mt-8 text-center text-xs"
        style={{ color: "var(--oo-text-faint)" }}
      >
        © {new Date().getFullYear()} OOTRIX. All rights reserved.
      </p>
    </footer>
  );
}
