import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Company } from '../types';
import { 
  Shield, PlusCircle, Trash2, Lock, Unlock, Copy, Check, 
  ExternalLink, LogOut, Globe, Edit3, Save, X, RefreshCw 
} from 'lucide-react';

interface SaaSAdminDashboardProps {
  onBackToPortal: () => void;
}

export default function SaaSAdminDashboard({ onBackToPortal }: SaaSAdminDashboardProps) {
  const [password, setPassword] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(() => {
    return localStorage.getItem('crm_saas_authorized') === 'true';
  });
  const [errorMsg, setErrorMsg] = useState('');

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);

  // Form states for registering a new client company
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit states for customized block messages
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [customMsg, setCustomMsg] = useState('');
  const [isSavingMsg, setIsSavingMsg] = useState(false);

  // Copied indicator state to provide feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Master Access Secret Key (The master password)
  const MASTER_PASSWORD = 'master9911';

  const handleAuthorize = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === MASTER_PASSWORD) {
      setIsAuthorized(true);
      localStorage.setItem('crm_saas_authorized', 'true');
      setErrorMsg('');
    } else {
      setErrorMsg('Senha mestre incorreta! Tente novamente.');
    }
  };

  const handleLogoutAdmin = () => {
    setIsAuthorized(false);
    localStorage.removeItem('crm_saas_authorized');
    setPassword('');
  };

  // Fetch all companies registered in firestore
  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const colRef = collection(db, 'companies');
      const snapshot = await getDocs(colRef);
      const list: Company[] = [];
      snapshot.docs.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as Company);
      });
      // Sort alphabetically by name
      list.sort((a, b) => a.name.localeCompare(b.name));
      setCompanies(list);
    } catch (err) {
      console.error('Erro ao listar empresas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      fetchCompanies();
    }
  }, [isAuthorized]);

  const handleRegisterCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const cleanId = newId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const cleanName = newName.trim();

    if (!cleanId || !cleanName) {
      alert('Por favor, preencha todos os campos do formulário.');
      return;
    }

    // Check if ID already exists
    if (companies.some((c) => c.id === cleanId)) {
      alert(`O ID de empresa "${cleanId}" já está cadastrado. Escolha outro.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const companyRef = doc(db, 'companies', cleanId);
      const newCompany: Company = {
        id: cleanId,
        name: cleanName,
        createdAt: new Date().toISOString(),
        status: 'active',
        blockMessage: ''
      };

      await setDoc(companyRef, newCompany);
      
      // Auto register a default admin user for this company too
      const defaultAdminRef = doc(db, 'companies', cleanId, 'users', 'admin');
      await setDoc(defaultAdminRef, {
        id: 'admin',
        name: 'Gerente Administrador',
        password: 'admin',
        role: 'admin',
        createdAt: new Date().toISOString()
      });

      alert(`Empresa "${cleanName}" registrada com sucesso!\n\nLink de acesso:\n?c=${cleanId}\n\nUsuário Admin Padrão:\nUsuário: admin\nSenha: admin`);
      
      setNewId('');
      setNewName('');
      fetchCompanies();
    } catch (err) {
      console.error('Erro ao cadastrar empresa:', err);
      alert('Erro ao registrar empresa no banco.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (company: Company) => {
    const currentStatus = company.status || 'active';
    const newStatus = currentStatus === 'active' ? 'blocked' : 'active';
    
    const confirmMsg = newStatus === 'blocked' 
      ? `Tem certeza que deseja BLOQUEAR o acesso da empresa "${company.name}"? Todos os funcionários e clientes serão impedidos de utilizar o sistema.`
      : `Deseja REATIVAR o acesso da empresa "${company.name}"? O sistema voltará ao normal imediatamente.`;

    if (!confirm(confirmMsg)) return;

    try {
      const ref = doc(db, 'companies', company.id);
      await updateDoc(ref, { status: newStatus });
      
      // Update local state instantly
      setCompanies((prev) => 
        prev.map((c) => c.id === company.id ? { ...c, status: newStatus } : c)
      );
    } catch (err) {
      console.error('Erro ao alterar status:', err);
      alert('Erro ao persistir alteração no Firestore.');
    }
  };

  const handleSaveBlockMessage = async (companyId: string) => {
    setIsSavingMsg(true);
    try {
      const ref = doc(db, 'companies', companyId);
      await updateDoc(ref, { blockMessage: customMsg.trim() });
      
      setCompanies((prev) => 
        prev.map((c) => c.id === companyId ? { ...c, blockMessage: customMsg.trim() } : c)
      );
      setEditingCompanyId(null);
      alert('Mensagem de bloqueio atualizada com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar mensagem:', err);
      alert('Erro ao atualizar mensagem de bloqueio.');
    } finally {
      setIsSavingMsg(false);
    }
  };

  const handleDeleteCompany = async (company: Company) => {
    const firstConfirm = confirm(`⚠️ ALERTA CRÍTICO: Você tem certeza que deseja EXCLUIR DEFINITIVAMENTE a empresa "${company.name}" (${company.id})? Todos os dados, chats, usuários e logs serão deletados permanentemente. Esta ação NÃO tem volta!`);
    if (!firstConfirm) return;

    const secondConfirm = confirm(`Confirmação final: Digite "SIM" para excluir.`);
    if (!secondConfirm) return;

    try {
      const ref = doc(db, 'companies', company.id);
      await deleteDoc(ref);
      setCompanies((prev) => prev.filter((c) => c.id !== company.id));
      alert(`Empresa "${company.name}" deletada com sucesso!`);
    } catch (err) {
      console.error('Erro ao deletar:', err);
      alert('Erro ao deletar empresa do banco.');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Login Screen of SaaS Manager
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 py-12 font-sans select-none relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[450px] h-[450px] rounded-full bg-indigo-500/10 blur-3xl -z-10 pointer-events-none"></div>

        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col items-center text-center space-y-4 mb-8">
            <div className="h-14 w-14 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Shield className="w-7 h-7" id="saas-lock-header-icon" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-100 uppercase tracking-wide">Controle Geral SaaS</h2>
              <p className="text-xs text-slate-400 mt-1">Insira a senha mestre para gerenciar mensalidades e empresas clientes</p>
            </div>
          </div>

          <form onSubmit={handleAuthorize} className="space-y-5">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2">
                Senha Mestre de Segurança
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ex: master9911"
                className="w-full bg-slate-950 text-slate-200 placeholder-slate-600 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-all font-mono"
              />
            </div>

            {errorMsg && (
              <div className="bg-rose-950/40 border border-rose-800 rounded-xl p-3 text-rose-300 text-xs text-center font-medium">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-3 text-sm font-bold tracking-wide transition-all shadow-lg shadow-indigo-600/35 cursor-pointer"
            >
              Autenticar Administrador
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={onBackToPortal}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              ← Voltar para Menu Larissa Móveis
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Upper Header control block */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-950/70 border border-slate-800 rounded-3xl p-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold tracking-wider text-indigo-400 bg-indigo-950/50 px-2 py-0.5 rounded-full uppercase">SaaS Multi-Empresa</span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              </div>
              <h1 className="text-2xl font-black text-slate-100">Painel do Revendedor</h1>
              <p className="text-xs text-slate-400">Gerência de licenças, bloqueio de inadimplentes e cadastro de novas empresas</p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <button
              onClick={fetchCompanies}
              className="p-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
              title="Atualizar dados"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : 'text-slate-400'}`} />
            </button>
            <button
              onClick={handleLogoutAdmin}
              className="text-xs bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-xl px-4 py-2 flex items-center gap-1.5 transition-all text-slate-300 font-bold cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair do SaaS</span>
            </button>
            <button
              onClick={onBackToPortal}
              className="text-xs bg-indigo-600 text-white hover:bg-indigo-500 rounded-xl px-4 py-2 font-bold cursor-pointer transition-all"
            >
              Ver Larissa Móveis
            </button>
          </div>
        </div>

        {/* Central columns */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Form left col - registration of new companies */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-slate-950/50 border border-slate-800 rounded-3xl p-6">
              <h2 className="text-lg font-extrabold text-slate-100 mb-4 flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-indigo-400" />
                <span>Cadastrar Nova Empresa</span>
              </h2>

              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                Crie um ambiente isolado para um novo cliente. Ele receberá um banco de dados próprio e credenciais de gerente para criar seus próprios vendedores.
              </p>

              <form onSubmit={handleRegisterCompany} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-1.5">
                    Identificador (Link / ID)
                  </label>
                  <input
                    type="text"
                    required
                    value={newId}
                    onChange={(e) => setNewId(e.target.value)}
                    placeholder="Ex: moveis_silva ou loja_natal"
                    className="w-full bg-slate-900 text-slate-200 placeholder-slate-600 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Apenas letras minúsculas, números, hífen e underline. Sem espaços ou acentos.
                  </span>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-1.5">
                    Nome Comercial da Empresa
                  </label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Ex: Móveis Silva & Cia"
                    className="w-full bg-slate-900 text-slate-200 placeholder-slate-600 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-3 text-xs font-extrabold transition-all cursor-pointer shadow-md"
                >
                  {isSubmitting ? 'Cadastrando no Firestore...' : 'Cadastrar Empresa (SaaS)'}
                </button>
              </form>
            </div>

            <div className="bg-slate-950/20 border border-slate-800/60 rounded-3xl p-6">
              <h3 className="text-sm font-bold text-indigo-300 mb-2">💡 Instruções Rápidas:</h3>
              <ul className="text-xs text-slate-400 space-y-2 leading-relaxed">
                <li>• Cada empresa cadastrada tem sua própria URL exclusiva.</li>
                <li>• Ao criar a empresa, o usuário administrador principal é criado automaticamente como <strong className="text-indigo-400 font-mono">admin</strong> (senha <strong className="text-indigo-400 font-mono">admin</strong>).</li>
                <li>• Se o cliente atrasar a mensalidade, basta clicar no botão <strong className="text-rose-400">Ativo</strong> para bloqueá-lo.</li>
              </ul>
            </div>
          </div>

          {/* Companies list right col */}
          <div className="lg:col-span-8">
            <div className="bg-slate-950/40 border border-slate-800 rounded-3xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-extrabold text-slate-100">
                  Empresas Cadastradas ({companies.length})
                </h2>
                {loading && (
                  <span className="text-xs text-indigo-400 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-indigo-500 animate-ping"></span>
                    Sincronizando...
                  </span>
                )}
              </div>

              {companies.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl">
                  <Globe className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-400">Nenhuma empresa cadastrada no SaaS.</p>
                  <p className="text-xs text-slate-500 mt-1">Preencha o formulário ao lado para começar.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {companies.map((company) => {
                    const isCompanyBlocked = company.status === 'blocked';
                    const mainUrl = `${window.location.origin}/?c=${company.id}`;
                    const panelUrl = `${window.location.origin}/?c=${company.id}&view=login`;
                    const portalUrl = `${window.location.origin}/?c=${company.id}&view=portal`;

                    return (
                      <div 
                        key={company.id} 
                        className={`border rounded-2xl p-5 transition-all relative ${
                          isCompanyBlocked 
                            ? 'bg-rose-950/10 border-rose-900/60 shadow-lg shadow-rose-950/10' 
                            : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {/* Upper row: ID, Name, CreatedDate */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 border-b border-slate-800/80 pb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-base text-slate-100">{company.name}</h3>
                              <span className="text-[10px] font-bold font-mono bg-indigo-950/60 border border-indigo-900 text-indigo-300 px-2 py-0.5 rounded-full">
                                ID: {company.id}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
                              Criada em: {company.createdAt ? new Date(company.createdAt).toLocaleString('pt-BR') : 'Sem registro'}
                            </span>
                          </div>

                          {/* Action Controls Toggles */}
                          <div className="flex items-center gap-2">
                            {/* BLOCK/UNBLOCK BUTTON */}
                            <button
                              onClick={() => handleToggleStatus(company)}
                              className={`text-xs px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                                isCompanyBlocked
                                  ? 'bg-rose-900 hover:bg-rose-850 text-rose-50 border border-rose-700 shadow-md'
                                  : 'bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-800'
                              }`}
                            >
                              {isCompanyBlocked ? (
                                <>
                                  <Lock className="w-3.5 h-3.5 animate-pulse text-rose-400" />
                                  <span>SUSPENSO</span>
                                </>
                              ) : (
                                <>
                                  <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>LIBERADO</span>
                                </>
                              )}
                            </button>

                            {/* DELETE BUTTON (only accessible with confirmations) */}
                            {company.id !== 'atendepro_default' && (
                              <button
                                onClick={() => handleDeleteCompany(company)}
                                className="p-2 bg-slate-800 border border-slate-700 hover:bg-rose-950 hover:border-rose-800 text-slate-400 hover:text-rose-300 rounded-xl transition-all cursor-pointer"
                                title="Excluir Empresa Definitivamente"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Middle row: Editable blockage custom message panel */}
                        {isCompanyBlocked && (
                          <div className="bg-rose-950/30 border border-rose-900/40 rounded-xl p-3 mb-4 text-xs">
                            {editingCompanyId === company.id ? (
                              <div className="space-y-2">
                                <label className="block text-[10px] text-rose-300 font-bold uppercase tracking-wide">
                                  Editar Mensagem Exibida Ao Cliente/Vendedor Bloqueado:
                                </label>
                                <textarea
                                  value={customMsg}
                                  onChange={(e) => setCustomMsg(e.target.value)}
                                  placeholder="Ex: Sua assinatura expirou. Regularize pendências pelo WhatsApp (85) 99999-9999"
                                  className="w-full bg-slate-950 border border-rose-900/60 rounded-xl p-2.5 text-rose-100 placeholder-rose-900/60 text-xs focus:outline-none"
                                  rows={2}
                                />
                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={() => setEditingCompanyId(null)}
                                    className="p-1 px-2.5 bg-slate-850 border border-slate-700 hover:bg-slate-800 rounded-lg text-slate-400 flex items-center gap-1 cursor-pointer"
                                  >
                                    <X className="w-3 h-3" />
                                    <span>Cancelar</span>
                                  </button>
                                  <button
                                    onClick={() => handleSaveBlockMessage(company.id)}
                                    disabled={isSavingMsg}
                                    className="p-1 px-2.5 bg-rose-900 hover:bg-rose-850 rounded-lg text-rose-50 flex items-center gap-1 font-bold cursor-pointer"
                                  >
                                    <Save className="w-3 h-3" />
                                    <span>{isSavingMsg ? 'Salvando...' : 'Salvar'}</span>
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <span className="font-bold text-rose-400 uppercase tracking-widest text-[9px] block mb-0.5">MENSAGEM DE SUSPENSÃO:</span>
                                  <p className="text-rose-200">
                                    {company.blockMessage || '⚠️ Esta empresa está temporariamente suspensa. Regularize com o administrador.'}
                                  </p>
                                </div>
                                <button
                                  onClick={() => {
                                    setEditingCompanyId(company.id);
                                    setCustomMsg(company.blockMessage || '');
                                  }}
                                  className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-bold mt-1 text-[11px] cursor-pointer"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>Editar</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Lower row: URLs & Access Links */}
                        <div className="bg-slate-950/30 border border-slate-800/80 rounded-xl p-3 space-y-2 text-xs">
                          <span className="font-bold text-[9px] tracking-wider text-slate-500 uppercase">Links Úteis gerados para {company.name}:</span>
                          
                          {/* Client Support Widget link */}
                          <div className="flex items-center justify-between gap-3 border-b border-slate-900/40 pb-1.5 pt-0.5">
                            <span className="text-slate-400 font-mono text-[10px] w-28 shrink-0">💬 Link do Cliente:</span>
                            <span className="text-indigo-300 font-mono select-all truncate text-[11px] hover:underline" title={mainUrl}>{mainUrl}</span>
                            <div className="flex gap-1">
                              <button
                                onClick={() => copyToClipboard(mainUrl, company.id + '-client')}
                                className="p-1 bg-slate-900 border border-slate-800 hover:bg-slate-850 rounded text-slate-400 hover:text-indigo-400 transition-colors cursor-pointer"
                                title="Copiar Link do Cliente"
                              >
                                {copiedId === company.id + '-client' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                              <a
                                href={mainUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1 bg-slate-900 border border-slate-800 hover:bg-slate-850 rounded text-slate-400 hover:text-slate-100 transition-colors flex items-center"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          </div>

                          {/* Seller Signin Dashboard Link */}
                          <div className="flex items-center justify-between gap-3 border-b border-slate-900/40 pb-1.5">
                            <span className="text-slate-400 font-mono text-[10px] w-28 shrink-0">💼 Painel Vendedor:</span>
                            <span className="text-indigo-300 font-mono select-all truncate text-[11px] hover:underline" title={panelUrl}>{panelUrl}</span>
                            <div className="flex gap-1">
                              <button
                                onClick={() => copyToClipboard(panelUrl, company.id + '-panel')}
                                className="p-1 bg-slate-900 border border-slate-800 hover:bg-slate-850 rounded text-slate-400 hover:text-indigo-400 transition-colors cursor-pointer"
                                title="Copiar Link de Login"
                              >
                                {copiedId === company.id + '-panel' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                              <a
                                href={panelUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1 bg-slate-900 border border-slate-800 hover:bg-slate-850 rounded text-slate-400 hover:text-slate-100 transition-colors flex items-center"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          </div>

                          {/* Dual Portal Selection Link */}
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-slate-400 font-mono text-[10px] w-28 shrink-0">🧭 Portal Geral:</span>
                            <span className="text-indigo-300 font-mono select-all truncate text-[11px] hover:underline" title={portalUrl}>{portalUrl}</span>
                            <div className="flex gap-1">
                              <button
                                onClick={() => copyToClipboard(portalUrl, company.id + '-portal')}
                                className="p-1 bg-slate-900 border border-slate-800 hover:bg-slate-850 rounded text-slate-400 hover:text-indigo-400 transition-colors cursor-pointer"
                                title="Copiar Link do Portal"
                              >
                                {copiedId === company.id + '-portal' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                              <a
                                href={portalUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1 bg-slate-900 border border-slate-800 hover:bg-slate-850 rounded text-slate-400 hover:text-slate-100 transition-colors flex items-center"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
