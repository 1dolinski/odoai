import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offer Autoresearch — odoai",
  description:
    "Autonomous offer research: generate, validate, keep what works, discard what doesn't, repeat.",
};

export default function AutoresearchPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white relative overflow-hidden selection:bg-emerald-500/30">
      {/* Ambient light */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-[-20%] left-[30%] w-[600px] h-[600px] bg-emerald-600/6 rounded-full blur-[150px]" />
        <div className="absolute top-[50%] right-[-5%] w-[400px] h-[400px] bg-cyan-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-15%] left-[-10%] w-[500px] h-[500px] bg-amber-500/4 rounded-full blur-[130px]" />
      </div>

      <div className="relative z-10">
        {/* Nav */}
        <nav className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-6 flex items-center justify-between">
          <a href="/" className="text-lg font-bold tracking-tight">
            odo<span className="text-blue-400">ai</span>
          </a>
          <div className="flex items-center gap-3 sm:gap-4 text-sm text-gray-400">
            <a href="/vision" className="hover:text-white transition-colors">
              Vision
            </a>
            <a
              href="https://t.me/odoai_bot"
              className="hover:text-white transition-colors"
            >
              Try it →
            </a>
          </div>
        </nav>

        {/* Hero */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-14 sm:pb-24 text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 text-xs text-emerald-400 font-medium mb-8 backdrop-blur-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Autonomous research loop
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
            Offer{" "}
            <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
              Autoresearch
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-400 max-w-xl mx-auto leading-relaxed">
            Try an offer, validate it against evidence, keep what works, discard
            what doesn&apos;t, repeat. Your business offers get sharper with
            every iteration.
          </p>
        </section>

        {/* The idea */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-14 sm:pb-24">
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-800/80 bg-gray-900/30 p-5 backdrop-blur-sm sm:col-span-2">
              <p className="text-gray-300 text-sm leading-relaxed">
                Inspired by{" "}
                <a
                  href="https://github.com/davebcn87/pi-autoresearch"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:underline"
                >
                  pi-autoresearch
                </a>{" "}
                — the same pattern that optimizes code performance, applied to
                business strategy. Instead of measuring milliseconds, we measure
                confidence. Instead of testing code changes, we test offers
                against your team&apos;s actual context, conversations, and data.
              </p>
            </div>
            <InsightCard
              icon="🧪"
              title="Hypothesis"
              desc="AI generates 3-5 specific offers from everything it knows about your team — abilities, conversations, metrics, contacts."
            />
            <InsightCard
              icon="📊"
              title="Evidence"
              desc="Each offer is scored against real data. Social metrics, team capacity, market signals, and what's already working."
            />
            <InsightCard
              icon="✓"
              title="Keep / Discard"
              desc="Strong offers survive. Weak ones get rejected with a reason. New hypotheses replace them."
            />
            <InsightCard
              icon="🔄"
              title="Iterate"
              desc="Each loop gets sharper. The AI sees previous iterations, what was tried, what failed, and why — and builds on it."
            />
          </div>
        </section>

        {/* The loop diagram */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-16 sm:pb-28">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-600 font-semibold mb-6 sm:mb-10 text-center">
            The loop
          </p>
          <div className="space-y-3 sm:space-y-4">
            <div className="rounded-xl sm:rounded-2xl border border-emerald-500/30 bg-gray-900/40 backdrop-blur-sm p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs sm:text-sm font-bold text-emerald-400 font-mono">Iteration 1</span>
              </div>
              <div className="space-y-2">
                <LoopLine emoji="📖" label="Read" text="conversations, tasks, people, metrics, abilities" />
                <LoopLine emoji="⚡" label="Generate" text="3-5 offers with price, buyer, delivery, costs" />
                <LoopLine emoji="📊" label="Score" text="confidence 1-100 based on evidence strength" />
                <LoopLine emoji="📝" label="Log" text="research summary + what was tried" />
              </div>
            </div>
            <div className="flex justify-center">
              <div className="w-px h-4 sm:h-6 bg-gradient-to-b from-emerald-500/40 to-cyan-500/40" />
            </div>
            <div className="rounded-xl sm:rounded-2xl border border-cyan-500/30 bg-gray-900/40 backdrop-blur-sm p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-xs sm:text-sm font-bold text-cyan-400 font-mono">Iteration 2+</span>
              </div>
              <div className="space-y-2">
                <LoopLine emoji="🔍" label="Review" text="existing offers + new context since last run" />
                <LoopLine emoji="✓" label="Keep" text="strong offers (bump confidence with evidence)" />
                <LoopLine emoji="✕" label="Reject" text="weak offers (explain why)" />
                <LoopLine emoji="🔄" label="Generate" text="new offers to replace rejected" />
                <LoopLine emoji="🎯" label="Target" text="always maintain 3-5 active offers" />
              </div>
            </div>
            <p className="text-center text-[11px] sm:text-xs text-gray-600 font-medium tracking-wide">
              ↓ repeat until offers are sharp
            </p>
          </div>
        </section>

        {/* What makes a good offer */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 sm:pb-28">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-600 font-semibold mb-3 sm:mb-4">
            What the AI produces
          </p>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight mb-6 sm:mb-8">
            Not &ldquo;consulting services.&rdquo;
            <br />
            <span className="text-emerald-400">
              Specific, priced, testable offers.
            </span>
          </h2>
          <div className="space-y-4">
            <OfferField
              label="Name"
              example="Weekly DTC Growth Call"
              desc="A short, punchy product name — not a category"
            />
            <OfferField
              label="Description"
              example="30-min weekly strategy call + async Telegram support for DTC brands doing $50-500k/mo. We review your metrics, identify the highest-leverage move, and give you the playbook."
              desc="2-3 sentences. What the buyer gets. Crystal clear."
            />
            <OfferField
              label="Price"
              example="$1,500/mo"
              desc="Specific price based on value delivered, not time spent"
            />
            <OfferField
              label="Target Buyer"
              example="DTC brand founders doing $50-500k/mo who are stuck on paid acquisition and haven't cracked organic content yet"
              desc="A person you can find, not a demographic"
            />
            <OfferField
              label="Why Now"
              example="Team just completed 3 social audits — the framework is proven and repeatable. Short-form content data shows 4x engagement on Reels."
              desc="Grounded in your actual momentum and timing"
            />
            <OfferField
              label="Delivery"
              example="hybrid — automated weekly report + human strategy call"
              desc="Automated, human, or hybrid — with specifics"
            />
            <OfferField
              label="Cost → Revenue"
              example="$200/mo tools + 2hrs/week → $1,500/mo per client"
              desc="Real unit economics. Can you deliver this profitably?"
            />
            <OfferField
              label="Confidence"
              example="62 — have the framework and initial data, need 2-3 test clients to validate willingness to pay"
              desc="1-100 score + what evidence supports it"
            />
          </div>
        </section>

        {/* What it reads */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-16 sm:pb-28">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-600 font-semibold mb-3 sm:mb-4">
            Context is everything
          </p>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight mb-6 sm:mb-8">
            The AI reads your{" "}
            <span className="text-cyan-400">entire operating context</span>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
            <ContextCard
              icon="💬"
              title="Conversations"
              desc="Recent Telegram messages — what's being discussed, debated, planned"
            />
            <ContextCard
              icon="📋"
              title="Tasks & Priorities"
              desc="What's in motion, what's blocked, what has momentum"
            />
            <ContextCard
              icon="👥"
              title="People & Contacts"
              desc="Team roles, abilities, intentions, network access"
            />
            <ContextCard
              icon="📊"
              title="Metrics & Data"
              desc="Connected data sources, social analytics, business signals"
            />
            <ContextCard
              icon="📝"
              title="Dumps & Notes"
              desc="Every piece of context the team has shared"
            />
            <ContextCard
              icon="🎯"
              title="Answered Questions"
              desc="Deep team knowledge from AI Q&A sessions"
            />
            <ContextCard
              icon="🍽"
              title="Existing Products"
              desc="Current menu items, pricing, target buyers"
            />
            <ContextCard
              icon="🚀"
              title="Initiatives"
              desc="Active workstreams and their status"
            />
            <ContextCard
              icon="📜"
              title="Research History"
              desc="Previous iterations — what was tried, kept, and killed"
            />
          </div>
        </section>

        {/* The lifecycle */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 sm:pb-28">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-600 font-semibold mb-3 sm:mb-4">
            Offer lifecycle
          </p>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight mb-6 sm:mb-8">
            From hypothesis to live
          </h2>
          <div className="space-y-0">
            <LifecycleStep
              status="hypothesis"
              color="blue"
              title="Hypothesis"
              desc="AI-generated based on context. Untested. Confidence is a best guess."
            />
            <LifecycleConnector />
            <LifecycleStep
              status="validating"
              color="yellow"
              title="Validating"
              desc="You're testing it — conversations with potential buyers, landing page, outreach. Evidence is being gathered."
            />
            <LifecycleConnector />
            <LifecycleStep
              status="validated"
              color="green"
              title="Validated"
              desc="Strong evidence: someone has paid, expressed clear intent, or the numbers clearly work. High confidence."
            />
            <LifecycleConnector />
            <LifecycleStep
              status="live"
              color="emerald"
              title="Live"
              desc="Actively being sold. You're delivering it, collecting revenue, and iterating on the experience."
            />
            <LifecycleConnector />
            <LifecycleStep
              status="rejected"
              color="red"
              title="Rejected"
              desc="Didn't work. The AI logs why, learns from it, and generates a replacement hypothesis."
            />
          </div>
        </section>

        {/* Comparison */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 sm:pb-28">
          <div className="rounded-xl sm:rounded-2xl border border-gray-800 bg-gray-900/40 backdrop-blur-sm p-4 sm:p-8 md:p-10">
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight mb-5 sm:mb-6">
              Autoresearch for code vs. offers
            </h2>
            {/* Table for md+ */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-800">
                    <th className="pb-3 pr-4 font-medium" />
                    <th className="pb-3 pr-4 font-medium">
                      <a
                        href="https://github.com/davebcn87/pi-autoresearch"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:underline"
                      >
                        pi-autoresearch
                      </a>
                    </th>
                    <th className="pb-3 font-medium text-emerald-400">
                      odoai offers
                    </th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  <CompRow label="Optimizes" left="Test speed, bundle size, build times" right="Business offers, pricing, market fit" />
                  <CompRow label="Metric" left="Seconds, KB, scores" right="Confidence score (1-100)" />
                  <CompRow label="Experiment" left="Edit code → run benchmark → measure" right="Generate offer → validate against data → score" />
                  <CompRow label="Keep/discard" left="Faster? Keep. Slower? Revert." right="Evidence strong? Keep. Weak? Reject + explain." />
                  <CompRow label="Log" left="autoresearch.jsonl" right="offerResearchLog (persists across iterations)" />
                  <CompRow label="Context" left="autoresearch.md + code" right="Conversations, tasks, people, metrics, history" />
                  <CompRow label="Loop" left="Agent runs autonomously" right="Human-triggered, AI-executed" />
                </tbody>
              </table>
            </div>
            {/* Cards for mobile */}
            <div className="md:hidden space-y-3">
              <CompCard label="Optimizes" left="Test speed, bundle size, build times" right="Business offers, pricing, market fit" />
              <CompCard label="Metric" left="Seconds, KB, scores" right="Confidence score (1-100)" />
              <CompCard label="Experiment" left="Edit code → run benchmark → measure" right="Generate offer → validate against data → score" />
              <CompCard label="Keep/discard" left="Faster? Keep. Slower? Revert." right="Evidence strong? Keep. Weak? Reject + explain." />
              <CompCard label="Log" left="autoresearch.jsonl" right="offerResearchLog (persists across iterations)" />
              <CompCard label="Context" left="autoresearch.md + code" right="Conversations, tasks, people, metrics, history" />
              <CompCard label="Loop" left="Agent runs autonomously" right="Human-triggered, AI-executed" />
            </div>
          </div>
        </section>

        {/* Why it works */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 sm:pb-28">
          <div className="relative rounded-xl sm:rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/40 via-gray-950 to-cyan-950/30 p-5 sm:p-8 md:p-12 overflow-hidden">
            <div className="pointer-events-none absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-[80px]" />
            <div className="relative">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight mb-6">
                Why this works
              </h2>
              <div className="space-y-4 text-gray-300 text-base leading-relaxed">
                <p>
                  Most teams brainstorm offers in a meeting, pick one based on
                  gut feel, and spend months building it before finding out if
                  anyone will pay.
                </p>
                <p>
                  Autoresearch inverts this. The AI already has your full context
                  — it&apos;s been listening to every conversation, tracking
                  every task, indexing every piece of data. It generates offers
                  that are{" "}
                  <em className="text-white">grounded in what you can actually deliver</em>,
                  priced based on{" "}
                  <em className="text-white">value you&apos;ve already demonstrated</em>,
                  targeted at{" "}
                  <em className="text-white">
                    buyers your team has access to
                  </em>
                  .
                </p>
                <p>
                  Then it iterates. Each run sees new conversations, new data,
                  new completed tasks. Confidence goes up or down based on
                  evidence, not hope. Bad ideas die fast. Good ideas get sharper.
                </p>
                <p className="text-white font-medium">
                  After 3-4 iterations, you don&apos;t have a brainstorm list.
                  You have 3-5 battle-tested offers with specific prices,
                  specific buyers, and evidence-backed confidence scores. Ready
                  to sell.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24 text-center">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight mb-3 sm:mb-4">
            Stop guessing what to sell.
          </h2>
          <p className="text-gray-400 text-sm sm:text-base mb-6 sm:mb-8 max-w-lg mx-auto">
            Add odoai to your group chat. Let it build context. Then hit
            &ldquo;Generate Offers&rdquo; in the Priorities dashboard.
          </p>
          <a
            href="https://t.me/odoai_bot"
            className="group inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 transition-all duration-200 px-7 py-3.5 rounded-xl font-medium text-[15px] shadow-lg shadow-emerald-600/20 hover:shadow-emerald-500/30 hover:-translate-y-0.5"
          >
            Add to Telegram
            <span className="transition-transform duration-200 group-hover:translate-x-0.5">
              →
            </span>
          </a>
          <p className="text-gray-600 text-xs mt-4">
            Free to use · Offer research in the Priorities dashboard
          </p>
        </section>

        {/* Footer */}
        <footer className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 border-t border-gray-800/50 flex items-center justify-between text-xs text-gray-600">
          <span>
            odo<span className="text-gray-500">ai</span>
          </span>
          <div className="flex items-center gap-4">
            <a href="/" className="hover:text-gray-400 transition-colors">
              Home
            </a>
            <a href="/vision" className="hover:text-gray-400 transition-colors">
              Vision
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}

function InsightCard({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-gray-800/80 bg-gray-900/30 p-5 backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <span className="text-lg shrink-0 mt-0.5">{icon}</span>
        <div>
          <div className="font-semibold text-sm text-gray-100 mb-1">
            {title}
          </div>
          <div className="text-gray-500 text-[13px] leading-relaxed">
            {desc}
          </div>
        </div>
      </div>
    </div>
  );
}

function OfferField({
  label,
  example,
  desc,
}: {
  label: string;
  example: string;
  desc: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 border-b border-gray-800/60 pb-4">
      <div className="sm:w-28 shrink-0">
        <span className="text-xs font-bold uppercase tracking-widest text-emerald-500">
          {label}
        </span>
      </div>
      <div className="flex-1">
        <p className="text-sm text-white font-medium leading-relaxed mb-1">
          {example}
        </p>
        <p className="text-xs text-gray-500">{desc}</p>
      </div>
    </div>
  );
}

function ContextCard({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-lg border border-gray-800/60 bg-gray-900/20 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm">{icon}</span>
        <span className="text-xs font-semibold text-gray-200">{title}</span>
      </div>
      <p className="text-[11px] text-gray-500 leading-relaxed">{desc}</p>
    </div>
  );
}

function LifecycleStep({
  status,
  color,
  title,
  desc,
}: {
  status: string;
  color: string;
  title: string;
  desc: string;
}) {
  const dotColors: Record<string, string> = {
    blue: "bg-blue-400",
    yellow: "bg-yellow-400",
    green: "bg-green-400",
    emerald: "bg-emerald-400",
    red: "bg-red-400",
  };
  const badgeColors: Record<string, string> = {
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    yellow: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    green: "bg-green-500/10 text-green-400 border-green-500/20",
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <div className="flex gap-3 sm:gap-5">
      <div className="flex flex-col items-center shrink-0">
        <div
          className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${dotColors[color]} shadow-lg`}
          style={{ boxShadow: "0 0 12px 2px currentColor" }}
        />
      </div>
      <div className="pb-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h3 className="text-sm sm:text-base font-bold text-white">{title}</h3>
          <span
            className={`text-[10px] font-medium rounded-full px-2 py-0.5 border ${badgeColors[color]}`}
          >
            {status}
          </span>
        </div>
        <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function LifecycleConnector() {
  return (
    <div className="flex gap-3 sm:gap-5">
      <div className="flex flex-col items-center shrink-0 w-2.5 sm:w-3">
        <div className="w-px h-4 sm:h-6 bg-gradient-to-b from-gray-700 to-gray-800" />
      </div>
      <div />
    </div>
  );
}

function LoopLine({
  emoji,
  label,
  text,
}: {
  emoji: string;
  label: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs shrink-0 mt-0.5 w-4 text-center">{emoji}</span>
      <p className="text-[13px] sm:text-sm text-gray-400 leading-relaxed">
        <span className="text-gray-200 font-medium">{label}:</span> {text}
      </p>
    </div>
  );
}

function CompRow({
  label,
  left,
  right,
}: {
  label: string;
  left: string;
  right: string;
}) {
  return (
    <tr className="border-b border-gray-800/50">
      <td className="py-2.5 pr-4 text-gray-500 font-medium text-xs uppercase tracking-wide whitespace-nowrap">
        {label}
      </td>
      <td className="py-2.5 pr-4 text-gray-400 text-[13px]">{left}</td>
      <td className="py-2.5 text-gray-200 text-[13px]">{right}</td>
    </tr>
  );
}

function CompCard({
  label,
  left,
  right,
}: {
  label: string;
  left: string;
  right: string;
}) {
  return (
    <div className="rounded-lg border border-gray-800/60 bg-gray-900/20 p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
        {label}
      </p>
      <div className="flex items-start gap-1.5 mb-1.5">
        <span className="text-cyan-400 text-[10px] mt-0.5 shrink-0">◆</span>
        <p className="text-[12px] text-gray-400 leading-relaxed">{left}</p>
      </div>
      <div className="flex items-start gap-1.5">
        <span className="text-emerald-400 text-[10px] mt-0.5 shrink-0">◆</span>
        <p className="text-[12px] text-gray-200 leading-relaxed">{right}</p>
      </div>
    </div>
  );
}
