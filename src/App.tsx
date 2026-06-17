import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, testFirestoreConnection } from './lib/firebase';
import { User, Company } from './types';
import LoginScreen from './components/LoginScreen';
import ClientWidget from './components/ClientWidget';
import SellerDashboard from './components/SellerDashboard';
import MasterDashboard from './components/MasterDashboard';
import { 
  Compass, Headphones, ShieldAlert, Sparkles, LogIn, ChevronRight, HelpCircle 
} from 'lucide-react';

export default function App() {
  const [companyId] = useState('atendepro_default');
  const [company, setCompany] = useState<Company | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  // Views navigation selection: 'home' | 'client' | 'login'
  const [currentView, setCurrentView] = useState<'home' | 'client' | 'login'>('home');
  const [connecting, setConnecting] = useState(true);

  // Parse direct access via URL Query Parameters (e.g. ?view=client or ?view=login)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    if (viewParam === 'client') {
      setCurrentView('client');
    } else if (viewParam === 'login') {
      setCurrentView('login');
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
          // Auto create default shop metadata if missing
          const defaultCompany: Company = {
            id: companyId,
            name: 'AtendePro CRM Comercial',
            createdAt: new Date().toISOString()
          };
          await setDoc(companyDocRef, defaultCompany);
          setCompany(defaultCompany);
        }
      } catch (err) {
        console.error("Erro no bootstrap da empresa:", err);
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

  // Render Logged-In CRM consoles
  if (currentUser) {
    return (
      <main className="min-h-screen bg-slate-100 flex flex-col p-4 sm:p-6 lg:p-8 font-sans">
        <div className="max-w-7xl w-full mx-auto flex-1 flex flex-col select-none">
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
    return (
      <main className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4 font-sans leading-relaxed">
        <ClientWidget 
          companyId={companyId} 
          companyName={company?.name || 'Sua Loja AtendePro'} 
          onGoBack={() => {
            // Remove parameter on return
            window.history.pushState({}, '', window.location.pathname);
            setCurrentView('home');
          }} 
        />
      </main>
    );
  }

  // Render Independent Employee Login View
  if (currentView === 'login') {
    return (
      <main className="min-h-screen bg-slate-100 flex flex-col p-4 font-sans leading-relaxed">
        <div className="absolute top-4 left-4">
          <button
            onClick={() => {
              window.history.pushState({}, '', window.location.pathname);
              setCurrentView('home');
            }}
            className="text-xs font-semibold bg-white border border-slate-200 text-slate-500 hover:text-slate-800 px-3.5 py-2 rounded-xl transition-all"
          >
            ← Voltar para a Início
          </button>
        </div>
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
          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
            AtendePro CRM <span className="text-indigo-600 block sm:inline">Ao Vivo</span>
          </h1>
          <p className="text-sm sm:text-base text-slate-500 max-w-lg mx-auto">
            Integração em tempo real com Firestore. Conecte clientes finais instantaneamente a vendedores ativos no painel geral.
          </p>
        </div>

        {/* Dual navigation choices columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6" id="view-selector-grid">
          
          {/* Card 1: Customer Entrance point */}
          <button
            onClick={() => {
              window.history.pushState({}, '', '?view=client');
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
              window.history.pushState({}, '', '?view=login');
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
        <div className="text-[11px] text-slate-400 flex justify-center items-center gap-1">
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Fidelidade instantânea de conexões e sincronização em tempo real via Firestore</span>
        </div>

      </div>

    </main>
  );
}
