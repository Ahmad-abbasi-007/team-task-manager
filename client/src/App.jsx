
import { useCallback, useEffect, useState } from 'react';

const API = (
  import.meta.env.VITE_API_URL
  || (import.meta.env.DEV ? 'http://localhost:5000' : '')
).replace(/\/$/, '');

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const validationMessage = data.errors
      ?.map((item) => item.message)
      .join(' ');

    throw new Error(
      validationMessage || data.message || 'Something went wrong.'
    );
  }

  return data;
}

const initialTask = {
  title: '',
  description: '',
  priority: 'medium',
  assigned_to: '',
  due_date: '',
};

const initialEditTask = {
  title: '',
  description: '',
  status: 'todo',
  priority: 'medium',
  assigned_to: '',
  due_date: '',
};

const statusLabels = {
  todo: 'To do',
  in_progress: 'In progress',
  completed: 'Completed',
};

const priorityColors = {
  low: 'bg-sky-500/10 text-sky-300',
  medium: 'bg-amber-500/10 text-amber-300',
  high: 'bg-rose-500/10 text-rose-300',
};

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-indigo-500';

function Button({ children, className = '', ...props }) {
  return (
    <button
      {...props}
      className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label className="block space-y-2 text-sm font-medium text-slate-300">
      <span>{label}</span>
      {children}
    </label>
  );
}

function normalizeDateInput(value) {
  if (!value) return '';

  const stringValue = String(value).trim();

  if (!stringValue) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
    return stringValue;
  }

  const match = stringValue.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  const date = new Date(stringValue);

  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function dateInputValue(value) {
  return normalizeDateInput(value);
}

