import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, onSnapshot, collection } from 'firebase/firestore';
import { db, auth, testFirestoreConnection } from './lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import { User, Company } from './types';
import LoginScreen from './components/LoginScreen';
import ClientWidget from './components/ClientWidget';
import SellerDashboard from './components/SellerDashboard';
import MasterDashboard from './components/MasterDashboard';
import SuperAdminDashboard from './components/SuperAdminDashboard';
import BlockedLicenseScreen from './components/BlockedLicenseScreen';
import { 
  Compass, Headphones, ShieldAlert, Sparkles, LogIn, ChevronRight, HelpCircle, ShieldCheck, Settings2 
} from 'lucide-react';

export default function App() {
  // Parse company and view from URL query parameters
  const getCompanyIdentifierFromUrl = (): string => {
    const params = new URLSearchParams(window.location.search);
    const custom = params.get('empresa') || 
                   params.get('company') || 
                   params.get('e') || 
                   params.get('c') || 
                   params.get('slug');
    return custom ? custom.trim() : 'atendepro_default';
  };

  const [companyId, setCompanyId] = useState<string>(() => {
    return getCompanyIdentifierFromUrl();
  });

  const [company, setCompany] = useState<Company | null>(null);
  const [allCompaniesList, setAllCompaniesList] = useState<Company[]>([]);
  const [isSuperAdminView, setIsSuperAdminView] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash.toLowerCase();
    return params.get('view') === 'superadmin' || 
           params.get('superadmin') === 'true' || 
           params.get('admin') === 'super' ||
           hash.includes('superadmin');
  });

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const activeId = getCompanyIdentifierFromUrl();
    const saved = localStorage.getItem(`crm_current_user_${activeId}`) || 
                  localStorage.getItem('crm_current_user_atendepro');
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
      localStorage.setItem(`crm_current_user_${companyId}`, JSON.stringify(currentUser));
    } else {
      localStorage.removeItem(`crm_current_user_${companyId}`);
    }
  }, [currentUser, companyId]);
  
  // Views navigation selection: 'home' | 'client' | 'login'
  const [currentView, setCurrentView] = useState<'home' | 'client' | 'login'>('client');
  const [connecting, setConnecting] = useState(true);

  // Parse direct access via URL Query Parameters and Hash Navigation
  useEffect(() => {
    const handleUrlChange = () => {
      const params = new URLSearchParams(window.location.search);
      const hash = window.location.hash.toLowerCase();
      const viewParam = params.get('view');
      const isSuper = params.get('superadmin') === 'true' || 
                      params.get('admin') === 'super' || 
                      viewParam === 'superadmin' || 
                      hash.includes('superadmin');
      
      const customCompany = params.get('empresa') || 
                            params.get('company') || 
                            params.get('e') || 
                            params.get('c') || 
                            params.get('slug');

      if (customCompany && customCompany.trim() !== companyId) {
        setCompanyId(customCompany.trim());
      }

      if (isSuper) {
        setIsSuperAdminView(true);
        document.title = 'Painel de Licenças | Gestão de Empresas';
      } else if (viewParam === 'login' || hash.includes('login')) {
        setIsSuperAdminView(false);
        setCurrentView('login');
      } else if (viewParam === 'portal' || hash.includes('portal')) {
        setIsSuperAdminView(false);
        setCurrentView('home');
      } else {
        setIsSuperAdminView(false);
        setCurrentView('client');
      }
    };

    handleUrlChange();
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);

    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, [companyId]);

  // Dynamically update document title and favicon based on active company
  useEffect(() => {
    if (isSuperAdminView) {
      document.title = 'Painel de Licenças | Gestão de Empresas';
    } else if (company?.name) {
      document.title = `${company.name} - Atendimento Online`;
      
      // Update or create favicon
      if (company.logoUrl) {
        let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
        if (!link) {
          link = document.createElement('link');
          link.rel = 'shortcut icon';
          document.getElementsByTagName('head')[0].appendChild(link);
        }
        link.href = company.logoUrl;
      }
    }
  }, [isSuperAdminView, company?.name, company?.logoUrl]);

  // Initialize Firebase Auth & Real-Time Companies Collection Listener
  useEffect(() => {
    let unsubscribeCompanies: (() => void) | null = null;

    async function bootstrapCompany() {
      try {
        try {
          await signInAnonymously(auth);
          console.log("Firebase Auth: Autenticado anonimamente com sucesso.");
        } catch (authErr) {
          console.warn("Firebase Auth: Login anônimo opcional falhou ou não habilitado:", authErr);
        }

        await testFirestoreConnection();

        // Listen to companies collection in real time
        const companiesColRef = collection(db, 'companies');
        unsubscribeCompanies = onSnapshot(companiesColRef, (snapshot) => {
          const fetchedCompanies: Company[] = [];
          snapshot.forEach((d) => {
            fetchedCompanies.push({ id: d.id, ...d.data() } as Company);
          });

          setAllCompaniesList(fetchedCompanies);

          const targetParam = getCompanyIdentifierFromUrl().toLowerCase();
          
          // Match company by slug, exact ID, or company_{slug}
          let matched = fetchedCompanies.find(c => {
            const idLower = (c.id || '').toLowerCase();
            const slugLower = (c.slug || '').toLowerCase();
            return slugLower === targetParam ||
                   idLower === targetParam ||
                   idLower === `company_${targetParam}` ||
                   `company_${slugLower}` === targetParam ||
                   (targetParam === 'larissamoveis' && (idLower === 'atendepro_default' || slugLower === 'larissamoveis')) ||
                   (targetParam === 'atendepro_default' && idLower === 'atendepro_default');
          });

          // Check fallback in localStorage
          if (!matched) {
            const savedLocal = localStorage.getItem('crm_local_companies');
            if (savedLocal) {
              try {
                const parsed = JSON.parse(savedLocal) as Company[];
                matched = parsed.find(c => {
                  const idLower = (c.id || '').toLowerCase();
                  const slugLower = (c.slug || '').toLowerCase();
                  return slugLower === targetParam ||
                         idLower === targetParam ||
                         idLower === `company_${targetParam}` ||
                         `company_${slugLower}` === targetParam;
                });
              } catch (e) {}
            }
          }

          if (matched) {
            setCompany(matched);
            setCompanyId(matched.id);
          } else {
            // If target is default
            if (targetParam === 'atendepro_default' || targetParam === 'larissamoveis') {
              const defaultCompany: Company = {
                id: 'atendepro_default',
                name: 'Larissa Móveis',
                slug: 'larissamoveis',
                logoUrl: 'https://i.postimg.cc/8CdttXNK/Whats-App-Image-2026-06-10-at-14-30-14.jpg',
                adminName: 'Larissa',
                adminPassword: '13259898',
                license: {
                  status: 'active',
                  planName: 'Plano Pro Vitalício',
                  monthlyPrice: 0,
                  isLifetime: true
                },
                createdAt: new Date().toISOString()
              };
              setDoc(doc(db, 'companies', 'atendepro_default'), defaultCompany).catch(console.warn);
              setCompany(defaultCompany);
              setCompanyId('atendepro_default');
            } else {
              // Custom company not yet in cloud collection, create clean isolated profile
              const cleanSlug = targetParam.replace(/^company_/, '');
              const formattedName = cleanSlug.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
              const dynamicCompany: Company = {
                id: targetParam.startsWith('company_') ? targetParam : `company_${targetParam}`,
                name: formattedName,
                slug: cleanSlug,
                adminName: 'Administrador',
                adminPassword: '13259898',
                license: {
                  status: 'active',
                  planName: 'Plano Mensal',
                  monthlyPrice: 149
                },
                createdAt: new Date().toISOString()
              };
              setCompany(dynamicCompany);
              setCompanyId(dynamicCompany.id);
            }
          }

          setConnecting(false);
        }, (err) => {
          console.warn("Utilizando fallback local para empresas:", err);
          const targetParam = getCompanyIdentifierFromUrl().toLowerCase();
          const savedLocal = localStorage.getItem('crm_local_companies');
          let matched: Company | undefined;
          if (savedLocal) {
            try {
              const parsed = JSON.parse(savedLocal) as Company[];
              matched = parsed.find(c => {
                const idLower = (c.id || '').toLowerCase();
                const slugLower = (c.slug || '').toLowerCase();
                return slugLower === targetParam ||
                       idLower === targetParam ||
                       idLower === `company_${targetParam}` ||
                       `company_${slugLower}` === targetParam;
              });
            } catch (e) {}
          }

          if (matched) {
            setCompany(matched);
            setCompanyId(matched.id);
          } else if (targetParam === 'atendepro_default' || targetParam === 'larissamoveis') {
            setCompany({
              id: 'atendepro_default',
              name: 'Larissa Móveis',
              slug: 'larissamoveis',
              logoUrl: 'https://i.postimg.cc/8CdttXNK/Whats-App-Image-2026-06-10-at-14-30-14.jpg',
              adminName: 'Larissa',
              adminPassword: '13259898',
              license: {
                status: 'active',
                planName: 'Plano Pro Vitalício',
                monthlyPrice: 0,
                isLifetime: true
              },
              createdAt: new Date().toISOString()
            });
            setCompanyId('atendepro_default');
          } else {
            const cleanSlug = targetParam.replace(/^company_/, '');
            const formattedName = cleanSlug.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            setCompany({
              id: `company_${cleanSlug}`,
              name: formattedName,
              slug: cleanSlug,
              adminName: 'Administrador',
              adminPassword: '13259898',
              license: {
                status: 'active',
                planName: 'Plano Mensal',
                monthlyPrice: 149
              },
              createdAt: new Date().toISOString()
            });
            setCompanyId(`company_${cleanSlug}`);
          }
          setConnecting(false);
        });

      } catch (err) {
        console.warn("Falha de inicialização:", err);
        setConnecting(false);
      }
    }

    bootstrapCompany();

    return () => {
      if (unsubscribeCompanies) unsubscribeCompanies();
    };
  }, [companyId]);

  if (connecting) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent shadow-md"></div>
          <span className="text-sm font-semibold text-slate-500">Conectando ao sistema em tempo real...</span>
        </div>
      </div>
    );
  }

  // 1. Super Admin Management Console (Global SaaS Manager)
  if (isSuperAdminView) {
    return (
      <SuperAdminDashboard 
        currentCompanyId={companyId}
        onSelectCompany={(selectedId) => {
          const selectedComp = allCompaniesList.find(c => c.id === selectedId);
          const slug = selectedComp?.slug || selectedId.replace(/^company_/, '');
          setCompanyId(selectedId);
          if (selectedComp) setCompany(selectedComp);
          const params = new URLSearchParams(window.location.search);
          if (selectedId === 'atendepro_default') {
            params.delete('empresa');
            params.delete('company');
            params.delete('c');
            params.delete('slug');
          } else {
            params.set('empresa', slug);
            params.delete('company');
            params.delete('c');
            params.delete('slug');
          }
          params.delete('view');
          params.delete('superadmin');
          const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
          window.history.pushState({}, '', newUrl);
          setIsSuperAdminView(false);
        }}
        onExitSuperAdmin={() => {
          const params = new URLSearchParams(window.location.search);
          params.delete('view');
          params.delete('superadmin');
          const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
          window.history.pushState({}, '', newUrl);
          setIsSuperAdminView(false);
        }} 
      />
    );
  }

  // 2. License Guard: If Company license is blocked, suspended, canceled or date expired (unless Lifetime)
  const isLifetime = company?.license?.isLifetime || company?.license?.planType === 'lifetime';
  const isDateExpired = !isLifetime && Boolean(company?.license?.expiresAt && new Date(company.license.expiresAt) < new Date());
  const isLicenseBlocked = Boolean(company && (
    company.license?.status === 'blocked' || 
    company.license?.status === 'suspended' || 
    company.license?.status === 'expired' || 
    company.license?.status === 'canceled' ||
    isDateExpired
  ));

  if (isLicenseBlocked) {
    return (
      <BlockedLicenseScreen 
        company={company} 
        onSuperAdminClick={() => {
          window.history.pushState({}, '', '?view=superadmin');
          setIsSuperAdminView(true);
        }}
        onGoBackHome={() => {
          // Switch to default company
          setCompanyId('atendepro_default');
          const params = new URLSearchParams(window.location.search);
          params.delete('company');
          params.delete('c');
          params.delete('view');
          window.history.pushState({}, '', window.location.pathname);
        }}
      />
    );
  }

  const currentCompanyName = company?.name || (companyId === 'atendepro_default' ? 'Larissa Móveis' : 'Atendimento Online');
  const currentCompanyLogo = company?.logoUrl || (companyId === 'atendepro_default' ? 'https://i.postimg.cc/8CdttXNK/Whats-App-Image-2026-06-10-at-14-30-14.jpg' : '');

  // 3. Render Logged-In CRM consoles (Master or Seller)
  if (currentUser) {
    return (
      <main className="min-h-screen bg-slate-100 flex flex-col p-4 sm:p-6 lg:p-8 font-sans">
        <div className="max-w-7xl w-full mx-auto flex-1 flex flex-col select-none">
          {currentUser.role === 'admin' ? (
            <MasterDashboard 
              companyId={companyId} 
              company={company}
              adminUser={currentUser} 
              onLogout={() => setCurrentUser(null)} 
            />
          ) : (
            <SellerDashboard 
              companyId={companyId} 
              company={company}
              sellerUser={currentUser} 
              onLogout={() => setCurrentUser(null)} 
            />
          )}
        </div>
      </main>
    );
  }

  // 4. Render Customer Support View (Default Live Chat for Customers)
  if (currentView === 'client') {
    const params = new URLSearchParams(window.location.search);
    const hasPortalAccess = params.get('portal') === 'true';

    return (
      <main className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4 font-sans leading-relaxed relative">
        <ClientWidget 
          companyId={companyId} 
          companyName={currentCompanyName} 
          companyLogo={currentCompanyLogo}
          onGoBack={hasPortalAccess ? () => {
            const newParams = new URLSearchParams(window.location.search);
            newParams.set('view', 'portal');
            window.history.pushState({}, '', `?${newParams.toString()}`);
            setCurrentView('home');
          } : undefined} 
        />

        {/* Discreet Super Admin link at bottom */}
        <div className="mt-4 text-center">
          <button
            onClick={() => {
              window.history.pushState({}, '', '?view=superadmin');
              setIsSuperAdminView(true);
            }}
            className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors font-medium cursor-pointer"
          >
            🔒 Gerenciador de Licenças (Super Admin)
          </button>
        </div>
      </main>
    );
  }

  // 5. Render Independent Employee Login View
  if (currentView === 'login') {
    const params = new URLSearchParams(window.location.search);
    const hasPortalAccess = params.get('portal') === 'true';

    return (
      <main className="min-h-screen bg-slate-100 flex flex-col justify-between p-4 sm:p-6 font-sans leading-relaxed relative">
        {hasPortalAccess ? (
          <div className="w-full flex justify-start">
            <button
              onClick={() => {
                const newParams = new URLSearchParams(window.location.search);
                newParams.set('view', 'portal');
                window.history.pushState({}, '', `?${newParams.toString()}`);
                setCurrentView('home');
              }}
              className="text-xs font-semibold bg-white border border-slate-200 text-slate-500 hover:text-slate-800 px-3.5 py-2 rounded-xl transition-colors cursor-pointer shadow-sm"
            >
              ← Voltar para o Início
            </button>
          </div>
        ) : (
          <div className="h-2" />
        )}

        <div className="my-auto w-full flex items-center justify-center">
          <LoginScreen 
            companyId={companyId} 
            company={company}
            onLoginSuccess={(user) => setCurrentUser(user)} 
          />
        </div>

        <div className="text-center py-2">
          <button
            onClick={() => {
              window.history.pushState({}, '', '?view=superadmin');
              setIsSuperAdminView(true);
            }}
            className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors font-medium cursor-pointer"
          >
            🔒 Gerenciador de Licenças (Super Admin)
          </button>
        </div>
      </main>
    );
  }

  // 6. Render Dual selection portal landing page
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col p-4 sm:p-6 lg:p-8 font-sans items-center justify-center relative overflow-hidden">
      
      {/* Background radial soft light highlight */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[550px] h-[550px] rounded-full bg-gradient-radial from-indigo-500/5 to-transparent blur-3xl -z-10 pointer-events-none"></div>

      <div className="max-w-2xl w-full text-center space-y-10 py-12">
        
        {/* Title branding heading block */}
        <div className="space-y-4">
          <div className="mx-auto w-20 h-20 rounded-full border border-slate-200 overflow-hidden shadow-lg bg-white flex items-center justify-center mb-2">
            {currentCompanyLogo ? (
              <img src={currentCompanyLogo} referrerPolicy="no-referrer" alt={`${currentCompanyName} Logo`} className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-black text-indigo-600">
                {currentCompanyName.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight text-balance">
            {currentCompanyName} <span className="text-indigo-600 block sm:inline">Atendimento Online</span>
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
              const newParams = new URLSearchParams(window.location.search);
              newParams.set('view', 'client');
              newParams.set('portal', 'true');
              window.history.pushState({}, '', `?${newParams.toString()}`);
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
              const newParams = new URLSearchParams(window.location.search);
              newParams.set('view', 'login');
              newParams.set('portal', 'true');
              window.history.pushState({}, '', `?${newParams.toString()}`);
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

        {/* Informative Footer Badge and Super Admin Access */}
        <div className="flex flex-col items-center gap-2">
          <div className="text-[11px] text-slate-400 flex justify-center items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Fidelidade instantânea de conexões e sincronização em tempo real via Firestore</span>
          </div>

          <button
            onClick={() => {
              window.history.pushState({}, '', '?view=superadmin');
              setIsSuperAdminView(true);
            }}
            className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors font-medium flex items-center gap-1 mt-2 cursor-pointer"
          >
            <ShieldCheck className="w-3 h-3 text-indigo-500" />
            <span>Painel Super Admin • Gestão de Licenças e Empresas</span>
          </button>
        </div>

      </div>

    </main>
  );
}
