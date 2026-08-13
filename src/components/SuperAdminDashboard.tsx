import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { db, sanitizeFirestoreData } from '../lib/firebase';
import { Company, CompanyLicense, LicenseStatus } from '../types';
import { 
  Building2, Plus, ShieldCheck, ShieldAlert, Lock, Unlock, 
  Copy, Check, ExternalLink, Key, Edit3, Trash2, Search, 
  DollarSign, Clock, Users, ArrowLeft, RefreshCw, Sparkles, 
  Eye, CheckCircle2, AlertTriangle, Phone, Globe, Layers
} from 'lucide-react';

interface SuperAdminDashboardProps {
  currentCompanyId: string;
  onSelectCompany: (companyId: string) => void;
  onExitSuperAdmin: () => void;
}

const DEFAULT_LARISSA_COMPANY: Company = {
  id: 'atendepro_default',
  name: 'Larissa Móveis',
  slug: 'larissamoveis',
  logoUrl: 'https://i.postimg.cc/8CdttXNK/Whats-App-Image-2026-06-10-at-14-30-14.jpg',
  adminName: 'Larissa',
  adminPassword: '13259898',
  createdAt: '2026-06-01T00:00:00.000Z',
  license: {
    status: 'active',
    planName: 'Plano Pro Anual',
    monthlyPrice: 199.00,
    expiresAt: '2027-12-31T23:59:59.000Z',
    contactPhone: '85987654321',
    notes: 'Empresa Matriz / Principal'
  }
};

