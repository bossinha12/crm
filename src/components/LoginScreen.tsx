import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db, sanitizeFirestoreData } from '../lib/firebase';
import { User, Company } from '../types';
import { LogIn, Key, Compass, ShieldAlert, Sparkles } from 'lucide-react';

interface LoginScreenProps {
  companyId: string;
  company?: Company | null;
  onLoginSuccess: (user: User) => void;
}

const sanitizeInput = (text: string) => {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // removes accents and trim
};

export default function LoginScreen({ companyId, company, onLoginSuccess }: LoginScreenProps) {
  const configuredAdminName = company?.adminName || (companyId === 'atendepro_default' ? 'Larissa' : 'Administrador');
  const configuredAdminPass = company?.adminPassword || '13259898';

  const isOwnerMode = (() => {
    const params = new URLSearchParams(window.location.search);
    const r = (params.get('role') || params.get('tipo') || '').toLowerCase();
    return r === 'gerente' || r === 'dono' || r === 'admin' || r === 'master';
  })();

  const [username, setUsername] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const r = (params.get('role') || params.get('tipo') || '').toLowerCase();
    if (r === 'gerente' || r === 'dono' || r === 'admin' || r === 'master') {
      return configuredAdminName;
    }
    return '';
  });
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Synchronously initialize sellers list from cache to prevent UI pop-in / trembling
  const [availableSellers, setAvailableSellers] = useState<User[]>(() => {
    const adminUserId = `admin-${sanitizeInput(configuredAdminName)}`;
    const adminUser: User = {
      id: adminUserId,
      name: configuredAdminName,
      password: configuredAdminPass,
      role: 'admin',
      createdAt: new Date().toISOString()
    };

    const savedLocal = localStorage.getItem(`atendepro_local_users_${companyId}`) || localStorage.getItem('atendepro_local_users');
    let localUsersList: User[] = [];
    if (savedLocal) {
      try {
        localUsersList = JSON.parse(savedLocal);
      } catch (e) {}
    }

    let filtered = localUsersList.filter(u => 
      sanitizeInput(u.name) !== sanitizeInput(configuredAdminName) &&
      u.id !== adminUserId &&
      u.id !== 'admin-larissa'
    );

    filtered.unshift(adminUser);
    return filtered;
  });

  const companyName = company?.name || (companyId === 'atendepro_default' ? 'Larissa Móveis' : 'Portal de Atendimento');
  const companyLogo = company?.logoUrl || (companyId === 'atendepro_default' ? 'https://i.postimg.cc/8CdttXNK/Whats-App-Image-2026-06-10-at-14-30-14.jpg' : '');

  // Listen to registered employees in real-time to make login select options or quick selections available instantly
  useEffect(() => {
    const adminUserId = `admin-${sanitizeInput(configuredAdminName)}`;
    const adminUser: User = {
      id: adminUserId,
      name: configuredAdminName,
      password: configuredAdminPass,
      role: 'admin',
      createdAt: new Date().toISOString()
    };

    // Silently synchronize Admin to Firestore
    const syncAdmin = async () => {
      try {
        await setDoc(doc(db, 'companies', companyId, 'users', adminUserId), sanitizeFirestoreData(adminUser), { merge: true });
        if (companyId === 'atendepro_default') {
          await setDoc(doc(db, 'companies', companyId, 'users', 'admin-larissa'), sanitizeFirestoreData(adminUser), { merge: true });
        }
      } catch (syncErr) {
        console.warn("Could not sync admin to Firestore:", syncErr);
      }
    };
    syncAdmin();

    const usersRef = collection(db, 'companies', companyId, 'users');
    const unsub = onSnapshot(usersRef, (snapshot) => {
      const firestoreList: User[] = [];
      snapshot.forEach((d) => {
        firestoreList.push({ id: d.id, ...d.data() } as User);
      });

      // Load from local storage fallback
      const savedLocal = localStorage.getItem(`atendepro_local_users_${companyId}`) || localStorage.getItem('atendepro_local_users');
      let localUsersList: User[] = [];
      if (savedLocal) {
        try {
          localUsersList = JSON.parse(savedLocal);
        } catch (e) {}
      }

      // Merge and keep unique IDs
      const userMap = new Map<string, User>();
      localUsersList.forEach(u => userMap.set(u.id, u));
      firestoreList.forEach(u => userMap.set(u.id, u));

      const mergedList = Array.from(userMap.values());

      // Save sync back to localStorage
      localStorage.setItem(`atendepro_local_users_${companyId}`, JSON.stringify(mergedList));

      // Filter out admin copies
      let filtered = mergedList.filter(u => 
        sanitizeInput(u.name) !== sanitizeInput(configuredAdminName) &&
        u.id !== adminUserId &&
        u.id !== 'admin-larissa'
      );

      filtered.unshift(adminUser);
      setAvailableSellers(filtered);
    }, (error) => {
      console.warn("Aviso ao carregar usuários em tempo real, usando fallback local:", error);
      
      const savedLocal = localStorage.getItem(`atendepro_local_users_${companyId}`) || localStorage.getItem('atendepro_local_users');
      let localUsersList: User[] = [];
      if (savedLocal) {
        try {
          localUsersList = JSON.parse(savedLocal);
        } catch (e) {}
      }

      let filtered = localUsersList.filter(u => 
        sanitizeInput(u.name) !== sanitizeInput(configuredAdminName) &&
        u.id !== adminUserId &&
        u.id !== 'admin-larissa'
      );

      filtered.unshift(adminUser);
      setAvailableSellers(filtered);
    });

    return () => unsub();
  }, [companyId, configuredAdminName, configuredAdminPass]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Por favor, preencha o nome do usuário.');
      return;
    }

    setLoading(true);
    setError(null);

    const inputName = sanitizeInput(username);
    const inputPassword = password.trim();

    const isAdminLogin = 
      inputName === sanitizeInput(configuredAdminName) || 
      inputName === 'admin' || 
      (companyId === 'atendepro_default' && inputName === 'larissa');

    // Direct check: Instant validation for administrator
    if (isAdminLogin) {
      if (inputPassword !== configuredAdminPass) {
        setError('Senha de administrador incorreta.');
        setLoading(false);
        return;
      }
      const adminUserObj: User = {
        id: `admin-${sanitizeInput(configuredAdminName)}`,
        name: configuredAdminName,
        password: configuredAdminPass,
        role: 'admin',
        createdAt: new Date().toISOString()
      };
      
      try {
        await setDoc(doc(db, 'companies', companyId, 'users', adminUserObj.id), sanitizeFirestoreData(adminUserObj), { merge: true });
      } catch (syncErr) {
        console.warn("Could not sync admin:", syncErr);
      }
      
      onLoginSuccess(adminUserObj);
      setLoading(false);
      return;
    }

    // Check if the user is a registered seller in the current company
    try {
      // 1. Try matching with currently loaded list for this company (which includes merged Firestore & localStorage)
      const stateMatch = availableSellers.find(u => sanitizeInput(u.name) === inputName && u.role === 'seller');
      if (stateMatch) {
        onLoginSuccess(stateMatch);
        setLoading(false);
        return;
      }

      // 2. Fresh direct check on Firestore users collection for this company
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

      // 3. Check company-specific local storage fallback
      const savedLocal = localStorage.getItem(`atendepro_local_users_${companyId}`) || localStorage.getItem('atendepro_local_users');
      let localUsersList: User[] = [];
      if (savedLocal) {
        try {
          localUsersList = JSON.parse(savedLocal);
        } catch (e) {}
      }

      const localMatch = localUsersList.find(u => sanitizeInput(u.name) === inputName && u.role === 'seller');
      if (localMatch) {
        onLoginSuccess(localMatch);
        setLoading(false);
        return;
      }

      // 4. User is NOT registered in this company: Block access and show clear error message
      setError(`Vendedor "${username.trim()}" não encontrado nesta loja. Solicite o cadastro ao administrador.`);
      setLoading(false);
      return;

    } catch (err) {
      console.warn("Aviso durante verificação de login:", err);
      
      // If Firestore had an error, check local storage as a final fallback
      const savedLocal = localStorage.getItem(`atendepro_local_users_${companyId}`) || localStorage.getItem('atendepro_local_users');
      let localUsersList: User[] = [];
      if (savedLocal) {
        try {
          localUsersList = JSON.parse(savedLocal);
        } catch (e) {}
      }

      const localMatch = localUsersList.find(u => sanitizeInput(u.name) === inputName && u.role === 'seller');
      if (localMatch) {
        onLoginSuccess(localMatch);
        setLoading(false);
        return;
      }

      setError(`Vendedor "${username.trim()}" não encontrado. Solicite o cadastro ao administrador.`);
      setLoading(false);
      return;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="login-container" className="flex flex-col justify-center items-center py-4 sm:py-8 px-4 sm:px-6 w-full max-w-md mx-auto">
      <div className="w-full space-y-6 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-lg shadow-slate-200/50">
        
        {/* Branding Title */}
        <div className="text-center">
          <div className="mx-auto h-20 w-20 sm:h-24 sm:w-24 rounded-full border border-slate-200 overflow-hidden shadow-md mb-3 bg-slate-50 flex items-center justify-center">
            {companyLogo ? (
              <img src={companyLogo} referrerPolicy="no-referrer" alt={`${companyName} Logo`} className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl font-black text-indigo-600 tracking-tight">
                {companyName.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight">{companyName}</h2>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-500">
            {isOwnerMode 
              ? 'Atendimento Online • Acesso do Gerente / Dono da Loja'
              : 'Atendimento Online • Portal de Vendedores e Gerente'}
          </p>
        </div>

        {/* Informative credentials box removed at user request */}

        {error && (
          <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 flex items-start gap-2.5 text-xs text-rose-800">
            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        <form className="mt-6 space-y-5" onSubmit={handleLogin}>
          <div className="space-y-4">
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
                  placeholder={sanitizeInput(username) === sanitizeInput(configuredAdminName) || sanitizeInput(username) === 'larissa' || sanitizeInput(username) === 'admin' ? `Digite a senha do administrador (${configuredAdminName})` : "Não obrigatória para vendedores"}
                />
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Key className="h-4 w-4" />
                </div>
              </div>
              
              {/* Dynamic feedback indicator with stable min-height */}
              <div className="mt-1.5 min-h-[1.5rem] text-[11px] font-medium leading-normal flex items-center">
                {username.trim() === '' ? (
                  <span className="text-slate-400">ℹ️ Vendedores cadastrados entram sem senha. Administrador(a) precisa de senha.</span>
                ) : (sanitizeInput(username) === sanitizeInput(configuredAdminName) || sanitizeInput(username) === 'larissa' || sanitizeInput(username) === 'admin') ? (
                  <span className="text-amber-600 font-semibold">🔒 Insira a senha do administrador ({configuredAdminName}).</span>
                ) : (() => {
                  const found = availableSellers.find(s => s.role === 'seller' && sanitizeInput(s.name) === sanitizeInput(username));
                  if (found) {
                    return (
                      <span className="text-emerald-600 font-semibold">🔓 Vendedor "{found.name}" cadastrado e ativo. Nenhuma senha é necessária!</span>
                    );
                  } else {
                    return (
                      <span className="text-amber-700 font-medium">⚠️ Vendedor não cadastrado. É necessário que o administrador cadastre este usuário previamente.</span>
                    );
                  }
                })()}
              </div>
            </div>

          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-semibold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Validando...' : 'Entrar no CRM'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
