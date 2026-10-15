import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc, onSnapshot, collection } from 'firebase/firestore';
import { db, auth, testFirestoreConnection } from './lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import { User, Company } from './types';
import MasterLoginScreen from './components/MasterLoginScreen';
import SellerLoginScreen from './components/SellerLoginScreen';
import LoginScreen from './components/LoginScreen';
import ClientWidget from './components/ClientWidget';
import SellerDashboard from './components/SellerDashboard';
import MasterDashboard from './components/MasterDashboard';
import SuperAdminDashboard from './components/SuperAdminDashboard';
import BlockedLicenseScreen from './components/BlockedLicenseScreen';
import { 
  Compass, Headphones, ShieldAlert, Sparkles, LogIn, ChevronRight, HelpCircle, ShieldCheck, Settings2 
} from 'lucide-react';
import { updateDynamicManifestAndIcons } from './lib/dynamicPwa';

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
    const targetParam = getCompanyIdentifierFromUrl().toLowerCase();
    const cachedCompStr = localStorage.getItem(`crm_cached_company_${targetParam}`);
    if (cachedCompStr) {
      try {
        const parsed = JSON.parse(cachedCompStr) as Company;
        if (parsed?.id) return parsed.id;
      } catch (e) {}
    }
    return getCompanyIdentifierFromUrl();
  });

  const [company, setCompany] = useState<Company | null>(() => {
    const targetParam = getCompanyIdentifierFromUrl().toLowerCase();
    const cachedCompStr = localStorage.getItem(`crm_cached_company_${targetParam}`) ||
                          localStorage.getItem(`crm_cached_company_company_${targetParam}`);
    if (cachedCompStr) {
      try {
        return JSON.parse(cachedCompStr) as Company;
      } catch (e) {}
    }
    return null;
  });
  const [allCompaniesList, setAllCompaniesList] = useState<Company[]>([]);
  const [isSuperAdminView, setIsSuperAdminView] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash.toLowerCase();
    return params.get('view') === 'superadmin' || 
           params.get('superadmin') === 'true' || 
           params.get('admin') === 'super' ||
           hash.includes('superadmin');
  });

  // Helper to match company against target slug or ID accurately
  const matchesCompany = (c: Company | null | undefined, target: string): boolean => {
    if (!c || !target) return false;
    const t = target.toLowerCase().trim();
    const idLower = (c.id || '').toLowerCase();
    const slugLower = (c.slug || '').toLowerCase();
    return (
      idLower === t ||
      slugLower === t ||
      idLower === `company_${t}` ||
      `company_${slugLower}` === t ||
      idLower.replace(/^company_/, '') === t.replace(/^company_/, '') ||
      (t === 'atendepro_default' && idLower === 'atendepro_default') ||
      (t === 'larissamoveis' && (idLower === 'atendepro_default' || slugLower === 'larissamoveis'))
    );
  };

  const previousCompanyParamRef = useRef(getCompanyIdentifierFromUrl().toLowerCase());

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    // Clear leaking global sessions from older versions
    try {
      localStorage.removeItem('crm_current_user');
      localStorage.removeItem('crm_current_user_atendepro');
    } catch (e) {}

    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    const roleParam = (params.get('role') || params.get('tipo') || '').toLowerCase();
    const isLoginLink = 
      viewParam === 'vendedor' || 
      viewParam === 'seller' || 
      viewParam === 'login' || 
      viewParam === 'gerente' || 
      viewParam === 'dono' || 
      viewParam === 'owner' || 
      roleParam === 'gerente' || 
      roleParam === 'dono' || 
      roleParam === 'admin';

    // If entering directly through a login link, always present login screen (no auto-resume)
    if (isLoginLink && params.get('autologin') !== 'true') {
      return null;
    }

    const activeId = getCompanyIdentifierFromUrl().toLowerCase();
    const saved = localStorage.getItem(`crm_current_user_${activeId}`) || 
                  localStorage.getItem(`crm_current_user_company_${activeId}`);
    if (saved) {
      try {
        const parsed: User = JSON.parse(saved);
        if (parsed && !parsed.avatarUrl) {
          const savedAvatar = localStorage.getItem(`crm_seller_avatar_${activeId}_${parsed.id}`) || 
                              localStorage.getItem(`crm_seller_avatar_${parsed.name.trim().toLowerCase()}`);
          if (savedAvatar) {
            parsed.avatarUrl = savedAvatar;
          }
        }
        return parsed;
      } catch (e) {
        console.error("Erro ao recuperar sessão:", e);
      }
    }
    return null;
  });

  // Watch for session changes to persist/remove from localStorage strictly for this company
  useEffect(() => {
    const rawTarget = getCompanyIdentifierFromUrl().toLowerCase();
    try {
      localStorage.removeItem('crm_current_user');
      localStorage.removeItem('crm_current_user_atendepro');
    } catch (e) {}

    if (currentUser) {
      localStorage.setItem(`crm_current_user_${companyId}`, JSON.stringify(currentUser));
      localStorage.setItem(`crm_current_user_${rawTarget}`, JSON.stringify(currentUser));
      localStorage.setItem(`crm_current_user_company_${rawTarget}`, JSON.stringify(currentUser));
      if (currentUser.avatarUrl) {
        localStorage.setItem(`crm_seller_avatar_${companyId}_${currentUser.id}`, currentUser.avatarUrl);
        localStorage.setItem(`crm_seller_avatar_${rawTarget}_${currentUser.id}`, currentUser.avatarUrl);
        localStorage.setItem(`crm_seller_avatar_${currentUser.name.trim().toLowerCase()}`, currentUser.avatarUrl);
      }
    } else {
      localStorage.removeItem(`crm_current_user_${companyId}`);
      localStorage.removeItem(`crm_current_user_${rawTarget}`);
      localStorage.removeItem(`crm_current_user_company_${rawTarget}`);
    }
  }, [currentUser, companyId]);

  // Real-time synchronization of currentUser with Firestore (avatar and profile updates)
  useEffect(() => {
    if (!currentUser?.id) return;
    const userDocRef = doc(db, 'companies', companyId, 'users', currentUser.id);
    const unsub = onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data?.avatarUrl && data.avatarUrl !== currentUser.avatarUrl) {
          setCurrentUser(prev => prev ? { ...prev, avatarUrl: data.avatarUrl } : null);
        }
      }
    }, (err) => {
      console.warn("Aviso ao sincronizar perfil do usuário no App:", err);
    });
    return () => unsub();
  }, [currentUser?.id, companyId]);
  
  // Views navigation selection: 'home' | 'client' | 'vendedor' | 'gerente' | 'master_login'
  const isMasterRoot = companyId === 'atendepro_default';
  const [currentView, setCurrentView] = useState<'home' | 'client' | 'vendedor' | 'gerente' | 'master_login'>(() => {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    const roleParam = (params.get('role') || params.get('tipo') || '').toLowerCase();
    const customComp = params.get('empresa') || params.get('company') || params.get('slug');

    if (viewParam === 'client') return 'client';
    if (viewParam === 'gerente' || viewParam === 'dono' || viewParam === 'owner' || roleParam === 'gerente' || roleParam === 'dono' || roleParam === 'admin') {
      return 'gerente';
    }
    if (viewParam === 'vendedor' || viewParam === 'seller' || viewParam === 'login') {
      return customComp ? 'vendedor' : 'master_login';
    }
    if (viewParam === 'portal') return 'home';
    if (!customComp) return 'master_login';
    return 'client';
  });
  const [connecting, setConnecting] = useState(true);

  // Synchronous navigation helper to keep URL and currentView in sync
  const navigate = (
    paramsToSet: Record<string, string | null>, 
    targetView?: 'home' | 'client' | 'vendedor' | 'gerente' | 'master_login'
  ) => {
    const params = new URLSearchParams(window.location.search);
    Object.entries(paramsToSet).forEach(([k, v]) => {
      if (v === null) {
        params.delete(k);
      } else {
        params.set(k, v);
      }
    });
    const newSearch = params.toString() ? `?${params.toString()}` : '';
    const newUrl = `${window.location.pathname}${newSearch}${window.location.hash}`;
    window.history.pushState({}, '', newUrl);

    if (targetView) {
      setCurrentView(targetView);
    }
  };

  // Parse direct access via URL Query Parameters and Hash Navigation (popstate / hashchange)
  useEffect(() => {
    const handleUrlChange = () => {
      const params = new URLSearchParams(window.location.search);
      const hash = window.location.hash.toLowerCase();
      const viewParam = params.get('view');
      const roleParam = (params.get('role') || params.get('tipo') || '').toLowerCase();
      const isSuper = params.get('superadmin') === 'true' || 
                      params.get('admin') === 'super' || 
                      viewParam === 'superadmin' || 
                      hash.includes('superadmin');
      
      const customCompany = params.get('empresa') || 
                            params.get('company') || 
                            params.get('e') || 
                            params.get('c') || 
                            params.get('slug');

      const targetIdentifier = (customCompany ? customCompany.trim() : 'atendepro_default').toLowerCase();

      // Only reset currentUser if the company parameter in the URL ACTUALLY changed
      if (previousCompanyParamRef.current !== targetIdentifier) {
        previousCompanyParamRef.current = targetIdentifier;
        setCurrentUser(null);

        const matched = allCompaniesList.find(c => matchesCompany(c, targetIdentifier));
        if (matched) {
          setCompany(matched);
          setCompanyId(matched.id);
        } else {
          setCompanyId(targetIdentifier);
        }
      }

      if (isSuper) {
        setIsSuperAdminView(true);
        document.title = 'Painel de Licenças | Gestão de Empresas';
      } else {
        setIsSuperAdminView(false);
        if (viewParam === 'gerente' || viewParam === 'dono' || viewParam === 'owner' || roleParam === 'gerente' || roleParam === 'dono' || roleParam === 'admin') {
          setCurrentView('gerente');
        } else if (viewParam === 'vendedor' || viewParam === 'seller' || viewParam === 'login' || hash.includes('login') || hash.includes('vendedor')) {
          setCurrentView(targetIdentifier === 'atendepro_default' ? 'master_login' : 'vendedor');
        } else if (viewParam === 'portal' || hash.includes('portal')) {
          setCurrentView('home');
        } else if (viewParam === 'client' || hash.includes('client')) {
          setCurrentView('client');
        } else {
          if (!customCompany || targetIdentifier === 'atendepro_default') {
            setCurrentView('master_login');
          } else {
            setCurrentView('client');
          }
        }
      }
    };

    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);

    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, [allCompaniesList]);

  // Dynamically update document title, favicon, and PWA Web Manifest based on active company
  useEffect(() => {
    if (isSuperAdminView) {
      document.title = 'Painel de Licenças | Gestão de Empresas';
    } else {
      updateDynamicManifestAndIcons(company);
    }
  }, [isSuperAdminView, company]);

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
          let matched = fetchedCompanies.find(c => matchesCompany(c, targetParam));

          // Check fallback in localStorage
          if (!matched) {
            const savedLocal = localStorage.getItem('crm_local_companies');
            if (savedLocal) {
              try {
                const parsed = JSON.parse(savedLocal) as Company[];
                matched = parsed.find(c => matchesCompany(c, targetParam));
              } catch (e) {}
            }
          }

          if (matched) {
            if (matched.id === 'atendepro_default' && (matched.name === 'Larissa Móveis' || matched.name === 'Central de Atendimento')) {
              matched.name = 'Atendimento Online';
              matched.slug = 'atendimento';
              matched.logoUrl = '';
              setDoc(doc(db, 'companies', 'atendepro_default'), {
                name: 'Atendimento Online',
                slug: 'atendimento',
                logoUrl: ''
              }, { merge: true }).catch(console.warn);
            }
            setCompany(matched);
            setCompanyId(matched.id);
            try {
              localStorage.setItem(`crm_cached_company_${targetParam}`, JSON.stringify(matched));
              localStorage.setItem(`crm_cached_company_${matched.id}`, JSON.stringify(matched));
              if (matched.slug) localStorage.setItem(`crm_cached_company_${matched.slug.toLowerCase()}`, JSON.stringify(matched));
            } catch (e) {}
          } else {
            // If target is default
            if (targetParam === 'atendepro_default' || targetParam === 'larissamoveis') {
              const defaultCompany: Company = {
                id: 'atendepro_default',
                name: 'Atendimento Online',
                slug: 'atendimento',
                logoUrl: '',
                adminName: 'Administrador',
                adminPassword: 'admin',
                license: {
                  status: 'active',
                  planName: 'Plano Pro Master',
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
              matched = parsed.find(c => matchesCompany(c, targetParam));
            } catch (e) {}
          }

          if (matched) {
            setCompany(matched);
            setCompanyId(matched.id);
          } else if (targetParam === 'atendepro_default' || targetParam === 'larissamoveis') {
            setCompany({
              id: 'atendepro_default',
              name: 'Atendimento Online',
              slug: 'atendimento',
              logoUrl: '',
              adminName: 'Administrador',
              adminPassword: 'admin',
              license: {
                status: 'active',
                planName: 'Plano Pro Master',
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
  }, []);

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

  const currentCompanyName = company?.name || 'Atendimento Online';
  const currentCompanyLogo = company?.logoUrl || '';

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
              onLogout={() => {
                setCurrentUser(null);
                navigate({ view: 'gerente' }, companyId === 'atendepro_default' ? 'master_login' : 'gerente');
              }} 
            />
          ) : (
            <SellerDashboard 
              companyId={companyId} 
              company={company}
              sellerUser={currentUser} 
              onLogout={() => {
                setCurrentUser(null);
                navigate({ view: 'vendedor' }, companyId === 'atendepro_default' ? 'master_login' : 'vendedor');
              }} 
              onUpdateUser={(updated) => setCurrentUser(updated)}
            />
          )}
        </div>
      </main>
    );
  }

  // 4. Render Master Panel Login (Simple Login + Password for Master Administration)
  if (currentView === 'master_login') {
    return (
      <main className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4 font-sans leading-relaxed relative">
        <MasterLoginScreen
          companyId={companyId}
          company={company}
          onLoginSuccess={(user) => setCurrentUser(user)}
          onOpenSuperAdmin={() => {
            window.history.pushState({}, '', '?view=superadmin');
            setIsSuperAdminView(true);
          }}
        />

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-center">
          <button
            onClick={() => navigate({ view: 'client' }, 'client')}
            className="text-xs text-slate-500 hover:text-indigo-600 transition-colors font-medium cursor-pointer flex items-center gap-1.5 bg-white/80 hover:bg-white px-3 py-1.5 rounded-full border border-slate-200/80 shadow-sm"
          >
            <Headphones className="w-3.5 h-3.5 text-indigo-600" />
            <span>Chat do Cliente</span>
          </button>
          <button
            onClick={() => {
              window.history.pushState({}, '', '?view=superadmin');
              setIsSuperAdminView(true);
            }}
            className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors font-medium cursor-pointer"
          >
            🔒 Gerenciador de Licenças
          </button>
        </div>
      </main>
    );
  }

  // 5. Render Customer Support View (Default Live Chat for Customers)
  if (currentView === 'client') {
    const params = new URLSearchParams(window.location.search);
    const hasPortalAccess = params.get('portal') === 'true';

    return (
      <main className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4 font-sans leading-relaxed relative">
        <ClientWidget 
          companyId={companyId} 
          companyName={currentCompanyName} 
          companyLogo={currentCompanyLogo}
          company={company}
          onGoBack={hasPortalAccess ? () => {
            navigate({ view: 'portal' }, 'home');
          } : undefined} 
        />

        {/* Discreet Super Admin & Seller Login links at bottom */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-center">
          <button
            onClick={() => {
              navigate({ view: 'vendedor' }, companyId === 'atendepro_default' ? 'master_login' : 'vendedor');
            }}
            className="text-xs text-slate-500 hover:text-indigo-600 transition-colors font-semibold cursor-pointer flex items-center gap-1.5 bg-white/90 hover:bg-white px-3.5 py-1.5 rounded-full border border-slate-200/90 shadow-sm"
          >
            <LogIn className="w-3.5 h-3.5 text-indigo-600" />
            <span>Área Comercial (Vendedor / Dono)</span>
          </button>

          <button
            onClick={() => {
              window.history.pushState({}, '', '?view=superadmin');
              setIsSuperAdminView(true);
            }}
            className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors font-medium cursor-pointer"
          >
            🔒 Gerenciador de Licenças
          </button>
        </div>
      </main>
    );
  }

  // 6. Render Dedicated Seller Login (Name only + Device Lock)
  if (currentView === 'vendedor' || (currentView as string) === 'login') {
    return (
      <main className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4 font-sans leading-relaxed relative">
        <SellerLoginScreen
          companyId={companyId}
          company={company}
          onLoginSuccess={(user) => setCurrentUser(user)}
          onSwitchToOwnerLogin={() => {
            navigate({ view: 'gerente' }, 'gerente');
          }}
        />

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-center">
          <button
            onClick={() => navigate({ view: 'client' }, 'client')}
            className="text-xs text-slate-500 hover:text-indigo-600 transition-colors font-medium cursor-pointer flex items-center gap-1.5 bg-white/80 hover:bg-white px-3 py-1.5 rounded-full border border-slate-200/80 shadow-sm"
          >
            <Headphones className="w-3.5 h-3.5 text-indigo-600" />
            <span>Ir para Chat do Cliente</span>
          </button>

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

  // 7. Render Owner / Manager Login (Username + Password)
  if (currentView === 'gerente') {
    return (
      <main className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4 font-sans leading-relaxed relative">
        <LoginScreen 
          companyId={companyId} 
          company={company}
          onLoginSuccess={(user) => setCurrentUser(user)}
          onSwitchToSellerLogin={() => {
            navigate({ view: 'vendedor' }, 'vendedor');
          }}
        />

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-center">
          <button
            onClick={() => navigate({ view: 'client' }, 'client')}
            className="text-xs text-slate-500 hover:text-indigo-600 transition-colors font-medium cursor-pointer flex items-center gap-1.5 bg-white/80 hover:bg-white px-3 py-1.5 rounded-full border border-slate-200/80 shadow-sm"
          >
            <Headphones className="w-3.5 h-3.5 text-indigo-600" />
            <span>Ir para Chat do Cliente</span>
          </button>

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

  // 8. Render Dual selection portal landing page
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
              navigate({ view: 'client', portal: 'true' }, 'client');
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
              navigate({ view: 'vendedor', portal: 'true' }, companyId === 'atendepro_default' ? 'master_login' : 'vendedor');
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
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-xs text-slate-600 font-medium tracking-wide">
            Produto da empresa <span className="font-bold text-slate-800">Bossa Infor</span>
          </p>

          <div className="text-[11px] text-slate-400 flex justify-center items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Fidelidade instantânea de conexões e sincronização em tempo real via Firestore</span>
          </div>

          <button
            onClick={() => {
              window.history.pushState({}, '', '?view=superadmin');
              setIsSuperAdminView(true);
            }}
            className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors font-medium flex items-center gap-1 mt-0.5 cursor-pointer"
          >
            <ShieldCheck className="w-3 h-3 text-indigo-500" />
            <span>Painel Super Admin • Gestão de Licenças e Empresas</span>
          </button>
        </div>

      </div>

    </main>
  );
}
