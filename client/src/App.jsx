
import { useEffect, useState } from 'react';

const API = 'http://localhost:5000/api/auth';

export default function App() {
  const [mode, setMode] = useState('login');
  const [user, setUser] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/me`, { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json();
        if (response.ok) setUser(data.user);
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage('');
    setLoading(true);

    try {
      const endpoint =
        mode === 'register' ? '/register' : '/login';

      const payload =
        mode === 'register'
          ? { name, email, password }
          : { email, password };

      const response = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        const validationMessage = data.errors
          ?.map((error) => error.message)
          .join(' ');

        throw new Error(validationMessage || data.message);
      }

      setUser(data.user);
      setPassword('');
      setMessage(data.message);
    } catch (error) {
      setMessage(error.message || 'Could not connect to the server.');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      const response = await fetch(`${API}/logout`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Logout failed.');

      setUser(null);
      setName('');
      setEmail('');
      setPassword('');
      setMode('login');
      setMessage('You have logged out.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-12 text-white">
      <section className="mx-auto max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <p className="text-sm font-semibold uppercase tracking-widest text-indigo-400">
          Team Task Manager
        </p>

        {user ? (
          <div className="mt-8 space-y-4">
            <h1 className="text-2xl font-bold">
              Welcome, {user.name}!
            </h1>
            <p className="text-slate-300">{user.email}</p>
            <p className="text-sm text-slate-400">
              Your account is connected to the backend.
            </p>
            <button
              onClick={handleLogout}
              className="w-full rounded-lg bg-red-600 px-4 py-3 font-semibold hover:bg-red-500"
            >
              Log out
            </button>
          </div>
        ) : (
          <>
            <h1 className="mt-5 text-3xl font-bold">
              {mode === 'register' ? 'Create account' : 'Welcome back'}
            </h1>
            <p className="mt-2 text-slate-400">
              {mode === 'register'
                ? 'Create your account to get started.'
                : 'Log in to your workspace.'}
            </p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              {mode === 'register' && (
                <label className="block text-sm">
                  Full name
                  <input
                    required
                    minLength={2}
                    maxLength={100}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 outline-none focus:border-indigo-500"
                    placeholder="Your name"
                  />
                </label>
              )}

              <label className="block text-sm">
                Email address
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 outline-none focus:border-indigo-500"
                  placeholder="you@example.com"
                />
              </label>

              <label className="block text-sm">
                Password
                <input
                  required
                  type="password"
                  minLength={8}
                  maxLength={72}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 outline-none focus:border-indigo-500"
                  placeholder="At least 8 characters"
                />
              </label>

              <button
                disabled={loading}
                className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold hover:bg-indigo-500 disabled:opacity-50"
              >
                {loading
                  ? 'Please wait...'
                  : mode === 'register'
                    ? 'Create account'
                    : 'Log in'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-400">
              {mode === 'register'
                ? 'Already have an account? '
                : "Don't have an account? "}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'register' ? 'login' : 'register');
                  setMessage('');
                }}
                className="font-semibold text-indigo-400 hover:text-indigo-300"
              >
                {mode === 'register' ? 'Log in' : 'Register'}
              </button>
            </p>
          </>
        )}

        {message && (
          <p
            role="status"
            className="mt-5 rounded-lg bg-slate-800 p-3 text-sm text-slate-200"
          >
            {message}
          </p>
        )}
      </section>
    </main>
  );
}
