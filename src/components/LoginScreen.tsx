import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User } from '../types';
import { LogIn, Key, Compass, ShieldAlert, Sparkles } from 'lucide-react';

interface LoginScreenProps {
  companyId: string;
  onLoginSuccess: (user: User) => void;
}

export default function LoginScreen({ companyId, onLoginSuccess }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableSellers, setAvailableSellers] = useState<User[]>([]);

  // Fetch registered employees to make login select options or quick selections available
  useEffect(() => {
    async function fetchUsers() {
      const larissaUser: User = {
        id: 'admin-larissa',
        name: 'Larissa',
        password: '13259898',
        role: 'admin',
        createdAt: new Date().toISOString()
      };

      try {
        const usersRef = collection(db, 'companies', companyId, 'users');
        const snapshot = await getDocs(usersRef);
        
        let list: User[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as User);
        });

        // Ensure Larissa exists in the database
        const hasLarissa = list.some(u => u.id === 'admin-larissa' || u.name.toLowerCase() === 'larissa');
        if (!hasLarissa) {
          try {
            await setDoc(doc(db, 'companies', companyId, 'users', 'admin-larissa'), larissaUser);
            list.push(larissaUser);
          } catch (syncErr) {
            console.warn("Could not sync admin to Firestore, using local fallback:", syncErr);
          }
        }

        // Clean duplicates and format results
        let filteredList = list.filter(u => u.id !== 'admin-larissa' && u.name.toLowerCase() !== 'larissa');
        filteredList.unshift(larissaUser);
        setAvailableSellers(filteredList);
      } catch (err) {
        console.warn("Aviso ao carregar usuários inicial:", err);
        setAvailableSellers([larissaUser]);
      }
    }
    fetchUsers();
  }, [companyId]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    setLoading(true);
    setError(null);

    // Normalize Username (case-insensitive & trim)
    const normalizedInputName = username.trim().toLowerCase();
    
    // KEEP PASSWORD CASE-SENSITIVE & EXACT! Trim any extra whitespaces from inputs
    const inputPassword = password.trim();

    // Direct check: Instant validation for administrator Larissa
    if (normalizedInputName === 'larissa' && inputPassword === '13259898') {
      const larissaAdmin: User = {
        id: 'admin-larissa',
        name: 'Larissa',
        password: '13259898',
        role: 'admin',
        createdAt: new Date().toISOString()
      };
      onLoginSuccess(larissaAdmin);
      setLoading(false);
      return;
    }

    try {
      // Query users collection directly from Firestore for real-time authentication
      const usersRef = collection(db, 'companies', companyId, 'users');
      const snapshot = await getDocs(usersRef);
      let matchedUser: User | null = null;

      snapshot.forEach((docItem) => {
        const data = docItem.data();
        const storedName = String(data.name || '').trim().toLowerCase();
        
        // Exact matching password to avoid bugs with case and accents mangling
        const storedPassword = String(data.password || '').trim();
        
        if (storedName === normalizedInputName && storedPassword === inputPassword) {
          matchedUser = { id: docItem.id, ...data } as User;
        }
      });

      if (matchedUser) {
        onLoginSuccess(matchedUser);
      } else {
        setError('Usuário ou senha incorretos. Verifique suas credenciais.');
      }
    } catch (err) {
      console.warn("Firestore auth error:", err);
      setError('Erro ao se conectar ao banco de dados Firestore. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="login-container" className="min-h-[80vh] flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl border border-slate-100 shadow-xl shadow-slate-100 transition-all">
        
        {/* Branding Title */}
        <div className="text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100 mb-4 animate-pulse">
            <Compass className="h-6 w-6" id="brand-compass-icon" />
          </div>
          <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">Larissa Móveis</h2>
          <p className="mt-2 text-sm text-slate-500">
            Atendimento Online • Portal de Vendedores e Gerente
          </p>
        </div>

        {/* Informative credentials box removed at user request */}

        {error && (
          <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 flex items-start gap-2.5 text-xs text-rose-800">
            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="space-y-4">
            
            {/* Direct selector for registered salesmen if any, helper */}
            {availableSellers.length > 1 && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Vendedores Cadastrados (Atalhos)
                </label>
                <select
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  defaultValue=""
                >
                  <option value="">-- Selecione ou digite manualmente --</option>
                  {availableSellers.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name} ({s.role === 'admin' ? 'Master' : 'Vendedor'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="username" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Nome do Usuário
              </label>
              <div className="relative">
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full px-3.5 py-2.5 pl-10 border border-slate-200 rounded-xl placeholder-slate-400 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  placeholder="Ex: Gerente Administrador"
                />
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <LogIn className="h-4 w-4" />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Senha de Acesso
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full px-3.5 py-2.5 pl-10 border border-slate-200 rounded-xl placeholder-slate-400 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  placeholder="••••••••"
                />
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Key className="h-4 w-4" />
                </div>
              </div>
            </div>

          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-semibold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors disabled:opacity-50"
            >
              {loading ? 'Validando...' : 'Entrar no CRM'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
