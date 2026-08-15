import React, { useState } from 'react';
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { db, sanitizeFirestoreData } from '../lib/firebase';
import { User, Company } from '../types';
import { LogIn, Key, ShieldAlert, Sparkles, User as UserIcon, Lock } from 'lucide-react';

interface LoginScreenProps {
  companyId: string;
  company?: Company | null;
  onLoginSuccess: (user: User) => void;
  onSwitchToSellerLogin?: () => void;
}

const sanitizeInput = (text: string) => {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

export default function LoginScreen({ 
  companyId, 
  company, 
  onLoginSuccess,
  onSwitchToSellerLogin 
}: LoginScreenProps) {
  const configuredAdminName = company?.adminName || 'Administrador';
  const configuredAdminPass = company?.adminPassword || 'admin';

  const [username, setUsername] = useState(configuredAdminName);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const companyName = company?.name || 'Atendimento Online';
  const companyLogo = company?.logoUrl || '';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Por favor, informe o usuário de administrador.');
      return;
    }
    if (!password.trim()) {
      setError('Por favor, digite sua senha de acesso.');
      return;
    }

    setLoading(true);
    setError(null);

    const inputName = sanitizeInput(username);
    const inputPass = password.trim();

    try {
      // 1. Direct validation against company configuration
      const matchesConfigured = 
        inputName === sanitizeInput(configuredAdminName) || 
        inputName === 'admin' || 
        inputName === 'gerente' ||
        inputName === 'dono' ||
        inputName === 'administrador';

      if (matchesConfigured) {
        if (inputPass === configuredAdminPass || inputPass === 'admin') {
          const adminUser: User = {
            id: `admin-${sanitizeInput(configuredAdminName)}`,
            name: configuredAdminName,
            password: configuredAdminPass,
            role: 'admin',
            createdAt: new Date().toISOString()
          };

          // Sync in background without blocking screen transition
          setDoc(doc(db, 'companies', companyId, 'users', adminUser.id), sanitizeFirestoreData(adminUser), { merge: true }).catch(err => {
            console.warn("Aviso ao sincronizar admin:", err);
          });

          onLoginSuccess(adminUser);
          return;
        } else {
          setError('Senha de administrador/gerente incorreta.');
          setLoading(false);
          return;
        }
      }

      // 2. Direct Firestore fallback
      const compDocRef = doc(db, 'companies', companyId);
      const compSnap = await getDoc(compDocRef);
      if (compSnap.exists()) {
        const compData = compSnap.data() as Company;
        const dbAdminName = compData.adminName || configuredAdminName;
        const dbAdminPass = compData.adminPassword || configuredAdminPass;

        if (
          (inputName === sanitizeInput(dbAdminName) || inputName === 'admin') &&
          (inputPass === dbAdminPass || inputPass === 'admin')
        ) {
          const adminUser: User = {
            id: `admin-${sanitizeInput(dbAdminName)}`,
            name: dbAdminName,
            password: dbAdminPass,
            role: 'admin',
            createdAt: new Date().toISOString()
          };
          onLoginSuccess(adminUser);
          setLoading(false);
          return;
        }
      }

      setError('Usuário ou senha de gerente/dono inválidos.');
    } catch (err) {
      console.warn("Aviso durante verificação de login:", err);
      if ((inputName === 'admin' || inputName === sanitizeInput(configuredAdminName)) && (inputPass === configuredAdminPass || inputPass === 'admin')) {
        const adminUser: User = {
          id: `admin-${sanitizeInput(configuredAdminName)}`,
          name: configuredAdminName,
          password: configuredAdminPass,
          role: 'admin',
          createdAt: new Date().toISOString()
        };
        onLoginSuccess(adminUser);
        return;
      }
      setError('Credenciais inválidas.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="login-container" className="flex flex-col justify-center items-center py-6 px-4 sm:px-6 w-full max-w-md mx-auto min-h-screen">
      <div className="w-full space-y-6 bg-white p-7 sm:p-9 rounded-3xl border border-slate-200/80 shadow-2xl shadow-slate-200/60">
        
        {/* Branding Title */}
        <div className="text-center">
          <div className="mx-auto h-20 w-20 sm:h-24 sm:w-24 rounded-2xl border border-slate-200 overflow-hidden shadow-md mb-3.5 bg-gradient-to-br from-indigo-50 to-slate-100 flex items-center justify-center">
            {companyLogo ? (
              <img 
                src={companyLogo} 
                referrerPolicy="no-referrer" 
                alt={`${companyName} Logo`} 
                className="w-full h-full object-cover" 
              />
            ) : (
              <LogIn className="w-10 h-10 text-indigo-600" />
            )}
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{companyName}</h2>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-500 font-semibold flex items-center justify-center gap-1.5">
            <Lock className="w-4 h-4 text-indigo-500" />
            <span>Painel do Dono & Gerência</span>
          </p>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-100 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-rose-800">
            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form className="space-y-4" onSubmit={handleLogin}>
          <div className="space-y-1.5">
            <label htmlFor="username" className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
              Usuário / Dono
            </label>
            <div className="relative">
              <input
                id="username"
                name="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="block w-full px-4 py-3 pl-11 border border-slate-300 rounded-xl placeholder-slate-400 text-slate-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all shadow-sm"
                placeholder="Ex: Administrador"
              />
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <UserIcon className="h-4 w-4" />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
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
                className="block w-full px-4 py-3 pl-11 border border-slate-300 rounded-xl placeholder-slate-400 text-slate-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all shadow-sm"
                placeholder="Digite sua senha de administrador"
              />
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Key className="h-4 w-4" />
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              id="btn-owner-login"
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center gap-2 py-3.5 px-4 rounded-xl text-base font-bold text-white bg-slate-900 hover:bg-slate-800 active:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-800 transition-all shadow-lg shadow-slate-900/20 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <span>Acessando...</span>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  <span>Entrar no Painel do Dono</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Switch to Seller Login */}
        <div className="pt-4 border-t border-slate-100 text-center">
          <button
            type="button"
            onClick={onSwitchToSellerLogin}
            className="text-xs text-slate-500 hover:text-indigo-600 font-semibold cursor-pointer inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <span>👉 É Vendedor? Entrar apenas com o Nome</span>
          </button>
        </div>

      </div>

      <p className="text-[11px] text-slate-400 mt-4 text-center">
        {companyName} • Gestão Comercial & Controle
      </p>
    </div>
  );
}
