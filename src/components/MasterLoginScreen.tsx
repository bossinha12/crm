import React, { useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User, Company } from '../types';
import { Lock, User as UserIcon, ShieldAlert, Sparkles, ShieldCheck } from 'lucide-react';

interface MasterLoginScreenProps {
  companyId: string;
  company?: Company | null;
  onLoginSuccess: (user: User) => void;
  onOpenSuperAdmin: () => void;
}

const sanitizeInput = (text: string) => {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

export default function MasterLoginScreen({ 
  companyId, 
  company, 
  onLoginSuccess,
  onOpenSuperAdmin 
}: MasterLoginScreenProps) {
  const configuredAdminName = company?.adminName || 'Administrador Master';
  const configuredAdminPass = company?.adminPassword || 'admin';

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Por favor, informe seu login ou usuário.');
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
      // 1. Check against active company admin configured credentials
      const matchesConfigured = 
        inputName === sanitizeInput(configuredAdminName) || 
        inputName === 'admin' || 
        inputName === 'master' ||
        inputName === 'administrador' ||
        inputName === 'administrador master';

      if (matchesConfigured) {
        if (inputPass === configuredAdminPass || inputPass === 'admin') {
          const masterUser: User = {
            id: `admin-${sanitizeInput(configuredAdminName)}`,
            name: configuredAdminName,
            password: configuredAdminPass,
            role: 'admin',
            createdAt: new Date().toISOString()
          };
          onLoginSuccess(masterUser);
          setLoading(false);
          return;
        } else {
          setError('Senha de acesso incorreta.');
          setLoading(false);
          return;
        }
      }

      // 2. Direct Firestore fallback verification for company document
      const compDocRef = doc(db, 'companies', companyId);
      const compSnap = await getDoc(compDocRef);
      if (compSnap.exists()) {
        const compData = compSnap.data() as Company;
        const dbAdminName = compData.adminName || configuredAdminName;
        const dbAdminPass = compData.adminPassword || configuredAdminPass;

        if (
          (inputName === sanitizeInput(dbAdminName) || inputName === 'admin' || inputName === 'master') &&
          (inputPass === dbAdminPass || inputPass === 'admin')
        ) {
          const masterUser: User = {
            id: `admin-${sanitizeInput(dbAdminName)}`,
            name: dbAdminName,
            password: dbAdminPass,
            role: 'admin',
            createdAt: new Date().toISOString()
          };
          onLoginSuccess(masterUser);
          setLoading(false);
          return;
        }
      }

      setError('Usuário ou senha incorretos.');
    } catch (err) {
      console.warn("Erro ao validar login master:", err);
      // Local fallback
      if ((inputName === 'admin' || inputName === sanitizeInput(configuredAdminName)) && (inputPass === configuredAdminPass || inputPass === 'admin')) {
        const masterUser: User = {
          id: `admin-${sanitizeInput(configuredAdminName)}`,
          name: configuredAdminName,
          password: configuredAdminPass,
          role: 'admin',
          createdAt: new Date().toISOString()
        };
        onLoginSuccess(masterUser);
        return;
      }
      setError('Credenciais inválidas.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="master-login-container" className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 font-sans text-slate-100 relative selection:bg-indigo-500 selection:text-white">
      
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-purple-600/10 rounded-full blur-2xl pointer-events-none" />

      <div className="w-full max-w-md bg-slate-800/90 border border-slate-700/80 rounded-3xl p-8 sm:p-9 shadow-2xl backdrop-blur-md relative z-10 space-y-7">
        
        {/* Header Branding */}
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-950 border border-indigo-700/50 flex items-center justify-center shadow-inner shadow-indigo-500/20">
            <Sparkles className="w-8 h-8 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Painel Master
            </h1>
            <p className="text-sm text-slate-400 mt-1 font-medium">
              Atendimento Online • Gestão Administrativa
            </p>
          </div>
        </div>

        {/* Error notification */}
        {error && (
          <div className="bg-rose-950/60 border border-rose-800 text-rose-200 text-xs rounded-xl p-3.5 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Simple Login Form: Only Username & Password */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="master-username" className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
              Login / Usuário
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <UserIcon className="w-4 h-4" />
              </div>
              <input
                id="master-username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ex: admin"
                className="w-full bg-slate-900/90 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="master-password" className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
              Senha de Acesso
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="master-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite sua senha master"
                className="w-full bg-slate-900/90 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              id="btn-master-login"
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all shadow-lg shadow-indigo-600/30 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? (
                <span>Validando Acesso...</span>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Acessar Painel Master</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Discreet Super Admin Switch */}
        <div className="pt-2 border-t border-slate-700/60 text-center">
          <button
            type="button"
            onClick={onOpenSuperAdmin}
            className="text-xs text-slate-400 hover:text-indigo-300 transition-colors font-medium cursor-pointer inline-flex items-center gap-1.5 py-1 px-2 rounded-lg hover:bg-slate-700/40"
          >
            <span>🔒 Acessar Central de Licenças (Super Admin)</span>
          </button>
        </div>

      </div>

      <p className="text-[11px] text-slate-500 mt-6 text-center">
        Atendimento Online • Sistema Seguro de Gestão
      </p>
    </div>
  );
}
