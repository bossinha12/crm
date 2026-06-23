import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User } from '../types';
import { LogIn, Key, Compass, ShieldAlert, Sparkles } from 'lucide-react';

interface LoginScreenProps {
  companyId: string;
  onLoginSuccess: (user: User) => void;
}

const sanitizeInput = (text: string) => {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // removes accents and trim
};

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
          console.warn("Could not sync admin to Firestore:", syncErr);
        }

        // Filter out admin-larissa copies and any 'larissa' duplicate
        let merged = list.filter(u => 
          u.name.toLowerCase() !== 'larissa' && 
          u.id !== 'admin-larissa'
        );

        merged.unshift(larissaUser);
        setAvailableSellers(merged);
      } catch (err) {
        console.warn("Aviso ao carregar usuários inicial:", err);
        setAvailableSellers([larissaUser]);
      }
    }
    fetchUsers();
  }, [companyId]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Por favor, preencha o nome do usuário.');
      return;
    }

    setLoading(true);
    setError(null);

    const inputName = sanitizeInput(username);
    const inputPassword = sanitizeInput(password);

    // Direct check: Instant validation for administrator Larissa, case-insensitive
    if (inputName === 'larissa') {
      if (inputPassword !== '13259898') {
        setError('Senha de administrador incorreta.');
        setLoading(false);
        return;
      }
      const larissaAdmin: User = {
        id: 'admin-larissa',
        name: 'Larissa',
        password: '13259898',
        role: 'admin',
        createdAt: new Date().toISOString()
      };
      
      // Sync Larissa admin user to Firestore
      try {
        await setDoc(doc(db, 'companies', companyId, 'users', 'admin-larissa'), larissaAdmin);
      } catch (syncErr) {
        console.warn("Could not sync admin:", syncErr);
      }
      
      onLoginSuccess(larissaAdmin);
      setLoading(false);
      return;
    }

    // Since the user is not Larissa, they are a seller. Sellers do not require password authentication, but must be registered!
    try {
      // 1. Try matching with currently loaded list from Firestore
      const stateMatch = availableSellers.find(u => sanitizeInput(u.name) === inputName && u.role === 'seller');
      if (stateMatch) {
        onLoginSuccess(stateMatch);
        setLoading(false);
        return;
      }

      // 2. Direct check Firestore users collection for a matching seller name
      const usersRef = collection(db, 'companies', companyId, 'users');
      const snapshot = await getDocs(usersRef);
      let matchedSearch: User | null = null;
      
      snapshot.forEach((docItem) => {
        const data = docItem.data();
        if (sanitizeInput(String(data.name || '')) === inputName && data.role === 'seller') {
          matchedSearch = { id: docItem.id, ...data } as User;
        }
      });

      if (matchedSearch) {
        onLoginSuccess(matchedSearch);
        setLoading(false);
        return;
      }

      // If they are not found in Firestore, they cannot log in.
      setError('Vendedor não cadastrado. Se você já tem cadastro, verifique a grafia do nome ou peça para a Larissa cadastrar novamente.');
    } catch (err) {
      console.error("Critical error during login verification:", err);
      setError('Erro de conexão ao verificar cadastro. Por favor, tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="login-container" className="min-h-[80vh] flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl border border-slate-100 shadow-xl shadow-slate-100 transition-all">
        
        {/* Branding Title */}
        <div className="text-center">
          <div className="mx-auto h-24 w-24 rounded-full border border-slate-150 overflow-hidden shadow-md mb-4 bg-white flex items-center justify-center">
            <img src="https://i.postimg.cc/8CdttXNK/Whats-App-Image-2026-06-10-at-14-30-14.jpg" referrerPolicy="no-referrer" alt="Larissa Móveis Logo" className="w-full h-full object-cover" />
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full px-3.5 py-2.5 pl-10 border border-slate-200 rounded-xl placeholder-slate-400 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  placeholder={username.trim().toLowerCase() === 'larissa' ? "Digite sua senha" : "Não obrigatória para vendedores"}
                />
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Key className="h-4 w-4" />
                </div>
              </div>
              
              {/* Dynamic feedback indicator for maximum clarity */}
              <p className="mt-1.5 text-[11px] font-medium leading-normal">
                {username.trim() === '' ? (
                  <span className="text-slate-400">ℹ️ Vendedores entram sem senha. Administradora precisa.</span>
                ) : username.trim().toLowerCase() === 'larissa' ? (
                  <span className="text-amber-600 font-semibold">🔒 Insira a senha da administradora Larissa.</span>
                ) : (() => {
                  const found = availableSellers.find(s => s.role === 'seller' && sanitizeInput(s.name) === sanitizeInput(username));
                  if (found) {
                    return (
                      <span className="text-emerald-600 font-semibold">🔓 Vendedor "{found.name}" reconhecido e ativo. Nenhuma senha é necessária!</span>
                    );
                  } else {
                    return (
                      <span className="text-rose-600 font-semibold">⚠️ Vendedor não cadastrado. Se você já tem cadastro, verifique a grafia do nome ou peça para a Larissa cadastrar novamente.</span>
                    );
                  }
                })()}
              </p>
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
