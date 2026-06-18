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

  // Periodically fetch registered employees to make login select options or quick selections available
  useEffect(() => {
    async function fetchUsers() {
      const larissaUser: User = {
        id: 'admin-larissa',
        name: 'Larissa',
        password: '13259898',
        role: 'admin',
        createdAt: new Date().toISOString()
      };

      // Set Larissa in available sellers first to make it immediately available
      setAvailableSellers([larissaUser]);

      // Merge with local sellers!
      const localSellersStr = localStorage.getItem('local_sellers_' + companyId);
      let localSellers: User[] = [];
      if (localSellersStr) {
        try {
          localSellers = JSON.parse(localSellersStr);
        } catch (e) {
          console.error(e);
        }
      }

      try {
        const usersRef = collection(db, 'companies', companyId, 'users');
        const snapshot = await getDocs(usersRef);
        
        let list: User[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as User);
        });

        // Silently try to synchronize Larissa to Firestore
        try {
          await setDoc(doc(db, 'companies', companyId, 'users', 'admin-larissa'), larissaUser);
        } catch (syncErr) {
          console.warn("Could not sync admin to Firestore, proceeding with local fallback:", syncErr);
        }

        // Filter out any duplicates
        let filteredList = list.filter(u => u.name.toLowerCase() !== 'larissa' && u.id !== 'admin-larissa');
        
        // Add unique local sellers to the options list
        localSellers.forEach(localU => {
          const exists = filteredList.some(u => u.id === localU.id || u.name.toLowerCase() === localU.name.toLowerCase());
          if (!exists) {
            filteredList.push(localU);
          }
        });

        filteredList.unshift(larissaUser);
        setAvailableSellers(filteredList);
      } catch (err) {
        console.warn("Aviso ao carregar usuários inicial:", err);
        // Fallback using local sellers and administrative root Larson on fetch error
        const backupList = [larissaUser];
        localSellers.forEach(localU => {
          const exists = backupList.some(u => u.id === localU.id || u.name.toLowerCase() === localU.name.toLowerCase());
          if (!exists) {
            backupList.push(localU);
          }
        });
        setAvailableSellers(backupList);
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

    // Sanitize and normalize inputs to make sure characters and case do not block login
    const sanitizeInput = (text: string) => {
      return text
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""); // removes accents and trim
    };

    const inputName = sanitizeInput(username);
    const inputPassword = sanitizeInput(password);

    // Try matching in local sellers first to render it completely robust off of permission issues
    const localSellersStr = localStorage.getItem('local_sellers_' + companyId);
    let localSellers: User[] = [];
    if (localSellersStr) {
      try {
        localSellers = JSON.parse(localSellersStr);
      } catch (e) {
        console.error(e);
      }
    }

    const localMatch = localSellers.find((u) => {
      const storedName = sanitizeInput(u.name);
      const storedPassword = u.password ? sanitizeInput(u.password) : '';
      return storedName === inputName && storedPassword === inputPassword;
    });

    if (localMatch) {
      onLoginSuccess(localMatch);
      setLoading(false);
      return;
    }

    // Direct check: Instant validation for administrator Larissa, case-insensitive
    if (inputName === 'larissa' && inputPassword === '13259898') {
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
      // Query users collection for other sellers or matches
      const usersRef = collection(db, 'companies', companyId, 'users');
      const snapshot = await getDocs(usersRef);
      let matchedUser: User | null = null;

      snapshot.forEach((docItem) => {
        const data = docItem.data();
        const storedName = sanitizeInput(String(data.name || ''));
        const storedPassword = sanitizeInput(String(data.password || ''));
        
        if (storedName === inputName && storedPassword === inputPassword) {
          matchedUser = { id: docItem.id, ...data } as User;
        }
      });

      if (matchedUser) {
        onLoginSuccess(matchedUser);
      } else {
        setError('Usuário ou senha incorretos. Verifique suas credenciais.');
      }
    } catch (err) {
      console.warn("Firestore auth error, attempting local offline matching:", err);
      // Extra fallback if Firestore is completely failing or blocked by permissions
      if (inputName === 'larissa' && inputPassword === '13259898') {
        onLoginSuccess({
          id: 'admin-larissa',
          name: 'Larissa',
          password: '13259898',
          role: 'admin',
          createdAt: new Date().toISOString()
        });
      } else {
        setError('Erro ao autenticar. Verifique sua conexão em tempo real.');
      }
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
