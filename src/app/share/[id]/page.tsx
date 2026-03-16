import { connectDB } from "@/lib/mongodb";
import SharedLink from "@/models/SharedLink";
import Task from "@/models/Task";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SharePage({ params }: Props) {
  const { id } = await params;
  await connectDB();

  const link = await SharedLink.findOne({ linkId: id }).lean();
  if (!link) notFound();

  const tasks = await Task.find({ telegramChatId: link.telegramChatId })
    .sort({ createdAt: -1 })
    .lean();

  const grouped = {
    todo: tasks.filter((t) => t.status === "todo"),
    upcoming: tasks.filter((t) => t.status === "upcoming"),
    done: tasks.filter((t) => t.status === "done"),
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="mb-2 text-sm text-gray-500 font-mono">odoai</div>
        <h1 className="text-3xl font-bold mb-2">{link.title}</h1>
        <p className="text-sm text-gray-400 mb-8">
          Shared by @{link.createdByUsername || "unknown"} •{" "}
          {new Date(link.createdAt).toLocaleDateString()}
        </p>

        <div className="bg-gray-800/50 rounded-xl p-6 mb-10 border border-gray-700/50">
          <div className="prose prose-invert max-w-none whitespace-pre-wrap text-gray-200">
            {link.content}
          </div>
        </div>

        {tasks.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-6">Group Tasks</h2>
            <div className="grid gap-6 md:grid-cols-3">
              <TaskColumn title="Todo" emoji="📝" tasks={grouped.todo} color="blue" />
              <TaskColumn title="Upcoming" emoji="📋" tasks={grouped.upcoming} color="yellow" />
              <TaskColumn title="Done" emoji="✅" tasks={grouped.done} color="green" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TaskColumn({
  title,
  emoji,
  tasks,
  color,
}: {
  title: string;
  emoji: string;
  tasks: Array<{ _id: unknown; title: string; createdByUsername?: string }>;
  color: string;
}) {
  const borderColors: Record<string, string> = {
    blue: "border-blue-500/30",
    yellow: "border-yellow-500/30",
    green: "border-green-500/30",
  };

  const bgColors: Record<string, string> = {
    blue: "bg-blue-500/5",
    yellow: "bg-yellow-500/5",
    green: "bg-green-500/5",
  };

  return (
    <div className={`rounded-xl border ${borderColors[color]} ${bgColors[color]} p-4`}>
      <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider text-gray-400">
        {emoji} {title} ({tasks.length})
      </h3>
      <div className="space-y-2">
        {tasks.map((t) => (
          <div key={String(t._id)} className="bg-gray-800/60 rounded-lg p-3 text-sm">
            <div className="font-medium">{t.title}</div>
            {t.createdByUsername && (
              <div className="text-xs text-gray-500 mt-1">@{t.createdByUsername}</div>
            )}
          </div>
        ))}
        {tasks.length === 0 && <p className="text-sm text-gray-600 italic">No items</p>}
      </div>
    </div>
  );
}