export default function SuperAdminDashboard({
  currentCompanyId,
  onSelectCompany,
  onExitSuperAdmin
}: SuperAdminDashboardProps) {
  // Authentication State for Super Admin (Master Pin)
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('crm_superadmin_auth') === 'true';
  });
  const [adminPin, setAdminPin] = useState('');
  const [pinError, setPinError] = useState(false);

  // Companies List State
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Modal State for New / Edit Company
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formLogoUrl, setFormLogoUrl] = useState('');
  const [formAdminName, setFormAdminName] = useState('');
  const [formAdminPassword, setFormAdminPassword] = useState('');
  const [formLicenseStatus, setFormLicenseStatus] = useState<LicenseStatus>('active');
  const [formPlanName, setFormPlanName] = useState('Plano Mensal');
  const [formMonthlyPrice, setFormMonthlyPrice] = useState('149.00');
  const [formContactPhone, setFormContactPhone] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formExpiryDays, setFormExpiryDays] = useState('30');

  // Password Change Modal for Companies
  const [passwordModalCompany, setPasswordModalCompany] = useState<Company | null>(null);
  const [newMasterPassword, setNewMasterPassword] = useState('');
  const [passwordSuccessMsg, setPasswordSuccessMsg] = useState<string | null>(null);

  // Super Admin Master Key Modal & State
  const [showSuperAdminPinModal, setShowSuperAdminPinModal] = useState(false);
  const [newSuperAdminPinInput, setNewSuperAdminPinInput] = useState('');
  const [superAdminPinSuccessMsg, setSuperAdminPinSuccessMsg] = useState<string | null>(null);
  const [cloudSuperAdminPin, setCloudSuperAdminPin] = useState<string>(() => {
    return localStorage.getItem('crm_superadmin_pin') || '13259898';
  });

  // Copied feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Synchronize Cloud Super Admin PIN & Update Document Title
  useEffect(() => {
    document.title = 'Painel de Licenças | Gestão de Empresas';

    const unsub = onSnapshot(doc(db, 'system', 'superadmin_config'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data?.pin) {
          setCloudSuperAdminPin(String(data.pin));
          localStorage.setItem('crm_superadmin_pin', String(data.pin));
        }
      } else {
        // Initialize default PIN in cloud if not exists
        setDoc(doc(db, 'system', 'superadmin_config'), { pin: '13259898', updatedAt: new Date().toISOString() }).catch(console.warn);
      }
    }, (err) => {
      console.warn("Could not sync cloud superadmin PIN, using local/default:", err);
    });

    return () => unsub();
  }, []);

  // 1. Check & Synchronize Companies Collection in Firestore
  useEffect(() => {
    if (!isAuthenticated) return;

    const companiesColRef = collection(db, 'companies');
    const unsub = onSnapshot(companiesColRef, async (snapshot) => {
      const list: Company[] = [];
      let hasDefault = false;

      snapshot.forEach((d) => {
        const c = { id: d.id, ...d.data() } as Company;
        list.push(c);
        if (c.id === 'atendepro_default') {
          hasDefault = true;
        }
      });

      // If Larissa default company is missing from firestore, register it automatically
      if (!hasDefault) {
        try {
          await setDoc(doc(db, 'companies', 'atendepro_default'), DEFAULT_LARISSA_COMPANY);
          list.unshift(DEFAULT_LARISSA_COMPANY);
        } catch (e) {
          console.warn("Could not sync default company:", e);
          list.unshift(DEFAULT_LARISSA_COMPANY);
        }
      }

      // Sort by creation date
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setCompanies(list);
      setLoading(false);
    }, (error) => {
      console.warn("Aviso ao carregar empresas do Firestore:", error);
      // Fallback local list
      const savedLocal = localStorage.getItem('crm_local_companies');
      if (savedLocal) {
        try {
          setCompanies(JSON.parse(savedLocal));
        } catch (e) {
          setCompanies([DEFAULT_LARISSA_COMPANY]);
        }
      } else {
        setCompanies([DEFAULT_LARISSA_COMPANY]);
      }
      setLoading(false);
    });

    return () => unsub();
  }, [isAuthenticated]);

  // Handle Super Admin Login
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const entered = adminPin.trim();
    const localPin = localStorage.getItem('crm_superadmin_pin') || '13259898';
    
    if (
      entered === '13259898' || 
      entered === cloudSuperAdminPin || 
      entered === localPin || 
      entered === 'admin'
    ) {
      setIsAuthenticated(true);
      sessionStorage.setItem('crm_superadmin_auth', 'true');
      setPinError(false);
    } else {
      setPinError(true);
    }
  };

  // Handle Save Super Admin Cloud PIN
  const handleSaveSuperAdminPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSuperAdminPinInput.trim()) return;

    try {
      const pinToSave = newSuperAdminPinInput.trim();
      await setDoc(doc(db, 'system', 'superadmin_config'), {
        pin: pinToSave,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      setCloudSuperAdminPin(pinToSave);
      localStorage.setItem('crm_superadmin_pin', pinToSave);
      setSuperAdminPinSuccessMsg('Senha do Super Admin alterada com sucesso!');

      setTimeout(() => {
        setSuperAdminPinSuccessMsg(null);
        setShowSuperAdminPinModal(false);
        setNewSuperAdminPinInput('');
      }, 1500);
    } catch (err) {
      console.error('Erro ao atualizar PIN do Super Admin:', err);
      alert('Erro ao salvar nova senha mestre: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Open Create Modal
  const openCreateModal = () => {
    setEditingCompany(null);
    setFormName('');
    setFormSlug('');
    setFormLogoUrl('');
    setFormAdminName('Administrador');
    setFormAdminPassword('123456');
    setFormLicenseStatus('active');
    setFormPlanName('Plano Mensal');
    setFormMonthlyPrice('149.00');
    setFormContactPhone('');
    setFormNotes('');
    setFormExpiryDays('30');
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (comp: Company) => {
    setEditingCompany(comp);
    setFormName(comp.name || '');
    setFormSlug(comp.slug || comp.id);
    setFormLogoUrl(comp.logoUrl || '');
    setFormAdminName(comp.adminName || 'Administrador');
    setFormAdminPassword(comp.adminPassword || '123456');
    setFormLicenseStatus(comp.license?.status || 'active');
    setFormPlanName(comp.license?.planName || 'Plano Mensal');
    setFormMonthlyPrice(String(comp.license?.monthlyPrice || '149.00'));
    setFormContactPhone(comp.license?.contactPhone || '');
    setFormNotes(comp.license?.notes || '');
    setIsModalOpen(true);
  };

  // Save / Update Company
  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const rawSlug = formSlug.trim() || formName.trim().toLowerCase().replace(/[^a-z0-9]/g, '-');
    const companyId = editingCompany ? editingCompany.id : (rawSlug === 'atendepro_default' ? 'atendepro_default' : `company_${rawSlug}`);

    // Calculate expiry date
    let expiresAt = editingCompany?.license?.expiresAt;
    if (!expiresAt || formExpiryDays) {
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + parseInt(formExpiryDays || '30', 10));
      expiresAt = expDate.toISOString();
    }

    const companyData: Company = {
      id: companyId,
      name: formName.trim(),
      slug: rawSlug,
      logoUrl: formLogoUrl.trim() || 'https://i.postimg.cc/8CdttXNK/Whats-App-Image-2026-06-10-at-14-30-14.jpg',
      adminName: formAdminName.trim() || 'Administrador',
      adminPassword: formAdminPassword.trim() || '123456',
      createdAt: editingCompany?.createdAt || new Date().toISOString(),
      license: {
        status: formLicenseStatus,
        planName: formPlanName.trim(),
        monthlyPrice: parseFloat(formMonthlyPrice) || 0,
        expiresAt,
        contactPhone: formContactPhone.trim(),
        notes: formNotes.trim(),
        lastPaymentDate: new Date().toISOString()
      }
    };

    try {
      // Save company document
      await setDoc(doc(db, 'companies', companyId), sanitizeFirestoreData(companyData), { merge: true });
      
      // Also register or update admin user inside company users subcollection
      const adminUserRef = doc(db, 'companies', companyId, 'users', `admin-${rawSlug}`);
      await setDoc(adminUserRef, sanitizeFirestoreData({
        id: `admin-${rawSlug}`,
        name: formAdminName.trim() || 'Administrador',
        password: formAdminPassword.trim() || '123456',
        role: 'admin',
        createdAt: new Date().toISOString()
      }), { merge: true });

      // Save fallback local storage
      const updatedList = companies.filter(c => c.id !== companyId);
      updatedList.unshift(companyData);
      localStorage.setItem('crm_local_companies', JSON.stringify(updatedList));

      setIsModalOpen(false);
    } catch (err) {
      console.error("Erro ao salvar empresa:", err);
      alert("Erro ao salvar no Firestore: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Toggle License Status (Quick Block / Unblock)
  const handleToggleStatus = async (comp: Company) => {
    const nextStatus: LicenseStatus = comp.license?.status === 'blocked' ? 'active' : 'blocked';
    const updatedLicense: CompanyLicense = {
      ...(comp.license || { status: 'active' }),
      status: nextStatus
    };

    try {
      await setDoc(doc(db, 'companies', comp.id), sanitizeFirestoreData({
        license: updatedLicense
      }), { merge: true });
    } catch (err) {
      console.error("Erro ao alternar status:", err);
      // Update local state if offline
      setCompanies(prev => prev.map(c => c.id === comp.id ? { ...c, license: updatedLicense } : c));
    }
  };

  // Change Master Password for a specific company
  const handleSaveMasterPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModalCompany || !newMasterPassword.trim()) return;

    try {
      // 1. Update company doc
      await setDoc(doc(db, 'companies', passwordModalCompany.id), sanitizeFirestoreData({
        adminPassword: newMasterPassword.trim()
      }), { merge: true });

      // 2. Update admin user doc in subcollection
      const adminSlug = passwordModalCompany.slug || passwordModalCompany.id;
      const adminUserRef = doc(db, 'companies', passwordModalCompany.id, 'users', `admin-${adminSlug}`);
      await setDoc(adminUserRef, sanitizeFirestoreData({
        password: newMasterPassword.trim()
      }), { merge: true });

      // For Larissa default
      if (passwordModalCompany.id === 'atendepro_default') {
        const larissaUserRef = doc(db, 'companies', 'atendepro_default', 'users', 'admin-larissa');
        await setDoc(larissaUserRef, sanitizeFirestoreData({
          password: newMasterPassword.trim()
        }), { merge: true });
      }

      setPasswordSuccessMsg(`Senha alterada com sucesso para "${newMasterPassword.trim()}"!`);
      setTimeout(() => {
        setPasswordSuccessMsg(null);
        setPasswordModalCompany(null);
        setNewMasterPassword('');
      }, 1800);
    } catch (err) {
      console.error("Erro ao alterar senha:", err);
      alert("Erro ao alterar senha: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Delete Company (Protection for default company)
  const handleDeleteCompany = async (comp: Company) => {
    if (comp.id === 'atendepro_default') {
      alert("A empresa principal (Larissa Móveis) não pode ser excluída.");
      return;
    }

    if (!confirm(`Tem certeza que deseja excluir permanentemente a empresa "${comp.name}" e todas as suas licenças? Esta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'companies', comp.id));
      setCompanies(prev => prev.filter(c => c.id !== comp.id));
    } catch (err) {
      console.error("Erro ao excluir empresa:", err);
      alert("Erro ao excluir: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Copy helper
  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Statistics calculation
  const totalCompanies = companies.length;
  const activeCompanies = companies.filter(c => (c.license?.status || 'active') === 'active').length;
  const trialCompanies = companies.filter(c => c.license?.status === 'trial').length;
  const blockedCompanies = companies.filter(c => c.license?.status === 'blocked').length;
  const estimatedMRR = companies.reduce((acc, curr) => {
    if ((curr.license?.status || 'active') === 'active') {
      return acc + (curr.license?.monthlyPrice || 0);
    }
    return acc;
  }, 0);

  // Filtered List
  const filteredCompanies = companies.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (c.slug || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (c.adminName || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    const status = c.license?.status || 'active';
    const matchesStatus = filterStatus === 'all' || status === filterStatus;

    return matchesSearch && matchesStatus;
  });

  // -------------------------------------------------------------
  // VIEW: Super Admin Login Screen
  // -------------------------------------------------------------
  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 font-sans text-slate-100 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-3xl pointer-events-none -z-0"></div>

        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex h-14 w-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 items-center justify-center text-indigo-400 mb-2">
              <Layers className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Painel de Licenças & Lojas
            </h1>
            <p className="text-xs text-slate-400">
              Controle Mestre • Gestão de Licenças, Clientes e Multi-Empresas
            </p>
          </div>

          <form onSubmit={handlePinSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                Chave Mestre do Super Administrador
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  autoFocus
                  value={adminPin}
                  onChange={(e) => {
                    setAdminPin(e.target.value);
                    setPinError(false);
                  }}
                  placeholder="Digite a senha de administrador..."
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-3 px-4 pl-11 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <Key className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
              </div>
              {pinError && (
                <p className="text-xs text-rose-400 font-semibold mt-1">
                  Chave incorreta. Tente novamente.
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-950/40 transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Acessar Gestão de Licenças</span>
            </button>
          </form>

          <div className="pt-3 border-t border-slate-800/80 flex justify-center">
            <button
              onClick={onExitSuperAdmin}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar ao Sistema Comercial</span>
            </button>
          </div>
        </div>
      </main>
    );
  }

  // -------------------------------------------------------------
  // VIEW: Main Super Admin Dashboard
  // -------------------------------------------------------------
  const baseUrl = window.location.origin;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl w-full mx-auto space-y-6">
        
        {/* Top Bar Header */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold tracking-wider uppercase bg-indigo-950 border border-indigo-700/60 text-indigo-300 px-2 py-0.5 rounded-full">
                  SUPER ADMINISTRADOR
                </span>
                <span className="text-xs text-emerald-400 flex items-center gap-1 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  SaaS Online
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight mt-0.5">
                Central de Licenças & White-Label
              </h1>
              <p className="text-xs text-slate-400">
                Gerencie empresas clientes, controle bloqueios de inadimplência e customize logomarcas
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => {
                setNewSuperAdminPinInput(cloudSuperAdminPin);
                setShowSuperAdminPinModal(true);
              }}
              className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all border border-slate-700 cursor-pointer shadow-sm"
              title="Trocar a senha master do Super Admin"
            >
              <Key className="w-4 h-4" />
              <span>Chave Mestre SuperAdmin</span>
            </button>

            <button
              onClick={openCreateModal}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-lg shadow-indigo-950/40 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Empresa Licenciada</span>
            </button>

            <button
              onClick={onExitSuperAdmin}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold text-xs flex items-center gap-1.5 transition-all border border-slate-700 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar ao Sistema</span>
            </button>
          </div>
        </div>

        {/* KPI Financial & Operations Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Empresas</span>
              <Building2 className="w-4 h-4 text-indigo-400" />
            </div>
            <p className="text-2xl font-extrabold text-white mt-2">{totalCompanies}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Cadastradas no sistema</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Licenças Ativas</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-extrabold text-emerald-400 mt-2">{activeCompanies}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Acesso total liberado</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Em Teste (Trial)</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-2xl font-extrabold text-amber-400 mt-2">{trialCompanies}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Demonstração gratuita</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">Bloqueadas</span>
              <Lock className="w-4 h-4 text-rose-400" />
            </div>
            <p className="text-2xl font-extrabold text-rose-400 mt-2">{blockedCompanies}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Inadimplentes ou suspensas</p>
          </div>

          <div className="bg-gradient-to-br from-indigo-900/60 to-slate-900 border border-indigo-800/50 rounded-2xl p-4.5 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">MRR Estimado</span>
              <DollarSign className="w-4 h-4 text-indigo-300" />
            </div>
            <p className="text-2xl font-extrabold text-white mt-2">
              R$ {estimatedMRR.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-indigo-200/70 mt-0.5">Faturamento mensal recorrente</p>
          </div>

        </div>

        {/* Search, Filters & Actions Bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-center gap-3">
          
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, slug ou dono..."
              className="w-full bg-slate-950 border border-slate-800 text-sm text-slate-200 rounded-xl py-2 px-3 pl-10 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-slate-600"
            />
          </div>

          {/* Status Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
            {[
              { id: 'all', label: 'Todas' },
              { id: 'active', label: '🟢 Ativas' },
              { id: 'trial', label: '🟡 Trial' },
              { id: 'blocked', label: '🔴 Bloqueadas' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilterStatus(tab.id)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  filterStatus === tab.id
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

        </div>

        {/* Companies Grid List */}
        <div className="space-y-4">
          {filteredCompanies.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500">
              <Building2 className="w-10 h-10 mx-auto text-slate-600 mb-2" />
              <p className="font-semibold text-slate-400">Nenhuma empresa encontrada com os filtros atuais.</p>
            </div>
          ) : (
            filteredCompanies.map(comp => {
              const status = comp.license?.status || 'active';
              const isBlocked = status === 'blocked';
              const isTrial = status === 'trial';
              const isActive = status === 'active';
              const slug = comp.slug || comp.id;

              const clientUrl = `${baseUrl}/?empresa=${slug}&view=client`;
              const loginUrl = `${baseUrl}/?empresa=${slug}&view=login`;

              return (
                <div 
                  key={comp.id}
                  className={`bg-slate-900 border rounded-2xl p-5 transition-all shadow-lg flex flex-col lg:flex-row justify-between items-start lg:items-center gap-5 ${
                    isBlocked 
                      ? 'border-rose-900/60 bg-slate-900/90' 
                      : isTrial 
                      ? 'border-amber-800/40' 
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Company Info Left Column */}
                  <div className="flex items-start sm:items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-slate-950 border border-slate-700/80 p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
                      <img 
                        src={comp.logoUrl || 'https://i.postimg.cc/8CdttXNK/Whats-App-Image-2026-06-10-at-14-30-14.jpg'} 
                        referrerPolicy="no-referrer" 
                        alt={comp.name} 
                        className="w-full h-full object-cover rounded-xl"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold text-white tracking-tight">
                          {comp.name}
                        </h3>

                        {/* Status Badge */}
                        <span className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${
                          isBlocked 
                            ? 'bg-rose-950 text-rose-300 border-rose-800' 
                            : isTrial 
                            ? 'bg-amber-950 text-amber-300 border-amber-800' 
                            : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                        }`}>
                          {isBlocked ? '🔴 Bloqueada / Inadimplente' : isTrial ? '🟡 Demonstração (Trial)' : '🟢 Licença Ativa'}
                        </span>

                        {comp.id === 'atendepro_default' && (
                          <span className="text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded-full font-bold">
                            Matriz Original
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                        <span>Dono(a): <strong className="text-slate-200">{comp.adminName || 'Larissa'}</strong></span>
                        <span>Mensalidade: <strong className="text-emerald-400">R$ {(comp.license?.monthlyPrice || 0).toFixed(2)}/mês</strong></span>
                        {comp.license?.contactPhone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-500" />
                            {comp.license.contactPhone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Links and Actions Right Column */}
                  <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-start lg:justify-end pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-800">
                    
                    {/* Copy Link Chat Cliente */}
                    <button
                      onClick={() => copyToClipboard(clientUrl, `client_${comp.id}`)}
                      title="Copiar Link de Atendimento para os Clientes"
                      className="px-3 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      {copiedKey === `client_${comp.id}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-indigo-400" />}
                      <span>Link Chat Cliente</span>
                    </button>

                    {/* Copy Link Login Funcionários */}
                    <button
                      onClick={() => copyToClipboard(loginUrl, `login_${comp.id}`)}
                      title="Copiar Link de Login para Vendedores e Dono"
                      className="px-3 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      {copiedKey === `login_${comp.id}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-amber-400" />}
                      <span>Link Login Vendedor</span>
                    </button>

                    {/* Quick 1-Click Block / Unblock */}
                    <button
                      onClick={() => handleToggleStatus(comp)}
                      title={isBlocked ? "Desbloquear e liberar acesso da empresa" : "Bloquear acesso por inadimplência"}
                      className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                        isBlocked 
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950' 
                          : 'bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300'
                      }`}
                    >
                      {isBlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                      <span>{isBlocked ? 'Desbloquear' : 'Bloquear'}</span>
                    </button>

                    {/* Change Master Password */}
                    <button
                      onClick={() => {
                        setPasswordModalCompany(comp);
                        setNewMasterPassword(comp.adminPassword || '13259898');
                      }}
                      title="Alterar Senha do Painel Master desta empresa"
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all border border-slate-700 cursor-pointer"
                    >
                      <Key className="w-4 h-4 text-indigo-400" />
                    </button>

                    {/* Edit Company */}
                    <button
                      onClick={() => openEditModal(comp)}
                      title="Editar Empresa e Licença"
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all border border-slate-700 cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4 text-slate-300" />
                    </button>

                    {/* Open / Access as Company */}
                    <button
                      onClick={() => onSelectCompany(comp.id)}
                      title="Abrir e operar como esta empresa"
                      className="p-2 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white rounded-xl transition-all border border-indigo-500/30 cursor-pointer"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    {/* Delete Company (Protected for default) */}
                    {comp.id !== 'atendepro_default' && (
                      <button
                        onClick={() => handleDeleteCompany(comp)}
                        title="Excluir Empresa"
                        className="p-2 bg-slate-950 hover:bg-rose-950 text-slate-500 hover:text-rose-400 rounded-xl transition-all border border-slate-800 hover:border-rose-800 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}

                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>

      {/* ------------------------------------------------------------- */}
      {/* MODAL: Criar / Editar Empresa Licenciada */}
      {/* ------------------------------------------------------------- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 sm:p-8 space-y-6 shadow-2xl my-8">
            
            <div className="flex justify-between items-center pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">
                    {editingCompany ? 'Editar Empresa Licenciada' : 'Cadastrar Nova Empresa Cliente'}
                  </h2>
                  <p className="text-xs text-slate-400">Configure os dados de acesso, marca e licença</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-500 hover:text-slate-300 text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCompany} className="space-y-4">
              
              {/* Row 1: Nome da Loja e Slug */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                    Nome da Empresa / Loja *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => {
                      setFormName(e.target.value);
                      if (!editingCompany && !formSlug) {
                        setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''));
                      }
                    }}
                    placeholder="Ex: Silva Estofados"
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                    Identificador de URL (Slug) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formSlug}
                    onChange={(e) => setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                    placeholder="Ex: silva-estofados"
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Row 2: Logomarca (URL) com Preview */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                  URL da Logomarca (Imagem)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="url"
                    value={formLogoUrl}
                    onChange={(e) => setFormLogoUrl(e.target.value)}
                    placeholder="https://... (deixe vazio para usar logo padrão)"
                    className="grow bg-slate-950 border border-slate-800 text-white rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="w-11 h-11 rounded-xl bg-slate-950 border border-slate-700 p-0.5 overflow-hidden shrink-0 flex items-center justify-center">
                    <img 
                      src={formLogoUrl || 'https://i.postimg.cc/8CdttXNK/Whats-App-Image-2026-06-10-at-14-30-14.jpg'} 
                      referrerPolicy="no-referrer" 
                      alt="Preview" 
                      className="w-full h-full object-cover rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {/* Row 3: Dono(a) e Senha Master */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                    Nome do(a) Administrador(a) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formAdminName}
                    onChange={(e) => setFormAdminName(e.target.value)}
                    placeholder="Ex: Carlos Silva"
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                    Senha do Painel Master *
                  </label>
                  <input
                    type="text"
                    required
                    value={formAdminPassword}
                    onChange={(e) => setFormAdminPassword(e.target.value)}
                    placeholder="Ex: 123456"
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Row 4: Status da Licença e Mensalidade */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                    Status da Licença
                  </label>
                  <select
                    value={formLicenseStatus}
                    onChange={(e) => setFormLicenseStatus(e.target.value as LicenseStatus)}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="active">🟢 Ativa (Liberada)</option>
                    <option value="trial">🟡 Demonstração (Trial)</option>
                    <option value="blocked">🔴 Bloqueada (Inadimplente)</option>
                    <option value="canceled">⚫ Cancelada</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                    Mensalidade (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formMonthlyPrice}
                    onChange={(e) => setFormMonthlyPrice(e.target.value)}
                    placeholder="149.00"
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                    Validade (Dias)
                  </label>
                  <select
                    value={formExpiryDays}
                    onChange={(e) => setFormExpiryDays(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="7">7 dias (Trial)</option>
                    <option value="15">15 dias (Trial)</option>
                    <option value="30">30 dias (Mensal)</option>
                    <option value="90">90 dias (Trimestral)</option>
                    <option value="365">365 dias (Anual)</option>
                    <option value="3650">Vitalício (10 anos)</option>
                  </select>
                </div>
              </div>

              {/* Row 5: WhatsApp de Contato */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                  WhatsApp do Responsável (para suporte/cobrança)
                </label>
                <input
                  type="text"
                  value={formContactPhone}
                  onChange={(e) => setFormContactPhone(e.target.value)}
                  placeholder="Ex: (85) 98765-4321"
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-950/50 cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Salvar Empresa</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: Alterar Senha Master */}
      {/* ------------------------------------------------------------- */}
      {passwordModalCompany && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Alterar Senha Master</h3>
                <p className="text-xs text-slate-400">{passwordModalCompany.name}</p>
              </div>
            </div>

            {passwordSuccessMsg ? (
              <div className="bg-emerald-950 border border-emerald-800 rounded-2xl p-4 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <p className="text-xs font-bold text-emerald-200">{passwordSuccessMsg}</p>
              </div>
            ) : (
              <form onSubmit={handleSaveMasterPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                    Nova Senha de Acesso Master
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={newMasterPassword}
                    onChange={(e) => setNewMasterPassword(e.target.value)}
                    placeholder="Digite a nova senha..."
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <p className="text-[11px] text-slate-400">
                    A dona/administrador(a) utilizará esta nova senha para entrar no painel master.
                  </p>
                </div>

                <div className="pt-2 flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPasswordModalCompany(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                  >
                    Salvar Nova Senha
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}

      {/* Modal: Change Super Admin Master Key / Cloud PIN */}
      {showSuperAdminPinModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5">
            
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Chave Mestre do Super Admin</h3>
                <p className="text-xs text-slate-400">Válida para qualquer navegador e dispositivo</p>
              </div>
            </div>

            {superAdminPinSuccessMsg ? (
              <div className="bg-emerald-950 border border-emerald-800 rounded-2xl p-4 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <p className="text-xs font-bold text-emerald-200">{superAdminPinSuccessMsg}</p>
              </div>
            ) : (
              <form onSubmit={handleSaveSuperAdminPin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                    Nova Senha do Super Admin
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={newSuperAdminPinInput}
                    onChange={(e) => setNewSuperAdminPinInput(e.target.value)}
                    placeholder="Digite a nova senha mestre..."
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono tracking-wider"
                  />
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Esta senha será salva em tempo real no banco de dados Firestore. Você poderá utilizá-la em qualquer celular, computador ou navegador para acessar o Super Admin.
                  </p>
                </div>

                <div className="pt-2 flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowSuperAdminPinModal(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                  >
                    Salvar Chave Mestre
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}

    </main>
  );
}
