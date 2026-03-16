export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950 text-white relative overflow-hidden">
      {/* Background glow effects */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-blue-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-purple-600/8 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-6 py-20">
        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-xs text-blue-400 font-medium mb-8 backdrop-blur-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Live on Telegram
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-4">
            odo<span className="text-blue-400">ai</span>
          </h1>
          <p className="text-gray-400 text-lg max-w-md mx-auto leading-relaxed">
            Add me to your group chat. I listen, build context, track your plans, and help when you need me.
          </p>
        </div>

        {/* Feature grid */}
        <div className="grid sm:grid-cols-2 gap-3 mb-14">
          <Card
            icon="👁"
            title="Passive Mode"
            desc="Silently observe the chat, building context about your team, projects, and plans."
          />
          <Card
            icon="🟢"
            title="Active Mode"
            desc="Give me a job and I become an active collaborator — checking in, pushing progress."
          />
          <Card
            icon="📋"
            title="Task Tracking"
            desc="todo → upcoming → done. Track it all and optimize your plan with AI."
          />
          <Card
            icon="🧠"
            title="Context Dumps"
            desc="Dump info into chat. I extract tasks, people, intentions, and index everything."
          />
          <Card
            icon="📚"
            title="QMD Memory"
            desc="Hybrid BM25 + vector + reranking search. Use /recall to query my memory."
          />
          <Card
            icon="🔍"
            title="Web Search"
            desc="Search the web via Tavily when you need real-time information."
          />
          <Card
            icon="👥"
            title="People Intelligence"
            desc="Learn who's in the chat — roles, intentions, and relationships."
            className="sm:col-span-2"
          />
        </div>

        {/* Commands */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 backdrop-blur-sm p-6 mb-14">
          <h2 className="text-[11px] uppercase tracking-[0.15em] text-gray-500 font-semibold mb-4">
            Commands
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5 font-mono text-[13px]">
            <Cmd name="/add" arg="task" />
            <Cmd name="/upcoming" arg="task" />
            <Cmd name="/done" arg="task" />
            <Cmd name="/tasks" />
            <Cmd name="/optimize" />
            <Cmd name="/dump" arg="info" />
            <Cmd name="/recall" arg="query" />
            <Cmd name="/search" arg="query" />
            <Cmd name="/people" />
            <Cmd name="/active" arg="job" />
            <Cmd name="/passive" />
            <Cmd name="/status" />
            <Cmd name="/share" arg="title | content" />
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <a
            href="https://t.me/odoai_bot"
            className="group inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 transition-all duration-200 px-7 py-3.5 rounded-xl font-medium text-[15px] shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 hover:-translate-y-0.5"
          >
            Add to Telegram
            <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
          </a>
          <p className="text-gray-600 text-xs mt-4">Free to use · Works in group chats</p>
        </div>
      </div>
    </div>
  );
}

function Card({
  icon,
  title,
  desc,
  className = "",
}: {
  icon: string;
  title: string;
  desc: string;
  className?: string;
}) {
  return (
    <div
      className={`group rounded-xl border border-gray-800 bg-gray-900/40 p-4 transition-all duration-200 hover:border-gray-700 hover:bg-gray-900/70 ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="text-lg shrink-0 mt-0.5">{icon}</span>
        <div>
          <div className="font-semibold text-sm text-gray-100 mb-1">{title}</div>
          <div className="text-gray-500 text-[13px] leading-relaxed">{desc}</div>
        </div>
      </div>
    </div>
  );
}

function Cmd({ name, arg }: { name: string; arg?: string }) {
  return (
    <div className="text-gray-400 transition-colors hover:text-gray-200">
      <span className="text-blue-400">{name}</span>
      {arg && <span className="text-gray-600"> {arg}</span>}
    </div>
  );
}
