import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db, sanitizeFirestoreData } from '../lib/firebase';
import { User, Company } from '../types';
import { getOrCreateDeviceId, getDeviceDescription } from '../lib/deviceId';
import { LogIn, ShieldAlert, Sparkles, Smartphone, CheckCircle, Lock, User as UserIcon } from 'lucide-react';

interface SellerLoginScreenProps {
  companyId: string;
  company?: Company | null;
  onLoginSuccess: (user: User) => void;
  onSwitchToOwnerLogin?: () => void;
}

const sanitizeInput = (text: string) => {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

export default function SellerLoginScreen({ 
  companyId, 
  company, 
  onLoginSuccess,
  onSwitchToOwnerLogin 
}: SellerLoginScreenProps) {
  const [sellerName, setSellerName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [availableSellers, setAvailableSellers] = useState<User[]>([]);

  const companyName = company?.name || 'Atendimento Online';
  const companyLogo = company?.logoUrl || '';

  // Listen to registered sellers in real-time
  useEffect(() => {
    const usersRef = collection(db, 'companies', companyId, 'users');
    const unsub = onSnapshot(usersRef, (snapshot) => {
      const list: User[] = [];
      snapshot.forEach((d) => {
        const u = { id: d.id, ...d.data() } as User;
        if (u.role === 'seller') {
          list.push(u);
        }
      });

      // Load local storage fallback
      const savedLocal = localStorage.getItem(`atendepro_local_users_${companyId}`) || localStorage.getItem('atendepro_local_users');
      if (savedLocal) {
        try {
          const localList: User[] = JSON.parse(savedLocal);
          localList.forEach(localU => {
            if (localU.role === 'seller' && !list.some(item => item.id === localU.id)) {
              list.push(localU);
            }
          });
        } catch (e) {}
      }

      setAvailableSellers(list);
    }, (err) => {
      console.warn("Aviso ao carregar vendedores em tempo real:", err);
      const savedLocal = localStorage.getItem(`atendepro_local_users_${companyId}`) || localStorage.getItem('atendepro_local_users');
      if (savedLocal) {
        try {
          const localList: User[] = JSON.parse(savedLocal);
          setAvailableSellers(localList.filter(u => u.role === 'seller'));
        } catch (e) {}
      }
    });

    return () => unsub();
  }, [companyId]);

  const handleSellerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const inputName = sellerName.trim();
    if (!inputName) {
      setError('Por favor, digite seu nome de vendedor.');
      return;
    }

    setLoading(true);
    setError(null);
    setDeviceError(null);

    const sanitized = sanitizeInput(inputName);
    const currentDeviceId = getOrCreateDeviceId();
    const currentDeviceName = getDeviceDescription();

    try {
      // 1. Check in loaded sellers state or fetch directly from Firestore
      let targetSeller: User | undefined = availableSellers.find(s => sanitizeInput(s.name) === sanitized);

      if (!targetSeller) {
        const usersRef = collection(db, 'companies', companyId, 'users');
        const snap = await getDocs(usersRef);
        snap.forEach((d) => {
          const u = { id: d.id, ...d.data() } as User;
          if (u.role === 'seller' && sanitizeInput(u.name) === sanitized) {
            targetSeller = u;
          }
        });
      }

      // 2. Fallback check in local storage
      if (!targetSeller) {
        const savedLocal = localStorage.getItem(`atendepro_local_users_${companyId}`) || localStorage.getItem('atendepro_local_users');
        if (savedLocal) {
          try {
            const localList: User[] = JSON.parse(savedLocal);
            targetSeller = localList.find(u => u.role === 'seller' && sanitizeInput(u.name) === sanitized);
          } catch (e) {}
        }
      }

      // If seller not found in this company
      if (!targetSeller) {
        setError(`Vendedor "${inputName}" não encontrado nesta loja. Verifique a grafia ou solicite seu cadastro ao dono/gerente.`);
        setLoading(false);
        return;
      }

      // 3. DEVICE LOCK VERIFICATION
      if (targetSeller.deviceId && targetSeller.deviceId !== currentDeviceId) {
        // Locked to another device!
        setDeviceError(
          `🚫 Acesso Bloqueado neste Aparelho!\n` +
          `O vendedor "${targetSeller.name}" já está vinculado a outro celular/dispositivo (${targetSeller.lastDeviceName || 'Outro Aparelho'}).\n\n` +
          `Para acessar por este novo aparelho, solicite ao Dono ou Gerente para clicar no botão "🔄 Resetar Aparelho" no painel gerencial.`
        );
        setLoading(false);
        return;
      }

      // 4. If device not locked yet, register current device signature
      if (!targetSeller.deviceId) {
        const updatedSellerData: Partial<User> = {
          deviceId: currentDeviceId,
          deviceRegisteredAt: new Date().toISOString(),
          lastDeviceName: currentDeviceName
        };

        try {
          await setDoc(doc(db, 'companies', companyId, 'users', targetSeller.id), sanitizeFirestoreData(updatedSellerData), { merge: true });
        } catch (dbErr) {
          console.warn("Aviso ao vincular dispositivo no Firestore:", dbErr);
        }

        // Update local seller record
        targetSeller = {
          ...targetSeller,
          ...updatedSellerData
        };

        const savedLocal = localStorage.getItem(`atendepro_local_users_${companyId}`) || localStorage.getItem('atendepro_local_users');
        if (savedLocal) {
          try {
            let localList: User[] = JSON.parse(savedLocal);
            localList = localList.map(u => u.id === targetSeller!.id ? targetSeller! : u);
            localStorage.setItem(`atendepro_local_users_${companyId}`, JSON.stringify(localList));
          } catch (e) {}
        }
      }

      // Login success!
      onLoginSuccess(targetSeller);

    } catch (err) {
      console.error("Erro durante login do vendedor:", err);
      setError('Ocorreu um erro ao processar o login. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="seller-login-container" className="flex flex-col justify-center items-center py-6 px-4 sm:px-6 w-full max-w-md mx-auto min-h-screen">
      <div className="w-full space-y-6 bg-white p-7 sm:p-9 rounded-3xl border border-slate-200/80 shadow-2xl shadow-slate-200/60">
        
        {/* Company Header Branding */}
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
          
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {companyName}
          </h2>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-500 font-semibold flex items-center justify-center gap-1.5">
            <Smartphone className="w-4 h-4 text-indigo-500" />
            <span>Acesso do Vendedor • Atendimento ao Vivo</span>
          </p>
        </div>

        {/* Device Lock Alert */}
        {deviceError && (
          <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4 space-y-2 text-rose-900 shadow-sm animate-shake">
            <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
              <ShieldAlert className="w-5 h-5 shrink-0 text-rose-600" />
              <span>Aparelho Não Autorizado</span>
            </div>
            <p className="text-xs text-rose-800 whitespace-pre-line leading-relaxed">
              {deviceError}
            </p>
          </div>
        )}

        {/* General Error Notification */}
        {error && !deviceError && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-amber-900">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Simple Form: Name Input + Enter Button */}
        <form className="space-y-4" onSubmit={handleSellerLogin}>
          <div className="space-y-1.5">
            <label htmlFor="seller-name-input" className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
              Digite seu Nome
            </label>
            <div className="relative">
              <input
                id="seller-name-input"
                name="sellerName"
                type="text"
                required
                autoFocus
                value={sellerName}
                onChange={(e) => setSellerName(e.target.value)}
                className="block w-full px-4 py-3 pl-11 border border-slate-300 rounded-xl placeholder-slate-400 text-slate-900 text-base font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600 transition-all shadow-sm"
                placeholder="Ex: Pedro, Maria, Carlos..."
              />
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <UserIcon className="h-5 w-5" />
              </div>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              🔒 Vinculado a este aparelho para sua segurança (sem necessidade de senha).
            </p>
          </div>

          <div className="pt-2">
            <button
              id="btn-seller-enter"
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center gap-2 py-3.5 px-4 rounded-xl text-base font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all shadow-lg shadow-indigo-600/30 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <span>Conectando...</span>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  <span>Entrar no Atendimento</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Switch to Owner/Gerente Login */}
        <div className="pt-4 border-t border-slate-100 text-center">
          <button
            type="button"
            onClick={onSwitchToOwnerLogin}
            className="text-xs text-slate-500 hover:text-indigo-600 font-semibold cursor-pointer inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>É o Dono ou Gerente? Entrar com Senha</span>
          </button>
        </div>

      </div>

      <p className="text-[11px] text-slate-400 mt-4 text-center">
        {companyName} • Atendimento Online Seguro
      </p>
    </div>
  );
}
