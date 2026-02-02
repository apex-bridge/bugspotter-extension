import { useEffect, useState } from 'react';
import type { Project } from '@/types';
import { fetchProjects } from '@/api/bugspotter-client';

interface Props {
  value: string;
  onChange: (id: string) => void;
}

export function ProjectSelector({ value, onChange }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProjects()
      .then((data) => {
        setProjects(data);
        if (data.length > 0 && !value) onChange(data[0].id);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [onChange, value]);

  if (loading) return <p className="text-xs text-gray-400 mb-2">Loading projects...</p>;
  if (error) return <p className="text-xs text-red-400 mb-2">{error}</p>;

  return (
    <div className="mb-3">
      <label className="block text-xs text-gray-400 mb-1">Project</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}
