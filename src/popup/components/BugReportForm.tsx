
interface Props {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  onTitleChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onPriorityChange: (v: 'low' | 'medium' | 'high' | 'critical') => void;
}

const priorities = ['low', 'medium', 'high', 'critical'] as const;

export function BugReportForm({ title, description, priority, onTitleChange, onDescriptionChange, onPriorityChange }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-400 mb-1">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Brief bug description"
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white placeholder-gray-500"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Steps to reproduce, expected vs actual behavior..."
          rows={3}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white placeholder-gray-500 resize-none"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Priority</label>
        <div className="flex gap-1">
          {priorities.map((p) => (
            <button
              key={p}
              onClick={() => onPriorityChange(p)}
              className={`flex-1 py-1 text-xs rounded capitalize ${
                priority === p
                  ? p === 'critical' ? 'bg-red-600 text-white'
                  : p === 'high' ? 'bg-orange-600 text-white'
                  : p === 'medium' ? 'bg-yellow-600 text-white'
                  : 'bg-green-600 text-white'
                  : 'bg-gray-800 text-gray-400 border border-gray-700'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