function dateToISOString(value) {
  if (!value) return null;

  const normalized = normalizeDateInput(value);

  if (!normalized) return null;

  const [year, month, day] = normalized.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatDueDate(value) {
  const normalized = normalizeDateInput(value);

  if (!normalized) return 'No due date';

  const [year, month, day] = normalized.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function statusesForSelect() {
  return Object.entries(statusLabels).map(([value, label]) => ({
    value,
    label,
  }));
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [mode, setMode] = useState('login');

  const [authForm, setAuthForm] = useState({
    name: '',
    email: '',
    password: '',
  });

  const [teams, setTeams] = useState([]);
  const [team, setTeam] = useState(null);
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);

  const [filter, setFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [taskSearch, setTaskSearch] = useState('');

  const [teamForm, setTeamForm] = useState({
    name: '',
    description: '',
  });

  const [memberEmail, setMemberEmail] = useState('');
  const [taskForm, setTaskForm] = useState(initialTask);

  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editTaskForm, setEditTaskForm] = useState(initialEditTask);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const clearNotice = () => {
    setMessage('');
    setError('');
  };

  const reportError = (err) => {
    setError(err.message || 'Something went wrong.');
    setMessage('');
  };

  const loadTeams = useCallback(async () => {
    const data = await api('/api/teams');
    setTeams(data.teams);

    setTeam((current) => {
      if (!data.teams.length) return null;

      return data.teams.find((item) => item.id === current?.id)
        || data.teams[0];
    });
  }, []);

  const loadTeamData = useCallback(
    async (teamId, taskStatus = 'all', taskPriority = 'all') => {
      const params = new URLSearchParams({ teamId });

      if (taskStatus !== 'all') {
        params.set('status', taskStatus);
      }

      if (taskPriority !== 'all') {
        params.set('priority', taskPriority);
      }

      const [memberData, taskData] = await Promise.all([
        api(`/api/teams/${teamId}/members`),
        api(`/api/tasks?${params.toString()}`),
      ]);

      setMembers(memberData.members);
      setTasks(taskData.tasks);
    },
    []
  );

  useEffect(() => {
    let active = true;

    api('/api/auth/me')
      .then((data) => {
        if (active) setUser(data.user);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    let active = true;

    api('/api/teams')
      .then((data) => {
        if (!active) return;

        setTeams(data.teams);

        setTeam((current) =>
          data.teams.find((item) => item.id === current?.id)
          || data.teams[0]
          || null
        );
      })
      .catch((err) => {
        if (active) reportError(err);
      });

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user || !team?.id) {
      setMembers([]);
      setTasks([]);
      return undefined;
    }

    let active = true;

    loadTeamData(team.id, filter, priorityFilter).catch((err) => {
      if (active) reportError(err);
    });

    return () => {
      active = false;
    };
  }, [user, team?.id, filter, priorityFilter, loadTeamData]);

  async function handleAuth(event) {
    event.preventDefault();
    clearNotice();
    setBusy(true);

    try {
      const registering = mode === 'register';

      const data = await api(
        registering ? '/api/auth/register' : '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify(
            registering
              ? authForm
              : {
                  email: authForm.email,
                  password: authForm.password,
                }
          ),
        }
      );

      setUser(data.user);
      setAuthForm((current) => ({ ...current, password: '' }));
      setMessage(data.message);
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    clearNotice();

    try {
      await api('/api/auth/logout', { method: 'POST' });

      setUser(null);
      setTeams([]);
      setTeam(null);
      setTasks([]);
      setMembers([]);
      setEditingTaskId(null);
      setMessage('You have logged out successfully.');
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  }

  async function createTeam(event) {
    event.preventDefault();
    if (!teamForm.name.trim()) return;

    setBusy(true);
    clearNotice();

    try {
      const data = await api('/api/teams', {
        method: 'POST',
        body: JSON.stringify(teamForm),
      });

      setTeamForm({ name: '', description: '' });
      await loadTeams();

      if (data.team?.id) {
        setTeam(data.team);
      }

      setMessage('Team created successfully.');
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  }

  async function addMember(event) {
    event.preventDefault();
    if (!team) return;

    setBusy(true);
    clearNotice();

    try {
      await api(`/api/teams/${team.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ email: memberEmail }),
      });

      setMemberEmail('');
      await loadTeamData(team.id, filter, priorityFilter);
      await loadTeams();

      setMessage('Team member added successfully.');
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(member) {
    if (!team || member.role === 'owner') return;

    if (!window.confirm(`Remove ${member.name} from this team?`)) return;

    setBusy(true);
    clearNotice();

    try {
      await api(
        `/api/teams/${team.id}/members/${member.id}`,
        { method: 'DELETE' }
      );

      await loadTeamData(team.id, filter, priorityFilter);
      await loadTeams();

      setMessage('Team member removed.');
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  }

  async function createTask(event) {
    event.preventDefault();
    if (!team) return;

    setBusy(true);
    clearNotice();

    try {
      await api('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          team_id: team.id,
          title: taskForm.title.trim(),
          description: taskForm.description,
          priority: taskForm.priority,
          assigned_to: taskForm.assigned_to || null,
          due_date: dateToISOString(taskForm.due_date),
        }),
      });

      setTaskForm(initialTask);
      await loadTeamData(team.id, filter, priorityFilter);

      setMessage('Task created successfully.');
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  }

  function startEditingTask(task) {
    setEditingTaskId(task.id);

    setEditTaskForm({
      title: task.title || '',
      description: task.description || '',
      status: task.status || 'todo',
      priority: task.priority || 'medium',
      assigned_to: task.assigned_to || '',
      due_date: dateInputValue(task.due_date),
    });

    clearNotice();
  }

  function cancelEditingTask() {
    setEditingTaskId(null);
    setEditTaskForm(initialEditTask);
  }

  async function saveTaskChanges(event, taskId) {
    event.preventDefault();

    if (!team) return;

    setBusy(true);
    clearNotice();

    try {
      await api(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editTaskForm.title.trim(),
          description: editTaskForm.description,
          status: editTaskForm.status,
          priority: editTaskForm.priority,
          assigned_to: editTaskForm.assigned_to || null,
          due_date: dateToISOString(editTaskForm.due_date),
        }),
      });

      setEditingTaskId(null);
      setEditTaskForm(initialEditTask);

      await loadTeamData(team.id, filter, priorityFilter);
      setMessage('Task updated successfully.');
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  }

  async function updateTask(taskId, changes) {
    if (!team) return;

    setBusy(true);
    clearNotice();

    try {
      await api(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
      });

      await loadTeamData(team.id, filter, priorityFilter);
      setMessage('Task status updated.');
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  }

  async function deleteTask(task) {
    if (!window.confirm(`Delete "${task.title}"?`)) return;

    setBusy(true);
    clearNotice();

    try {
      await api(`/api/tasks/${task.id}`, { method: 'DELETE' });

      if (editingTaskId === task.id) {
        cancelEditingTask();
      }

      await loadTeamData(team.id, filter, priorityFilter);
      setMessage('Task deleted successfully.');
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p className="text-slate-300">Checking your session...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-white">
        <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
          <div className="mb-8">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-xl font-black">
              T
            </div>

            <p className="text-xs font-bold uppercase tracking-[0.25em] text-indigo-400">
              Team Task Manager
            </p>

            <h1 className="mt-4 text-3xl font-bold">
              {mode === 'register' ? 'Create your account' : 'Welcome back'}
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              {mode === 'register'
                ? 'Start organizing your team and work.'
                : 'Log in to manage your team tasks.'}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {mode === 'register' && (
              <Field label="Full name">
                <input
                  className={inputClass}
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="name"
                  value={authForm.name}
                  onChange={(e) =>
                    setAuthForm({ ...authForm, name: e.target.value })
                  }
                  placeholder="Your full name"
                />
              </Field>
            )}

            <Field label="Email address">
              <input
                className={inputClass}
                required
                type="email"
                autoComplete="email"
                value={authForm.email}
                onChange={(e) =>
                  setAuthForm({ ...authForm, email: e.target.value })
                }
                placeholder="you@example.com"
              />
            </Field>

            <Field label="Password">
              <input
                className={inputClass}
                required
                type="password"
                minLength={8}
                maxLength={72}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                value={authForm.password}
                onChange={(e) =>
                  setAuthForm({ ...authForm, password: e.target.value })
                }
                placeholder="At least 8 characters"
              />
            </Field>

            <Button
              type="submit"
              disabled={busy}
              className="w-full bg-indigo-600 text-white hover:bg-indigo-500"
            >
              {busy
                ? 'Please wait...'
                : mode === 'register'
                  ? 'Create account'
                  : 'Log in'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            {mode === 'register'
              ? 'Already have an account? '
              : "Don't have an account? "}

            <button
              type="button"
              className="font-semibold text-indigo-400 hover:text-indigo-300"
              onClick={() => {
                setMode(mode === 'register' ? 'login' : 'register');
                clearNotice();
              }}
            >
              {mode === 'register' ? 'Log in' : 'Register'}
            </button>
          </p>

          {(message || error) && (
            <p
              role="status"
              className={`mt-5 rounded-lg p-3 text-sm ${
                error
                  ? 'bg-rose-500/10 text-rose-300'
                  : 'bg-emerald-500/10 text-emerald-300'
              }`}
            >
              {error || message}
            </p>
          )}
        </section>
      </main>
    );
  }

  const completedCount = tasks.filter(
    (task) => task.status === 'completed'
  ).length;

  const activeCount = tasks.filter(
    (task) => task.status === 'in_progress'
  ).length;

  const todoCount = tasks.filter(
    (task) => task.status === 'todo'
  ).length;

  const filteredTasks = tasks.filter((task) => {
    const searchTerm = taskSearch.trim().toLowerCase();

    if (!searchTerm) return true;

    const title = (task.title || '').toLowerCase();
    const description = (task.description || '').toLowerCase();

    return title.includes(searchTerm) || description.includes(searchTerm);
  });

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 font-black">
              T
            </div>

            <div>
              <p className="font-bold">Team Task Manager</p>
              <p className="text-xs text-slate-400">Workspace dashboard</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">{user.name}</p>
              <p className="text-xs text-slate-400">{user.email}</p>
            </div>

            <Button
              disabled={busy}
              onClick={handleLogout}
              className="border border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              Log out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        {(message || error) && (
          <div
            role="status"
            className={`flex items-start justify-between gap-4 rounded-xl border p-4 text-sm ${
              error
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
            }`}
          >
            <span>{error || message}</span>

            <button
              type="button"
              onClick={clearNotice}
              aria-label="Dismiss message"
            >
              ✕
            </button>
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="text-lg font-bold">Your teams</h2>

              <p className="mt-1 text-sm text-slate-400">
                Select a workspace to view its tasks.
              </p>

              <div className="mt-4 space-y-2">
                {teams.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => {
                      setTeam(item);
                      setEditingTaskId(null);
                      clearNotice();
                    }}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      team?.id === item.id
                        ? 'border-indigo-500 bg-indigo-500/10'
                        : 'border-slate-800 bg-slate-950 hover:border-slate-600'
                    }`}
                  >
                    <span className="block font-semibold">{item.name}</span>

                    <span className="mt-1 block text-xs text-slate-400">
                      {item.member_count} members · {item.role}
                    </span>
                  </button>
                ))}

                {teams.length === 0 && (
                  <p className="rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">
                    No teams yet. Create your first team below.
                  </p>
                )}
              </div>

              <form
                onSubmit={createTeam}
                className="mt-5 space-y-3 border-t border-slate-800 pt-5"
              >
                <h3 className="font-semibold">Create a team</h3>

                <Field label="Team name">
                  <input
                    className={inputClass}
                    required
                    minLength={2}
                    maxLength={100}
                    value={teamForm.name}
                    onChange={(e) =>
                      setTeamForm({ ...teamForm, name: e.target.value })
                    }
                    placeholder="e.g. Product Team"
                  />
                </Field>

                <Field label="Description">
                  <textarea
                    className={inputClass}
                    rows={2}
                    maxLength={1000}
                    value={teamForm.description}
                    onChange={(e) =>
                      setTeamForm({
                        ...teamForm,
                        description: e.target.value,
                      })
                    }
                    placeholder="What does your team do?"
                  />
                </Field>

                <Button
                  type="submit"
                  disabled={busy}
                  className="w-full bg-indigo-600 text-white hover:bg-indigo-500"
                >
                  Create team
                </Button>
              </form>
            </div>

            {team && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold">Team members</h2>
                    <p className="mt-1 text-sm text-slate-400">
                      {members.length} people in this team
                    </p>
                  </div>

                  <span className="rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-300">
                    {team.role}
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {members.map((member) => (
                    <div key={member.id} className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-bold">
                        {member.name?.charAt(0)?.toUpperCase() || '?'}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {member.name}
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          {member.email}
                        </p>
                      </div>

                      {member.role === 'owner' ? (
                        <span className="text-xs text-indigo-300">Owner</span>
                      ) : team.role === 'owner' ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => removeMember(member)}
                          className="text-xs text-rose-300 hover:text-rose-200"
                        >
                          Remove
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">Member</span>
                      )}
                    </div>
                  ))}
                </div>

                {team.role === 'owner' && (
                  <form
                    onSubmit={addMember}
                    className="mt-5 space-y-3 border-t border-slate-800 pt-5"
                  >
                    <Field label="Add registered user by email">
                      <input
                        className={inputClass}
                        required
                        type="email"
                        value={memberEmail}
                        onChange={(e) => setMemberEmail(e.target.value)}
                        placeholder="teammate@example.com"
                      />
                    </Field>

                    <Button
                      type="submit"
                      disabled={busy}
                      className="w-full border border-slate-700 hover:bg-slate-800"
                    >
                      Add member
                    </Button>
                  </form>
                )}
              </div>
            )}
          </aside>

          <section className="min-w-0 space-y-6">
            <div>
              <p className="text-sm font-medium text-indigo-400">
                WORKSPACE OVERVIEW
              </p>

              <h1 className="mt-2 text-3xl font-bold tracking-tight">
                {team?.name || 'Welcome to your workspace'}
              </h1>

              <p className="mt-2 text-sm text-slate-400">
                {team?.description || 'Create a team to start organizing work.'}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                { label: 'To do', count: todoCount, color: 'text-sky-300' },
                {
                  label: 'In progress',
                  count: activeCount,
                  color: 'text-amber-300',
                },
                {
                  label: 'Completed',
                  count: completedCount,
                  color: 'text-emerald-300',
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
                >
                  <p className="text-sm text-slate-400">{stat.label}</p>
                  <p className={`mt-3 text-3xl font-bold ${stat.color}`}>
                    {stat.count}
                  </p>
                </div>
              ))}
            </div>

            {team ? (
              <>
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
                  <h2 className="text-lg font-bold">Create a task</h2>

                  <p className="mt-1 text-sm text-slate-400">
                    Assign work and set a priority and due date.
                  </p>

                  <form
                    onSubmit={createTask}
                    className="mt-5 grid gap-4 sm:grid-cols-2"
                  >
                    <div className="sm:col-span-2">
                      <Field label="Task title">
                        <input
                          className={inputClass}
                          required
                          minLength={2}
                          maxLength={200}
                          value={taskForm.title}
                          onChange={(e) =>
                            setTaskForm({ ...taskForm, title: e.target.value })
                          }
                          placeholder="e.g. Build dashboard UI"
                        />
                      </Field>
                    </div>

                    <div className="sm:col-span-2">
                      <Field label="Description">
                        <textarea
                          className={inputClass}
                          rows={3}
                          maxLength={5000}
                          value={taskForm.description}
                          onChange={(e) =>
                            setTaskForm({
                              ...taskForm,
                              description: e.target.value,
                            })
                          }
                          placeholder="Task details and requirements..."
                        />
                      </Field>
                    </div>

                    <Field label="Priority">
                      <select
                        className={inputClass}
                        value={taskForm.priority}
                        onChange={(e) =>
                          setTaskForm({
                            ...taskForm,
                            priority: e.target.value,
                          })
                        }
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </Field>

                    <Field label="Assign to">
                      <select
                        className={inputClass}
                        value={taskForm.assigned_to}
                        onChange={(e) =>
                          setTaskForm({
                            ...taskForm,
                            assigned_to: e.target.value,
                          })
                        }
                      >
                        <option value="">Unassigned</option>
                        {members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Due date">
                      <input
                        className={inputClass}
                        type="date"
                        value={taskForm.due_date}
                        onChange={(e) =>
                          setTaskForm({
                            ...taskForm,
                            due_date: e.target.value,
                          })
                        }
                      />
                    </Field>

                    <div className="flex items-end">
                      <Button
                        type="submit"
                        disabled={busy}
                        className="w-full bg-indigo-600 text-white hover:bg-indigo-500"
                      >
                        Create task
                      </Button>
                    </div>
                  </form>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
                  <div className="flex flex-col justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold">Tasks</h2>
                      <p className="mt-1 text-sm text-slate-400">
                        Search tasks by status and priority, then edit them.
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Search tasks">
                        <input
                          className={inputClass}
                          value={taskSearch}
                          onChange={(e) => setTaskSearch(e.target.value)}
                          placeholder="Search titles or descriptions"
                        />
                      </Field>

                      <Field label="Filter by status">
                        <select
                          className={inputClass}
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                        >
                          <option value="all">All statuses</option>
                          <option value="todo">To do</option>
                          <option value="in_progress">In progress</option>
                          <option value="completed">Completed</option>
                        </select>
                      </Field>

                      <Field label="Filter by priority">
                        <select
                          className={inputClass}
                          value={priorityFilter}
                          onChange={(e) => setPriorityFilter(e.target.value)}
                        >
                          <option value="all">All priorities</option>
                          <option value="low">Low priority</option>
                          <option value="medium">Medium priority</option>
                          <option value="high">High priority</option>
                        </select>
                      </Field>
                    </div>
                  </div>

                  <div className="mt-5 space-y-4">
                    {filteredTasks.map((task) => (
                      <article
                        key={task.id}
                        className="rounded-xl border border-slate-800 bg-slate-950 p-4 sm:p-5"
                      >
                        {editingTaskId === task.id ? (
                          <form
                            onSubmit={(event) =>
                              saveTaskChanges(event, task.id)
                            }
                            className="space-y-4"
                          >
                            <h3 className="font-semibold">Edit task</h3>

                            <Field label="Task title">
                              <input
                                className={inputClass}
                                required
                                minLength={2}
                                maxLength={200}
                                value={editTaskForm.title}
                                onChange={(e) =>
                                  setEditTaskForm({
                                    ...editTaskForm,
                                    title: e.target.value,
                                  })
                                }
                              />
                            </Field>

                            <Field label="Description">
                              <textarea
                                className={inputClass}
                                rows={3}
                                maxLength={5000}
                                value={editTaskForm.description}
                                onChange={(e) =>
                                  setEditTaskForm({
                                    ...editTaskForm,
                                    description: e.target.value,
                                  })
                                }
                              />
                            </Field>

                            <div className="grid gap-4 sm:grid-cols-2">
                              <Field label="Status">
                                <select
                                  className={inputClass}
                                  value={editTaskForm.status}
                                  onChange={(e) =>
                                    setEditTaskForm({
                                      ...editTaskForm,
                                      status: e.target.value,
                                    })
                                  }
                                >
                                  {statusesForSelect().map((status) => (
                                    <option
                                      key={status.value}
                                      value={status.value}
                                    >
                                      {status.label}
                                    </option>
                                  ))}
                                </select>
                              </Field>

                              <Field label="Priority">
                                <select
                                  className={inputClass}
                                  value={editTaskForm.priority}
                                  onChange={(e) =>
                                    setEditTaskForm({
                                      ...editTaskForm,
                                      priority: e.target.value,
                                    })
                                  }
                                >
                                  <option value="low">Low</option>
                                  <option value="medium">Medium</option>
                                  <option value="high">High</option>
                                </select>
                              </Field>

                              <Field label="Assign to">
                                <select
                                  className={inputClass}
                                  value={editTaskForm.assigned_to}
                                  onChange={(e) =>
                                    setEditTaskForm({
                                      ...editTaskForm,
                                      assigned_to: e.target.value,
                                    })
                                  }
                                >
                                  <option value="">Unassigned</option>
                                  {members.map((member) => (
                                    <option key={member.id} value={member.id}>
                                      {member.name}
                                    </option>
                                  ))}
                                </select>
                              </Field>

                              <Field label="Due date">
                                <input
                                  className={inputClass}
                                  type="date"
                                  value={editTaskForm.due_date}
                                  onChange={(e) =>
                                    setEditTaskForm({
                                      ...editTaskForm,
                                      due_date: e.target.value,
                                    })
                                  }
                                />
                              </Field>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="submit"
                                disabled={busy}
                                className="bg-indigo-600 text-white hover:bg-indigo-500"
                              >
                                Save changes
                              </Button>

                              <Button
                                type="button"
                                disabled={busy}
                                onClick={cancelEditingTask}
                                className="border border-slate-700 hover:bg-slate-800"
                              >
                                Cancel
                              </Button>
                            </div>
                          </form>
                        ) : (
                          <div className="flex flex-col justify-between gap-4 sm:flex-row">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-semibold">{task.title}</h3>

                                <span
                                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                    priorityColors[task.priority]
                                    || priorityColors.medium
                                  }`}
                                >
                                  {task.priority}
                                </span>

                                <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">
                                  {statusLabels[task.status] || task.status}
                                </span>
                              </div>

                              {task.description && (
                                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-400">
                                  {task.description}
                                </p>
                              )}

                              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-400">
                                <span>
                                  Assigned: {task.assigned_to_name || 'Unassigned'}
                                </span>

                                {task.due_date && (
                                  <span>Due: {formatDueDate(task.due_date)}</span>
                                )}

                                {task.created_by_name && (
                                  <span>Created by: {task.created_by_name}</span>
                                )}
                              </div>
                            </div>

                            <div className="flex shrink-0 flex-col gap-2 sm:w-44">
                              <label className="text-xs text-slate-400">
                                Update status
                              </label>

                              <select
                                className={inputClass}
                                value={task.status}
                                disabled={busy}
                                onChange={(e) =>
                                  updateTask(task.id, {
                                    status: e.target.value,
                                  })
                                }
                              >
                                {statusesForSelect().map((status) => (
                                  <option
                                    key={status.value}
                                    value={status.value}
                                  >
                                    {status.label}
                                  </option>
                                ))}
                              </select>

                              <Button
                                disabled={busy}
                                onClick={() => startEditingTask(task)}
                                className="border border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/10"
                              >
                                Edit task
                              </Button>

                              <Button
                                disabled={busy}
                                onClick={() => deleteTask(task)}
                                className="border border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
                              >
                                Delete task
                              </Button>
                            </div>
                          </div>
                        )}
                      </article>
                    ))}

                    {filteredTasks.length === 0 && (
                      <div className="rounded-xl border border-dashed border-slate-700 px-5 py-12 text-center">
                        <p className="font-semibold">No tasks found</p>
                        <p className="mt-2 text-sm text-slate-400">
                          {taskSearch.trim()
                            ? 'No tasks match your search. Try a different keyword.'
                            : 'Create a task or change the filters.'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-700 p-12 text-center">
                <h2 className="text-xl font-bold">Create your first team</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Use the form on the left to get started.
                </p>
              </div>
            )}
          </section>
        </section>

        <footer className="border-t border-slate-800 py-5 text-center text-xs text-slate-500">
          Team Task Manager · Built with React, Express and PostgreSQL
        </footer>
      </div>
    </main>
  );
}
