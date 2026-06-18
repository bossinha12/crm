import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, collection, getDocs, query, limit } from 'firebase/firestore';
import { db, testFirestoreConnection } from './lib/firebase';
import { User, Company } from './types';
import LoginScreen from './components/LoginScreen';
import ClientWidget from './components/ClientWidget';
import SellerDashboard from './components/SellerDashboard';
import MasterDashboard from './components/MasterDashboard';
import SaaSAdminDashboard from './components/SaaSAdminDashboard';
import { 
  Compass, Headphones, ShieldAlert, Sparkles, LogIn, ChevronRight, HelpCircle, Shield 
} from 'lucide-react';

export default function App() {
  const [companyId, setCompanyId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('c') || params.get('company') || params.get('id') || 'atendepro_default';
  });
  const [company, setCompany] = useState<Company | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('crm_current_user_atendepro');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Erro ao recuperar sessão:", e);
      }
    }
    return null;
  });

  // Watch for session changes to persist/remove from localStorage
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('crm_current_user_atendepro', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('crm_current_user_atendepro');
    }
  }, [currentUser]);
  
  // Views navigation selection: 'home' | 'client' | 'login' | 'saas_admin'
  // Defaults to 'client' for immediate customer chat mode
  const [currentView, setCurrentView] = useState<'home' | 'client' | 'login' | 'saas_admin'>('client');
  const [connecting, setConnecting] = useState(true);

  // Helper utility to safely navigate URL while retaining c / company / id context
  const updateViewUrl = (view: string, extraUrlStr: string = '') => {
    const params = new URLSearchParams(window.location.search);
    const existingC = params.get('c') || params.get('company') || params.get('id');
    
    const newParams = new URLSearchParams();
    newParams.set('view', view);
    if (existingC) {
      newParams.set('c', existingC);
    }
    if (extraUrlStr) {
      const extraParams = new URLSearchParams(extraUrlStr);
      extraParams.forEach((val, key) => {
        newParams.set(key, val);
      });
    }
    window.history.pushState({}, '', `?${newParams.toString()}`);
  };

  // Set dynamic browser tab title depending on active view
  useEffect(() => {
    if (currentView === 'saas_admin') {
      document.title = 'SaaS MASTER - Controle Geral';
    } else {
      document.title = `${company?.name || 'Larissa Móveis'} - Atendimento Online`;
    }
  }, [currentView, company?.name]);

  // Parse direct access via URL Query Parameters (e.g. ?view=client, ?view=login, or ?view=portal)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    if (viewParam === 'login') {
      setCurrentView('login');
    } else if (viewParam === 'portal') {
      setCurrentView('home');
    } else if (viewParam === 'admmaster') {
      setCurrentView('saas_admin');
    } else {
      // Default fallback for public customers accessing root URL
      setCurrentView('client');
    }
  }, []);

  // Initialize and validate Firestore connection on boot
  useEffect(() => {
    async function bootstrapCompany() {
      try {
        await testFirestoreConnection();
        const companyDocRef = doc(db, 'companies', companyId);
        const snapshot = await getDoc(companyDocRef);

        if (snapshot.exists()) {
          setCompany({ id: snapshot.id, ...snapshot.data() } as Company);
        } else {
          // Check if there are ANY companies in the database
          let dbHasCompanies = false;
          try {
            const tempSnap = await getDocs(query(collection(db, 'companies'), limit(1)));
            dbHasCompanies = !tempSnap.empty;
          } catch (e) {
            console.warn("Could not check other companies in db:", e);
          }

          if (!dbHasCompanies) {
            // Database is totally empty, so it's safe to auto create default metadata
            const defaultCompany: Company = {
              id: companyId,
              name: 'Larissa Móveis',
              createdAt: new Date().toISOString()
            };
            await setDoc(companyDocRef, defaultCompany);
            setCompany(defaultCompany);
          } else {
            // Not empty! This means the company was deleted explicitly. Respect that!
            setCompany(null);
          }
        }
      } catch (err) {
        // Fallback gracefully without blocking console.error
        console.warn("Utilizando fallback local para a empresa devido a restrições de permissão/conexão:", err);
        setCompany({
          id: companyId,
          name: 'Larissa Móveis',
          createdAt: new Date().toISOString()
        });
      } finally {
        setConnecting(false);
      }
    }
    bootstrapCompany();
  }, [companyId]);

  if (connecting) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent shadow-md"></div>
          <span className="text-sm font-semibold text-slate-500">Conectando ao banco de dados Firestore...</span>
        </div>
      </div>
    );
  }

  if (currentView === 'saas_admin') {
    return (
      <SaaSAdminDashboard 
        onBackToPortal={() => {
          updateViewUrl('portal');
          setCurrentView('home');
        }}
      />
    );
  }

  // If company doesn't exist and we're not inside the SaaS Admin, show a clean portal-not-found screen
  if (!company) {
    return (
      <main className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-6 text-center select-none relative font-sans leading-relaxed">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-rose-500/5 blur-3xl -z-10 pointer-events-none"></div>
        <div className="max-w-md w-full bg-slate-900 border border-slate-800/80 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="mx-auto h-16 w-16 rounded-full bg-rose-950/50 border border-rose-850 flex items-center justify-center text-rose-500">
            <ShieldAlert className="w-8 h-8 text-rose-450" />
          </div>
          <div className="space-y-3">
            <h2 className="text-xl font-extrabold text-slate-100 tracking-tight">Portal Suspenso ou Indisponível</h2>
            <div className="text-xs text-rose-200 bg-rose-950/40 border border-rose-900/45 rounded-2xl p-4 text-left leading-relaxed font-semibold">
              ⚠️ O link de acesso com ID <code className="text-amber-300 font-mono">"{companyId}"</code> não corresponde a nenhuma empresa ativa no sistema ou foi desativado definitivamente pela administração do SaaS.
            </div>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Se você for o proprietário desse ambiente, consulte a aba de gerenciamento ou entre em contato com o suporte mestre para criar, reativar ou regularizar sua assinatura.
          </p>
        </div>
      </main>
    );
  }

  // Render blocked/suspended screen if subscription/payment is missing or expired
  const isExpired = company?.expiresAt ? new Date() > new Date(company.expiresAt) : false;
  const isBlocked = company?.status === 'blocked' || isExpired;

  if (isBlocked) {
    const blockMessage = company?.status === 'blocked' 
      ? company.blockMessage 
      : "⚠️ Este portal de atendimento está temporariamente suspenso devido ao término da licença de 30 dias úteis/corridos. Entre em contato com a administração mestre do SaaS para efetuar a renovação.";

    return (
      <main className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-6 text-center select-none relative font-sans leading-relaxed">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-rose-500/5 blur-3xl -z-10 pointer-events-none"></div>
        <div className="max-w-md w-full bg-slate-900 border border-slate-800/80 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="mx-auto h-16 w-16 rounded-full bg-rose-950/50 border border-rose-850 flex items-center justify-center text-rose-500">
            <ShieldAlert className="w-8 h-8 animate-pulse text-rose-400" />
          </div>
          <div className="space-y-3">
            <h2 className="text-xl font-extrabold text-slate-100 tracking-tight">Portal Suspenso</h2>
            <div className="text-xs text-rose-200 bg-rose-950/40 border border-rose-900/45 rounded-2xl p-4 text-left leading-relaxed font-medium">
              {blockMessage || "⚠️ Este portal de atendimento está temporariamente suspenso devido a pendências de assinatura ou manutenção cadastral. Entre em contato com o suporte técnico para reestabelecer o serviço."}
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Se você for o proprietário desse ambiente, contate o atendimento para regularizar e reativar imediatamente.
          </p>
        </div>
      </main>
    );
  }

  // Render Logged-In CRM consoles
  if (currentUser) {
    // Check if license is expiring soon (<= 3 days and > 0 days)
    const hasExpiryWarning = (() => {
      if (!company?.expiresAt) return false;
      const t = new Date(company.expiresAt).getTime() - Date.now();
      const d = Math.ceil(t / (1000 * 60 * 60 * 24));
      return d > 0 && d <= 3;
    })();

    const daysLeft = company?.expiresAt 
      ? Math.ceil((new Date(company.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) 
      : 0;

    return (
      <main className="min-h-screen bg-slate-100 flex flex-col p-4 sm:p-6 lg:p-8 font-sans">
        <div className="max-w-7xl w-full mx-auto flex-1 flex flex-col select-none space-y-4">
          {hasExpiryWarning && currentUser.role === 'admin' && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4 flex items-center gap-3 shadow-md text-xs sm:text-sm animate-pulse">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 animate-bounce" />
              <div className="flex-1">
                <span className="font-extrabold block text-amber-900 text-sm">Falta pouco para expirar! ⏰</span>
                <span className="text-amber-800 font-medium text-xs block mt-0.5">
                  Restam apenas <strong className="font-bold">{daysLeft} {daysLeft === 1 ? 'dia' : 'dias'}</strong> de uso do seu painel ({company?.expiresAt ? new Date(company.expiresAt).toLocaleDateString('pt-BR') : ''}). Renove sua assinatura agora com o suporte administrativo para evitar bloqueios automáticos.
                </span>
              </div>
            </div>
          )}

          {currentUser.role === 'admin' ? (
            <MasterDashboard 
              companyId={companyId} 
              adminUser={currentUser} 
              onLogout={() => setCurrentUser(null)} 
            />
          ) : (
            <SellerDashboard 
              companyId={companyId} 
              sellerUser={currentUser} 
              onLogout={() => setCurrentUser(null)} 
            />
          )}
        </div>
      </main>
    );
  }

  // Render Independent Customer Support View
  if (currentView === 'client') {
    const params = new URLSearchParams(window.location.search);
    const hasPortalAccess = params.get('portal') === 'true';

    return (
      <main className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4 font-sans leading-relaxed">
        <ClientWidget 
          companyId={companyId} 
          companyName={company?.name || 'Larissa Móveis'} 
          onGoBack={hasPortalAccess ? () => {
            // Remove parameter on return
            updateViewUrl('portal');
            setCurrentView('home');
          } : undefined} 
        />
      </main>
    );
  }

  // Render Independent Employee Login View
  if (currentView === 'login') {
    const params = new URLSearchParams(window.location.search);
    const hasPortalAccess = params.get('portal') === 'true';

    return (
      <main className="min-h-screen bg-slate-100 flex flex-col p-4 font-sans leading-relaxed">
        {hasPortalAccess && (
          <div className="absolute top-4 left-4">
            <button
              onClick={() => {
                updateViewUrl('portal');
                setCurrentView('home');
              }}
              className="text-xs font-semibold bg-white border border-slate-200 text-slate-500 hover:text-slate-800 px-3.5 py-2 rounded-xl transition-all cursor-pointer"
            >
              ← Voltar para a Início
            </button>
          </div>
        )}
        <LoginScreen 
          companyId={companyId} 
          onLoginSuccess={(user) => setCurrentUser(user)} 
        />
      </main>
    );
  }

  // Render Dual selection selection landing page portal
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col p-4 sm:p-6 lg:p-8 font-sans items-center justify-center relative overflow-hidden">
      
      {/* Background radial soft light highlight */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[550px] h-[550px] rounded-full bg-gradient-radial from-indigo-500/5 to-transparent blur-3xl -z-10 pointer-events-none"></div>

      <div className="max-w-2xl w-full text-center space-y-10 py-12">
        
        {/* Title branding heading block */}
        <div className="space-y-4">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-indigo-600 items-center justify-center text-white shadow-xl shadow-indigo-100 mb-2">
            <Compass className="h-6 w-6" id="welcome-compass-icon" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight text-balance">
            {company?.name || 'Larissa Móveis'} <span className="text-indigo-600 block sm:inline">Atendimento Online</span>
          </h1>
          <p className="text-sm sm:text-base text-slate-500 max-w-lg mx-auto">
            Seu canal de atendimento direto. Fale conosco agora em tempo real com total praticidade e rapidez.
          </p>
        </div>

        {/* Dual navigation choices columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6" id="view-selector-grid">
          
          {/* Card 1: Customer Entrance point */}
          <button
            onClick={() => {
              updateViewUrl('client', 'portal=true');
              setCurrentView('client');
            }}
            className="text-left group relative bg-white border border-slate-200 hover:border-indigo-500 rounded-3xl p-6 shadow-xl shadow-slate-100 transition-all hover:-translate-y-1 block duration-300 cursor-pointer"
          >
            <div className="h-12 w-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4 transition-colors group-hover:bg-indigo-500 group-hover:text-white">
              <Headphones className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-1.5 transition-colors group-hover:text-indigo-600">
              <span>Falar com Vendedor</span>
              <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Clique para entrar no chat ao vivo e solicitar suporte. Não requer nenhum tipo de cadastro ou login!
            </p>
            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50/50 block rounded-full py-0.5 px-2 absolute bottom-4 right-6 group-hover:bg-indigo-150">
              CLIENTE FINAL
            </span>
          </button>

          {/* Card 2: Company Employee Area entrance point */}
          <button
            onClick={() => {
              updateViewUrl('login', 'portal=true');
              setCurrentView('login');
            }}
            className="text-left group relative bg-white border border-slate-200 hover:border-indigo-500 rounded-3xl p-6 shadow-xl shadow-slate-100 transition-all hover:-translate-y-1 block duration-300 cursor-pointer"
          >
            <div className="h-12 w-12 rounded-2xl bg-slate-900 text-slate-200 flex items-center justify-center mb-4 transition-colors group-hover:bg-indigo-500 group-hover:text-white">
              <LogIn className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-1.5 transition-colors group-hover:text-indigo-600">
              <span>Área Comercial</span>
              <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Login exclusivo para vendedores e gerente administrador. Monitore as conversas e atenda chamados.
            </p>
            <span className="text-[10px] font-bold text-slate-600 bg-slate-100 block rounded-full py-0.5 px-2 absolute bottom-4 right-6">
              VENDEDOR & DONO
            </span>
          </button>

        </div>

        {/* Informative Footer Badge and system specs */}
        <div className="text-[11px] text-slate-400 flex flex-col justify-center items-center gap-2">
          <div className="flex justify-center items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Fidelidade instantânea de conexões e sincronização em tempo real via Firestore</span>
          </div>
        </div>

      </div>

    </main>
  );
}
