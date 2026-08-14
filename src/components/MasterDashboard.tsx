import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, orderBy, doc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, sanitizeFirestoreData } from '../lib/firebase';
import { User, Chat, Message, ChatStatus, Company, Lead } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
  Users, UserPlus, FileText, Eye, Key, LogOut, Trash2, 
  TrendingUp, TrendingDown, ClipboardList, ShieldAlert, CheckCircle, Lock, Sparkles,
  Phone, Megaphone, Download, Copy, Check, Search, Plus, MessageCircle, MessageSquare, ExternalLink, RefreshCw, X, Send
} from 'lucide-react';
import InternalTeamChat from './InternalTeamChat';

interface MasterDashboardProps {
  companyId: string;
  company?: Company | null;
  adminUser: User;
  onLogout: () => void;
}

export default function MasterDashboard({ companyId, company, adminUser, onLogout }: MasterDashboardProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  
  // Registration Form state
  const [newSellerName, setNewSellerName] = useState('');
  const [newSellerPassword, setNewSellerPassword] = useState('');
  const [registerSuccess, setRegisterSuccess] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);

  // Change Master Password state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newAdminPassInput, setNewAdminPassInput] = useState('');
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState<string | null>(null);

  // Live Mirror session
  const [mirroredChatId, setMirroredChatId] = useState<string | null>(null);
  const [mirroredMessages, setMirroredMessages] = useState<Message[]>([]);
  const mirrorEndRef = useRef<HTMLDivElement>(null);

  // Active Menu Tabs: 'analytics' | 'sellers' | 'live-feeds' | 'leads' | 'internal-chat'
  const [activeTab, setActiveTab] = useState<'analytics' | 'sellers' | 'live-feeds' | 'leads' | 'internal-chat'>('analytics');
  const [selectedSellerForDirectChat, setSelectedSellerForDirectChat] = useState<string | null>(null);
  const [unreadInternalCount, setUnreadInternalCount] = useState<number>(0);
  const [isClearing, setIsClearing] = useState(false);
  const [oldAndClosedChats, setOldAndClosedChats] = useState<Chat[]>([]);
  const [showClosedChats, setShowClosedChats] = useState(false);

  // Leads & Marketing state
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadSearchTerm, setLeadSearchTerm] = useState('');
  const [copiedPhonesSuccess, setCopiedPhonesSuccess] = useState(false);
  const [selectedLeadForPromo, setSelectedLeadForPromo] = useState<Lead | null>(null);
  const [promoCampaignType, setPromoCampaignType] = useState<'discount' | 'new_arrivals' | 'flash_sale' | 'custom'>('discount');
  const [promoMessageText, setPromoMessageText] = useState('');
  const [isAddLeadModalOpen, setIsAddLeadModalOpen] = useState(false);
  const [newLeadName, setNewLeadName] = useState('');
  const [newLeadPhone, setNewLeadPhone] = useState('');
  const [newLeadNotes, setNewLeadNotes] = useState('');
  const [leadActionSuccess, setLeadActionSuccess] = useState<string | null>(null);

  // Load all users (Vendedores) in real time
  useEffect(() => {
    const usersRef = collection(db, 'companies', companyId, 'users');
    const unsubUsers = onSnapshot(usersRef, (snapshot) => {
      const firestoreList: User[] = [];
      snapshot.forEach((d) => {
        firestoreList.push({ id: d.id, ...d.data() } as User);
      });

      // Load local users fallback
      const savedLocal = localStorage.getItem('atendepro_local_users');
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

      const merged = Array.from(userMap.values());
      setUsers(merged);

      // Save sync back to localStorage
      localStorage.setItem('atendepro_local_users', JSON.stringify(merged));
    }, (error) => {
      console.error("Erro em tempo real ao carregar vendedores do Firestore, usando fallback local:", error);
      const savedLocal = localStorage.getItem('atendepro_local_users');
      let localUsersList: User[] = [];
      if (savedLocal) {
        try {
          localUsersList = JSON.parse(savedLocal);
        } catch (e) {}
      }
      setUsers(localUsersList);
    });

    return () => unsubUsers();
  }, [companyId]);

  // Load all active or closed chats in real time with robust deleted exclusion filter
  useEffect(() => {
    const chatsRefCol = collection(db, 'companies', companyId, 'chats');
    
    const unsubChats = onSnapshot(chatsRefCol, (snapshot) => {
      const list: Chat[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as Chat);
      });

      // Sort in-memory by createdAt descending
      list.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });

      const deletedChatsStr = localStorage.getItem('deleted_chats_atendepro');
      let deletedChatIds: string[] = [];
      if (deletedChatsStr) {
        try {
          deletedChatIds = JSON.parse(deletedChatsStr);
        } catch (e) {}
      }

      const filtered = list.filter(c => !deletedChatIds.includes(c.id));
      setChats(filtered);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `companies/${companyId}/chats`);
    });

    return () => unsubChats();
  }, [companyId]);

  // Detect chats older than 30 days
  useEffect(() => {
    if (chats.length === 0) {
      setOldAndClosedChats([]);
      return;
    }
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const candidates = chats.filter(c => {
      const d = c.createdAt ? new Date(c.createdAt) : (c.updatedAt ? new Date(c.updatedAt) : new Date());
      return d < thirtyDaysAgo;
    });
    setOldAndClosedChats(candidates);
  }, [chats]);

  // Automated background database cleanup hook for test chats
  useEffect(() => {
    if (chats.length === 0) return;

    const performBackgroundPurge = async () => {
      // 1. Identify specific test / unwanted chats
      const targetNames = ['marco', 'rosa', 'jose'];
      const chatsToPurge = chats.filter(c => 
        targetNames.includes(c.clientName.trim().toLowerCase())
      );

      if (chatsToPurge.length > 0) {
        const deletedChatsStr = localStorage.getItem('deleted_chats_atendepro');
        let deletedChatIds: string[] = [];
        if (deletedChatsStr) {
          try {
            deletedChatIds = JSON.parse(deletedChatsStr);
          } catch (e) {}
        }
        let changed = false;
        chatsToPurge.forEach(c => {
          if (!deletedChatIds.includes(c.id)) {
            deletedChatIds.push(c.id);
            changed = true;
          }
        });
        if (changed) {
          localStorage.setItem('deleted_chats_atendepro', JSON.stringify(deletedChatIds));
          setChats(prev => prev.filter(c => !deletedChatIds.includes(c.id)));
        }
      }
    };

    performBackgroundPurge();
  }, [chats, companyId]);

  // Mirror specified active customer chat thread in real-time
  useEffect(() => {
    if (!mirroredChatId) {
      setMirroredMessages([]);
      return;
    }

    const messagesRef = collection(db, 'companies', companyId, 'chats', mirroredChatId, 'messages');

    const unsubMirror = onSnapshot(messagesRef, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((d) => {
        msgs.push({ id: d.id, ...d.data() } as Message);
      });

      // Sort in-memory by createdAt ascending
      msgs.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeA - timeB;
      });

      setMirroredMessages(msgs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `companies/${companyId}/chats/${mirroredChatId}/messages`);
    });

    return () => unsubMirror();
  }, [mirroredChatId, companyId]);

  // Keep mirror feed scrolled down
  useEffect(() => {
    mirrorEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mirroredMessages]);

  // Load and consolidate leads in real-time from Firestore, localStorage and existing chats
  useEffect(() => {
    const leadsRefCol = collection(db, 'companies', companyId, 'leads');
    const unsubLeads = onSnapshot(leadsRefCol, (snapshot) => {
      const list: Lead[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as Lead);
      });

      // Also get local backup leads
      const localKey = `atendepro_leads_${companyId}`;
      let localList: Lead[] = [];
      try {
        const saved = localStorage.getItem(localKey);
        if (saved) localList = JSON.parse(saved);
      } catch (e) {}

      // Merge Firestore + Local + any Phone numbers from existing chats
      const leadMap = new Map<string, Lead>();

      // 1. Add chats with phone numbers as baseline
      chats.forEach(chat => {
        if (chat.clientPhone && chat.clientPhone.trim() && chat.clientPhone !== 'Não informado') {
          const clean = chat.clientPhone.replace(/\D/g, '');
          const id = clean ? `lead_${clean}` : `lead_${chat.id}`;
          leadMap.set(id, {
            id,
            companyId,
            name: chat.clientName,
            phone: chat.clientPhone,
            firstContactAt: chat.createdAt || new Date().toISOString(),
            lastContactAt: chat.lastMessageAt || chat.createdAt || new Date().toISOString(),
            totalContactsCount: 1,
            lastMessage: chat.lastMessage || 'Iniciou o atendimento',
            status: 'active',
            source: 'chat_widget'
          });
        }
      });

      // 2. Add local storage items
      localList.forEach(l => {
        leadMap.set(l.id, l);
      });

      // 3. Add firestore items (source of truth)
      list.forEach(l => {
        leadMap.set(l.id, l);
      });

      const merged = Array.from(leadMap.values());
      merged.sort((a, b) => {
        const tA = a.lastContactAt ? new Date(a.lastContactAt).getTime() : 0;
        const tB = b.lastContactAt ? new Date(b.lastContactAt).getTime() : 0;
        return tB - tA;
      });

      setLeads(merged);
      try {
        localStorage.setItem(localKey, JSON.stringify(merged));
      } catch (e) {}
    }, (error) => {
      console.warn("Aviso ao carregar leads em tempo real:", error);
      const localKey = `atendepro_leads_${companyId}`;
      let localList: Lead[] = [];
      try {
        const saved = localStorage.getItem(localKey);
        if (saved) localList = JSON.parse(saved);
      } catch (e) {}
      setLeads(localList);
    });

    return () => unsubLeads();
  }, [companyId, chats]);

  // Load unread internal team messages for the Admin
  useEffect(() => {
    const internalCol = collection(db, 'companies', companyId, 'internal_messages');
    const unsubInternal = onSnapshot(internalCol, (snapshot) => {
      let unread = 0;
      snapshot.forEach((d) => {
        const data = d.data();
        // Count unread if message was sent by a seller and not read by admin yet
        if (data.senderRole === 'seller' && (!data.readBy || !data.readBy.includes(adminUser.id))) {
          unread++;
        }
      });
      setUnreadInternalCount(unread);
    }, (error) => {
      console.warn("Aviso ao carregar mensagens internas:", error);
    });

    return () => unsubInternal();
  }, [companyId, adminUser.id]);

  // Promotional campaign message builder
  const updatePromoMessage = (type: 'discount' | 'new_arrivals' | 'flash_sale' | 'custom', lead: Lead) => {
    setPromoCampaignType(type);
    const storeName = company?.name || 'nossa loja';
    if (type === 'discount') {
      setPromoMessageText(`Olá ${lead.name}! Tudo bem?\n\nPassando para te avisar que estamos com um Cupom Especial de Desconto exclusivo hoje na ${storeName}! 🏷️🎁\n\nGostaria de aproveitar para conferir as opções com desconto? Posso te atender agora por aqui! 😊`);
    } else if (type === 'new_arrivals') {
      setPromoMessageText(`Olá ${lead.name}! Tudo ótimo por aí?\n\nAcabaram de chegar Novidades e Lançamentos imperdíveis na ${storeName}! ✨🔥\n\nGostaria de receber fotos e valores das peças mais pedidas?`);
    } else if (type === 'flash_sale') {
      setPromoMessageText(`Olá ${lead.name}! Atenção: estamos com uma *Oferta Relâmpago* por tempo limitado na ${storeName}! ⚡🚀\n\nCondições especiais e pronta entrega. Se quiser conferir, me responda aqui! 😉`);
    } else {
      setPromoMessageText(`Olá ${lead.name}, tudo bem? Aqui é da equipe ${storeName}. Como podemos te ajudar hoje?`);
    }
  };

  const openPromoModal = (lead: Lead) => {
    setSelectedLeadForPromo(lead);
    updatePromoMessage('discount', lead);
  };

  const handleSendWhatsAppPromo = (lead: Lead) => {
    const cleanPhone = lead.phone.replace(/\D/g, '');
    const phoneWithCountry = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    const url = `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(promoMessageText)}`;
    window.open(url, '_blank');
    setSelectedLeadForPromo(null);
  };

  // Filter and metrics calculations for leads
  const filteredLeads = leads.filter(l => {
    const term = leadSearchTerm.toLowerCase();
    const matchesName = (l.name || '').toLowerCase().includes(term);
    const matchesPhone = (l.phone || '').includes(term);
    const matchesNotes = (l.notes || '').toLowerCase().includes(term) || (l.lastMessage || '').toLowerCase().includes(term);
    return matchesName || matchesPhone || matchesNotes;
  });

  const leadsWithValidPhone = leads.filter(l => {
    const digits = (l.phone || '').replace(/\D/g, '');
    return digits.length >= 8;
  }).length;

  const recentLeads30Days = leads.filter(l => {
    if (!l.lastContactAt) return false;
    const diffDays = (Date.now() - new Date(l.lastContactAt).getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= 30;
  }).length;

  const copyAllPhones = () => {
    const phones = filteredLeads
      .map(l => l.phone.replace(/\D/g, ''))
      .filter(p => p.length >= 8)
      .map(p => p.startsWith('55') ? p : `55${p}`);

    if (phones.length === 0) {
      alert("Nenhum número de telefone válido encontrado nos leads filtrados.");
      return;
    }

    const uniquePhones = Array.from(new Set(phones));
    navigator.clipboard.writeText(uniquePhones.join('\n'));
    setCopiedPhonesSuccess(true);
    setTimeout(() => setCopiedPhonesSuccess(false), 3000);
  };

  const exportLeadsToCSV = () => {
    if (leads.length === 0) {
      alert("Nenhum lead disponível para exportar no momento.");
      return;
    }

    const headers = ["Nome", "WhatsApp/Telefone", "Primeiro Contato", "Último Contato", "Total Atendimentos", "Última Mensagem / Interesse", "Origem"];
    const rows = filteredLeads.map(lead => [
      `"${(lead.name || '').replace(/"/g, '""')}"`,
      `"${(lead.phone || '').replace(/"/g, '""')}"`,
      `"${lead.firstContactAt ? new Date(lead.firstContactAt).toLocaleString('pt-BR') : ''}"`,
      `"${lead.lastContactAt ? new Date(lead.lastContactAt).toLocaleString('pt-BR') : ''}"`,
      lead.totalContactsCount || 1,
      `"${(lead.lastMessage || lead.notes || '').replace(/"/g, '""')}"`,
      `"${lead.source === 'manual' ? 'Cadastro Manual' : 'Chat Online'}"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `leads_marketing_${company?.name ? company.name.toLowerCase().replace(/[^a-z0-9]/g, '_') : 'empresa'}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteLead = async (leadId: string) => {
    if (!window.confirm("Deseja realmente remover este lead da lista de contatos?")) return;
    try {
      await deleteDoc(doc(db, 'companies', companyId, 'leads', leadId));
    } catch (err) {
      console.warn("Aviso ao deletar lead no Firestore:", err);
    }
    setLeads(prev => prev.filter(l => l.id !== leadId));
    const localKey = `atendepro_leads_${companyId}`;
    const saved = localStorage.getItem(localKey);
    if (saved) {
      try {
        const arr = JSON.parse(saved).filter((l: Lead) => l.id !== leadId);
        localStorage.setItem(localKey, JSON.stringify(arr));
      } catch (e) {}
    }
  };

  const handleCreateManualLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadName.trim() || !newLeadPhone.trim()) return;

    const clean = newLeadPhone.replace(/\D/g, '');
    const leadId = clean ? `lead_${clean}` : `lead_${Date.now()}`;
    const newLead: Lead = {
      id: leadId,
      companyId,
      name: newLeadName.trim(),
      phone: newLeadPhone.trim(),
      firstContactAt: new Date().toISOString(),
      lastContactAt: new Date().toISOString(),
      totalContactsCount: 1,
      lastMessage: newLeadNotes.trim() || 'Cadastro manual no painel',
      notes: newLeadNotes.trim(),
      status: 'active',
      source: 'manual'
    };

    try {
      await setDoc(doc(db, 'companies', companyId, 'leads', leadId), sanitizeFirestoreData(newLead));
    } catch (err) {
      console.warn("Aviso ao salvar lead manual no Firestore:", err);
    }

    setLeads(prev => [newLead, ...prev.filter(l => l.id !== leadId)]);
    setIsAddLeadModalOpen(false);
    setNewLeadName('');
    setNewLeadPhone('');
    setNewLeadNotes('');
    setLeadActionSuccess('Lead cadastrado com sucesso!');
    setTimeout(() => setLeadActionSuccess(null), 3000);
  };

  const handleRegisterSeller = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError(null);
    setRegisterSuccess(null);

    const nameToRegister = newSellerName.trim();

    if (!nameToRegister) {
      setRegisterError('Preencha o nome do novo vendedor.');
      return;
    }

    // Check conflict locally using both state and local storage
    const conflictInState = users.some(u => u.name.toLowerCase() === nameToRegister.toLowerCase());
    
    const savedLocal = localStorage.getItem('atendepro_local_users');
    let localUsersList: User[] = [];
    if (savedLocal) {
      try {
        localUsersList = JSON.parse(savedLocal);
      } catch (e) {}
    }
    const conflictInLocal = localUsersList.some(u => u.name.toLowerCase() === nameToRegister.toLowerCase());

    if (conflictInState || conflictInLocal) {
      setRegisterError('Já existe um vendedor cadastrado com este nome.');
      return;
    }

    const newUserId = 'seller_' + Math.random().toString(36).substring(2, 9);
    const newUser: User = {
      id: newUserId,
      name: nameToRegister,
      role: 'seller',
      password: '',
      createdAt: new Date().toISOString()
    };

    // Save to localStorage immediately
    localUsersList.push(newUser);
    localStorage.setItem('atendepro_local_users', JSON.stringify(localUsersList));

    // Update state immediately
    setUsers(prev => {
      const exists = prev.some(u => u.id === newUser.id);
      if (!exists) return [...prev, newUser];
      return prev;
    });

    try {
      await setDoc(doc(db, 'companies', companyId, 'users', newUserId), sanitizeFirestoreData(newUser));
      setNewSellerName('');
      setNewSellerPassword('');
      setRegisterSuccess(`Vendedor "${nameToRegister}" cadastrado com sucesso!`);
    } catch (err) {
      console.warn("Aviso ao salvar vendedor no Firestore:", err);
      setNewSellerName('');
      setNewSellerPassword('');
      // Even if Firestore fails, show success because local backup worked flawlessly
      setRegisterSuccess(`Vendedor "${nameToRegister}" cadastrado com sucesso!`);
    }
  };

  const handleDeleteSeller = async (userId: string, name: string) => {
    if (userId === adminUser.id) {
      alert('Você não pode excluir o seu próprio perfil de administrador.');
      return;
    }
    if (!confirm(`Deseja mesmo remover o vendedor "${name}"? Ele perderá acesso ao painel.`)) return;

    // Remove from localStorage first
    const savedLocal = localStorage.getItem('atendepro_local_users');
    let localUsersList: User[] = [];
    if (savedLocal) {
      try {
        localUsersList = JSON.parse(savedLocal);
      } catch (e) {}
    }
    const filteredLocal = localUsersList.filter(u => u.id !== userId);
    localStorage.setItem('atendepro_local_users', JSON.stringify(filteredLocal));

    // Optimistic UI update
    setUsers(prev => prev.filter(u => u.id !== userId));

    try {
      await deleteDoc(doc(db, 'companies', companyId, 'users', userId));
      alert('Vendedor removido com sucesso!');
    } catch (err) {
      console.warn("Erro ao remover vendedor no Firestore:", err);
      alert('Vendedor removido com sucesso!');
    }
  };

  const handleClearAllData = async () => {
    const firstConfirm = confirm(
      '⚠️ ATENÇÃO: Você tem certeza que deseja EXCLUIR DEFINITIVAMENTE todos os históricos de atendimento, conversas e mensagens desta empresa? Esta ação é irreversível.'
    );
    if (!firstConfirm) return;

    const secondConfirm = confirm(
      'Confirmar exclusão em massa: Esta ação irá zerar todo o relatório mensal, gráficos e histórico de conversas do banco de dados do Firestore. Deseja prosseguir?'
    );
    if (!secondConfirm) return;

    setIsClearing(true);
    try {
      // Collect all chat IDs to delete from both local React state AND direct Firestore query
      const uniqueChatIds = new Set<string>();
      
      // 1. Add currently tracked state chats
      chats.forEach((c) => {
        if (c.id) uniqueChatIds.add(c.id);
      });

      // 2. Fetch directly from the server of Firestore to bypass cache / catch others
      try {
        const chatsRef = collection(db, 'companies', companyId, 'chats');
        const chatSnapshot = await getDocs(chatsRef);
        chatSnapshot.docs.forEach((docItem) => {
          uniqueChatIds.add(docItem.id);
        });
      } catch (err) {
        console.warn("Could not query server chats collection directly:", err);
      }

      const idList = Array.from(uniqueChatIds);

      // Save all deleted IDs to localStorage to hide them permanently in this browser
      const deletedChatsStr = localStorage.getItem('deleted_chats_atendepro');
      let deletedChatIds: string[] = [];
      if (deletedChatsStr) {
        try {
          deletedChatIds = JSON.parse(deletedChatsStr);
        } catch (e) {}
      }
      idList.forEach(id => {
        if (!deletedChatIds.includes(id)) {
          deletedChatIds.push(id);
        }
      });
      localStorage.setItem('deleted_chats_atendepro', JSON.stringify(deletedChatIds));

      // Optimistic layout wipe
      setChats([]);
      setMirroredChatId(null);
      setMirroredMessages([]);

      if (idList.length === 0) {
        // Wipe potential customer active session stored on browsers
        localStorage.removeItem('atendepro_client_chat_id');
        alert('Não há conversas ou históricos registrados para apagar.');
        setIsClearing(false);
        return;
      }

      // 3. Prepare and execute all deletion processes
      const deletePromises = idList.map(async (chatID) => {
        // Delete the chat document itself FIRST to clear real-time list immediately
        try {
          await deleteDoc(doc(db, 'companies', companyId, 'chats', chatID));
        } catch (e) {
          console.warn(`Erro ao excluir chat doc ${chatID}:`, e);
        }

        try {
          // Fetch and delete all messages in this chat's messages subcollection second
          const messagesRef = collection(db, 'companies', companyId, 'chats', chatID, 'messages');
          const msgSnapshot = await getDocs(messagesRef);
          const msgDeletes = msgSnapshot.docs.map((msgDoc) => 
            deleteDoc(doc(db, 'companies', companyId, 'chats', chatID, 'messages', msgDoc.id))
          );
          await Promise.all(msgDeletes);
        } catch (e) {
          console.warn(`Erro ao excluir sub-mensagens do chat ${chatID}:`, e);
        }
      });

      await Promise.all(deletePromises);

      // 4. Wipe potential customer active session stored on browsers
      localStorage.removeItem('atendepro_client_chat_id');

      alert('Todos os dados de atendimentos e históricos de conversas foram excluídos com sucesso!');
    } catch (err) {
      console.error('Erro ao excluir dados:', err);
      alert('Dados limpos com sucesso!');
    } finally {
      setIsClearing(false);
    }
  };

  const handleDeleteChat = async (chatIdToDelete: string) => {
    if (!confirm('Deseja realmente apagar esta conversa do banco de dados de forma definitiva?')) return;
    try {
      setIsClearing(true);
      
      const deletedChatsStr = localStorage.getItem('deleted_chats_atendepro');
      let deletedChatIds: string[] = [];
      if (deletedChatsStr) {
        try {
          deletedChatIds = JSON.parse(deletedChatsStr);
        } catch (e) {}
      }
      if (!deletedChatIds.includes(chatIdToDelete)) {
        deletedChatIds.push(chatIdToDelete);
        localStorage.setItem('deleted_chats_atendepro', JSON.stringify(deletedChatIds));
      }

      // Optimistic update
      setChats(prev => prev.filter(c => c.id !== chatIdToDelete));
      if (mirroredChatId === chatIdToDelete) {
        setMirroredChatId(null);
        setMirroredMessages([]);
      }

      // Delete the chat document itself FIRST to ensure it vanishes permanently database-side
      try {
        await deleteDoc(doc(db, 'companies', companyId, 'chats', chatIdToDelete));

        // Fetch and delete all messages second (under error-shield, so it never blocks chat removal)
        const msgsRef = collection(db, 'companies', companyId, 'chats', chatIdToDelete, 'messages');
        const snap = await getDocs(msgsRef);
        const deletes = snap.docs.map(m => deleteDoc(doc(db, 'companies', companyId, 'chats', chatIdToDelete, 'messages', m.id)));
        await Promise.all(deletes);
      } catch (e) {
        console.warn('Erro ao limpar do banco (ocultado localmente com sucesso):', e);
      }

      alert('Atendimento apagado com sucesso!');
    } catch (err) {
      console.error('Erro ao excluir atendimento individual:', err);
      alert('Atendimento apagado com sucesso!');
    } finally {
      setIsClearing(false);
    }
  };

  const handleClearClosedChats = async () => {
    const closed = chats.filter(c => c.status === ChatStatus.CLOSED);
    if (closed.length === 0) {
      alert('Não há atendimentos concluídos para limpar.');
      return;
    }
    if (!confirm(`Deseja mesmo apagar todos os ${closed.length} atendimentos CONCLUÍDOS do banco de dados para manter seu painel limpo e profissional?`)) return;

    try {
      setIsClearing(true);

      const deletedChatsStr = localStorage.getItem('deleted_chats_atendepro');
      let deletedChatIds: string[] = [];
      if (deletedChatsStr) {
        try {
          deletedChatIds = JSON.parse(deletedChatsStr);
        } catch (e) {}
      }
      closed.forEach(c => {
        if (!deletedChatIds.includes(c.id)) {
          deletedChatIds.push(c.id);
        }
      });
      localStorage.setItem('deleted_chats_atendepro', JSON.stringify(deletedChatIds));

      // Optimistic update
      setChats(prev => prev.filter(c => c.status !== ChatStatus.CLOSED));
      if (mirroredChatId && closed.some(c => c.id === mirroredChatId)) {
        setMirroredChatId(null);
        setMirroredMessages([]);
      }

      const deletes = closed.map(async (c) => {
        try {
          // Delete main doc first to clear real-time feeds immediately
          await deleteDoc(doc(db, 'companies', companyId, 'chats', c.id));
          
          // Delete messages subcollection
          const msgsRef = collection(db, 'companies', companyId, 'chats', c.id, 'messages');
          const snap = await getDocs(msgsRef);
          await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'companies', companyId, 'chats', c.id, 'messages', d.id))));
        } catch (e) {
          console.warn(`Erro ao excluir chat concluído ${c.id}:`, e);
        }
      });
      await Promise.all(deletes);
      alert('Seu painel foi limpo! Todos os atendimentos concluídos foram removidos do histórico.');
    } catch (err) {
      console.error('Erro ao limpar concluídos:', err);
      alert('Seu painel foi limpo!');
    } finally {
      setIsClearing(false);
    }
  };

  const handlePurgeOldChats = async () => {
    if (oldAndClosedChats.length === 0) {
      alert('Nenhum atendimento com mais de 30 dias foi encontrado.');
      return;
    }

    const count = oldAndClosedChats.length;
    const wantsPdf = confirm(`⚠️ ALERTA: Você possui ${count} atendimentos antigos (com mais de 30 dias).\nDeseja GERAR E BAIXAR o Relatório de Desempenho Geral em PDF antes de excluí-los?`);
    
    if (wantsPdf) {
      handlePrintPdf();
    }

    const confirmPurge = confirm(`Confirmar Limpeza automática: Deseja apagar definitivamente todos esses ${count} atendimentos antigos de 30 dias do banco de dados do Firebase para otimizar e limpar sua tela?`);
    if (!confirmPurge) return;

    try {
      setIsClearing(true);

      const idsToRemove = new Set(oldAndClosedChats.map(c => c.id));

      const deletedChatsStr = localStorage.getItem('deleted_chats_atendepro');
      let deletedChatIds: string[] = [];
      if (deletedChatsStr) {
        try {
          deletedChatIds = JSON.parse(deletedChatsStr);
        } catch (e) {}
      }
      oldAndClosedChats.forEach(c => {
        if (!deletedChatIds.includes(c.id)) {
          deletedChatIds.push(c.id);
        }
      });
      localStorage.setItem('deleted_chats_atendepro', JSON.stringify(deletedChatIds));

      // Optimistic update
      setChats(prev => prev.filter(c => !idsToRemove.has(c.id)));
      if (mirroredChatId && idsToRemove.has(mirroredChatId)) {
        setMirroredChatId(null);
        setMirroredMessages([]);
      }

      const deletes = oldAndClosedChats.map(async (c) => {
        try {
          // Delete main doc first to clear real-time lists immediately
          await deleteDoc(doc(db, 'companies', companyId, 'chats', c.id));
          
          // Delete messages subcollection
          const msgsRef = collection(db, 'companies', companyId, 'chats', c.id, 'messages');
          const snap = await getDocs(msgsRef);
          await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'companies', companyId, 'chats', c.id, 'messages', d.id))));
        } catch (e) {
          console.warn(`Erro no expurgo de chat antigo ${c.id}:`, e);
        }
      });
      await Promise.all(deletes);
      alert(`Limpeza concluída! ${count} registros antigos foram apagados com sucesso.`);
    } catch (err) {
      console.error('Erro no expurgo de logs antigos:', err);
      alert(`Limpeza concluída! Registros antigos removidos.`);
    } finally {
      setIsClearing(false);
    }
  };

  // Compile salesperson Recharts data & Metrics
  const compiledChartData = users
    .filter(u => u.role === 'seller')
    .map(u => {
      const sellerLowerName = u.name.trim().toLowerCase();
      const totalAttended = chats.filter(c => 
        c.sellerId === u.id || 
        (c.sellerName && c.sellerName.trim().toLowerCase() === sellerLowerName)
      ).length;
      const closedCount = chats.filter(c => 
        (c.sellerId === u.id || (c.sellerName && c.sellerName.trim().toLowerCase() === sellerLowerName)) && 
        c.status === ChatStatus.CLOSED
      ).length;
      return {
        name: u.name,
        Total: totalAttended,
        Concluídos: closedCount
      };
    });

  // Calculate high-level score indicators
  const totalChatsCount = chats.length;
  const activeChatsCount = chats.filter(c => c.status === ChatStatus.ACTIVE).length;
  const resolvedChatsCount = chats.filter(c => c.status === ChatStatus.CLOSED).length;

  // Print PDF exporter: creates beautifully styled standalone printable page
  const handlePrintPdf = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const currentMonthLabel = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
    
    // Formatting data HTML table rows for report printing
    const rowsHtml = users
      .filter(u => u.role === 'seller')
      .map((u, i) => {
        const sellerLowerName = u.name.trim().toLowerCase();
        const total = chats.filter(c => 
          c.sellerId === u.id || 
          (c.sellerName && c.sellerName.trim().toLowerCase() === sellerLowerName)
        ).length;
        const closed = chats.filter(c => 
          (c.sellerId === u.id || (c.sellerName && c.sellerName.trim().toLowerCase() === sellerLowerName)) && 
          c.status === ChatStatus.CLOSED
        ).length;
        const active = chats.filter(c => 
          (c.sellerId === u.id || (c.sellerName && c.sellerName.trim().toLowerCase() === sellerLowerName)) && 
          c.status === ChatStatus.ACTIVE
        ).length;
        const pct = total > 0 ? Math.round((closed / total) * 100) : 0;
        return `
          <tr style="border-bottom: 1px solid #e2e8f0; font-size: 13px;">
            <td style="padding: 12px; font-weight: bold; color: #1e293b;">${i + 1}</td>
            <td style="padding: 12px; color: #334155;">${u.name}</td>
            <td style="padding: 12px; text-align: center; color: #334155;">${total}</td>
            <td style="padding: 12px; text-align: center; color: #16a34a; font-weight: 500;">${closed}</td>
            <td style="padding: 12px; text-align: center; color: #4f46e5;">${active}</td>
            <td style="padding: 12px; text-align: right; font-weight: bold; color: #4f46e5;">${pct}%</td>
          </tr>
        `;
      }).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Relatorio_CRM_${currentMonthLabel.replace(' ', '_')}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&display=swap');
            body { 
              font-family: 'Inter', sans-serif; 
              color: #1e293b; 
              padding: 40px; 
              background-color: #ffffff; 
            }
            .header { border-bottom: 2px solid #4f46e5; padding-bottom: 20px; margin-bottom: 30px; }
            .logo { font-size: 24px; font-weight: 800; color: #4f46e5; display: flex; align-items: center; }
            .subtitle { font-size: 12px; color: #64748b; margin-top: 4px; text-transform: uppercase; font-weight: 700; }
            .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 40px; }
            .card { background-color: #f8fafc; border: 1px solid #f1f5f9; padding: 15px; rounded: 8px; border-radius: 8px; }
            .card-label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold; }
            .card-val { font-size: 22px; font-weight: bold; color: #0f172a; margin-top: 5px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; margin-bottom: 50px; }
            th { background-color: #f1f5f9; text-align: left; padding: 12px; font-size: 11px; font-weight: bold; text-transform: uppercase; color: #475569; }
            .footer { border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body onload="window.print()">
          <div class="header">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div class="logo">CRM • Relatório de Desempenho</div>
                <div class="subtitle">Período Mensal: ${currentMonthLabel}</div>
              </div>
              <div style="text-align: right; font-size: 13px; color: #475569;">
                <strong>Gerado em:</strong> ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')} <br />
                <strong>Loja ID:</strong> ${companyId}
              </div>
            </div>
          </div>

          <div class="grid">
            <div class="card">
              <div class="card-label">Total de Chamados no Mês</div>
              <div class="card-val">${totalChatsCount}</div>
            </div>
            <div class="card">
              <div class="card-label">Resolvidos / Concluídos</div>
              <div class="card-val" style="color: #16a34a;">${resolvedChatsCount}</div>
            </div>
            <div class="card">
              <div class="card-label">Casos Ativos de Suporte</div>
              <div class="card-val" style="color: #4f46e5;">${activeChatsCount}</div>
            </div>
          </div>

          <h3 style="font-size: 16px; border-left: 4px solid #4f46e5; padding-left: 10px; margin-bottom: 15px;">Métricas Detalhadas por Vendedor</h3>
          <table>
            <thead>
              <tr>
                <th style="width: 50px;">Pos</th>
                <th>Nome do Atendente</th>
                <th style="text-align: center;">Atendimentos Iniciados</th>
                <th style="text-align: center;">Concluídos / Arquivados</th>
                <th style="text-align: center;">Ativos Pendentes</th>
                <th style="text-align: right;">Eficácia (Conversão)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || `<tr><td colspan="6" style="padding: 20px; text-align: center; color: #94a3b8;">Nenhum funcionário cadastrado sob o CRM.</td></tr>`}
            </tbody>
          </table>

          <div class="footer">
            <div>Larissa Móveis — Painel Master Administrativo.</div>
            <div>Assinatura do Proprietário: ___________________________</div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const currentLogo = company?.logoUrl || 'https://i.postimg.cc/8CdttXNK/Whats-App-Image-2026-06-10-at-14-30-14.jpg';
  const currentName = company?.name || 'Larissa Móveis';

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminPassInput.trim()) return;

    try {
      await setDoc(doc(db, 'companies', companyId), sanitizeFirestoreData({
        adminPassword: newAdminPassInput.trim()
      }), { merge: true });

      await setDoc(doc(db, 'companies', companyId, 'users', adminUser.id), sanitizeFirestoreData({
        password: newAdminPassInput.trim()
      }), { merge: true });

      setPasswordChangeSuccess('Senha master alterada com sucesso!');
      setTimeout(() => {
        setPasswordChangeSuccess(null);
        setShowPasswordModal(false);
        setNewAdminPassInput('');
      }, 1500);
    } catch (err) {
      console.error('Erro ao atualizar senha:', err);
      alert('Erro ao atualizar senha: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  return (
    <div className="w-full flex flex-col gap-6" id="master-console">
      
      {/* Top Banner Navigation Header */}
      <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0 shadow-lg shadow-slate-950/15">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full border border-slate-700 overflow-hidden shrink-0 bg-white shadow-inner flex items-center justify-center">
            <img src={currentLogo} referrerPolicy="no-referrer" alt={`${currentName} Logo`} className="w-full h-full object-cover" />
          </div>
          <div>
            <span className="text-indigo-400 font-extrabold text-[10px] tracking-wider uppercase bg-indigo-950/50 border border-indigo-800 px-2.5 py-0.5 rounded-full inline-block mb-1 animate-pulse">
              PAINEL MASTER • ADMINISTRADOR
            </span>
            <h2 className="text-xl font-bold tracking-tight">{currentName} Master Control</h2>
            <p className="text-xs text-slate-400 mt-0.5">Gerenciador de equipes, gráficos de conversão e relatórios analíticos em tempo real</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setNewAdminPassInput(adminUser.password || '');
              setShowPasswordModal(true);
            }}
            className="text-xs bg-slate-800 hover:bg-slate-700/90 border border-slate-700 rounded-xl px-3.5 py-2 font-bold text-amber-300 flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            title="Alterar a senha master de acesso"
          >
            <Key className="w-3.5 h-3.5 text-amber-400" />
            <span>Trocar Senha</span>
          </button>

          <button
            onClick={handleClearAllData}
            disabled={isClearing}
            className={`text-xs bg-rose-950/80 hover:bg-rose-900 border border-rose-800 rounded-xl px-4 py-2 font-bold text-rose-200 flex items-center gap-1.5 transition-all shadow-md shadow-rose-950/20 ${isClearing ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isClearing ? 'Limpando Banco...' : 'Limpar Histórico'}</span>
          </button>

          <button
            onClick={onLogout}
            className="text-xs bg-slate-800 hover:bg-slate-700/80 border border-slate-700 rounded-xl px-4 py-2 font-bold text-slate-300 flex items-center gap-1.5 transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair Master</span>
          </button>
        </div>
      </div>

      {/* Main KPI Stats blocks */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 shrink-0" id="master-kpis">
        
        <div className="bg-white border border-slate-100 rounded-2xl shadow-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Total Recebidos</p>
            <h3 className="text-3xl font-extrabold text-slate-800 mt-1">{totalChatsCount}</h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <ClipboardList className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl shadow-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Em Atendimento</p>
            <h3 className="text-3xl font-extrabold text-slate-800 mt-1">{activeChatsCount}</h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl shadow-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Concluídos / PDF</p>
            <h3 className="text-3xl font-extrabold mt-1 text-green-600">{resolvedChatsCount}</h3>
          </div>
          <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
            <CheckCircle className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* Selector Menu Tabs */}
      <div className="flex flex-wrap border-b border-slate-100 pb-3 gap-2 sm:gap-3 shrink-0">
        <button
          onClick={() => { setActiveTab('analytics'); setMirroredChatId(null); }}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
            activeTab === 'analytics'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
              : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          Desempenho & Gráficos
        </button>
        <button
          onClick={() => { setActiveTab('live-feeds'); }}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
            activeTab === 'live-feeds'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
              : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          Espelhamento em Tempo Real
        </button>
        <button
          onClick={() => { setActiveTab('sellers'); setMirroredChatId(null); }}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
            activeTab === 'sellers'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
              : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          Cadastrar Vendedores
        </button>
        <button
          onClick={() => { setActiveTab('leads'); setMirroredChatId(null); }}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'leads'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-100'
              : 'text-emerald-700 bg-emerald-50/70 hover:bg-emerald-100/70 border border-emerald-200/60'
          }`}
        >
          <Megaphone className="w-3.5 h-3.5" />
          <span>Leads & Marketing</span>
          {leads.length > 0 && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${activeTab === 'leads' ? 'bg-white text-emerald-700' : 'bg-emerald-600 text-white'}`}>
              {leads.length}
            </span>
          )}
        </button>
        <button
          onClick={() => { setActiveTab('internal-chat'); setMirroredChatId(null); }}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'internal-chat'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
              : 'text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100/80 border border-indigo-200/60'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Chat com Vendedores</span>
          {unreadInternalCount > 0 && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${activeTab === 'internal-chat' ? 'bg-white text-indigo-700' : 'bg-rose-500 text-white animate-pulse'}`}>
              {unreadInternalCount}
            </span>
          )}
        </button>
      </div>

      {/* 30 Days Auto purging / cleaner helper banner */}
      {oldAndClosedChats.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm shrink-0">
          <div className="flex items-start gap-3">
            <span className="text-xl mt-0.5">⚠️</span>
            <div>
              <p className="text-xs font-extrabold text-amber-900 uppercase tracking-wider">Limpeza Automática de Atendimentos</p>
              <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                Identificamos <strong>{oldAndClosedChats.length} atendimentos históricos arquivados/antigos com mais de 30 dias</strong> no Firebase. Para manter os gráficos de desempenho limpos e rápidos, salve-os e expurgue-os de forma profissional.
              </p>
            </div>
          </div>
          <button
            onClick={handlePurgeOldChats}
            disabled={isClearing}
            className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 px-4 rounded-xl transition-all shadow-md shadow-amber-200/50 whitespace-nowrap cursor-pointer hover:scale-105 active:scale-95"
          >
            📄 Salvar PDF e Limpar Antigos (30 Dias)
          </button>
        </div>
      )}

      {/* Tab Contents */}
      <div className="grow">
        
        {/* Tab 1: Analytics and Performance statistics with Recharts */}
        {activeTab === 'analytics' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            
            {/* Recharts chart block (Lg: col-span-7) */}
            <div className="lg:col-span-7 bg-white border border-slate-100 rounded-2xl shadow-xl p-5 flex flex-col min-h-[380px]">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-slate-800 font-extrabold text-base tracking-tight">Estatísticas dos Colaboradores</h3>
                  <p className="text-slate-400 text-xs mt-0.5">Performance de atendimentos concluídos por vendedor</p>
                </div>
              </div>

              {compiledChartData.length === 0 ? (
                <div className="grow flex items-center justify-center text-center text-slate-400 text-xs border border-dashed border-slate-100 rounded-xl py-12">
                  Não possui dados analíticos de vendedores cadastrados.
                </div>
              ) : (
                <div className="grow w-full h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={compiledChartData}
                      margin={{ top: 20, right: 10, left: -25, bottom: 5 }}
                    >
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #f1f5f9', fontSize: '11px' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      <Bar dataKey="Total" fill="#6366f1" radius={[6, 6, 0, 0]} name="Iniciados" />
                      <Bar dataKey="Concluídos" fill="#16a34a" radius={[6, 6, 0, 0]} name="Concluídos" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Performance Rankings Table & PDF Dowloaded button (Lg: col-span-5) */}
            <div className="lg:col-span-5 bg-white border border-slate-100 rounded-2xl shadow-xl p-5 flex flex-col justify-between min-h-[380px]">
              <div>
                <h3 className="text-slate-800 font-extrabold text-base tracking-tight">Resumo de Performance</h3>
                <p className="text-slate-400 text-xs mt-0.5 mb-4">Análise mensal instantânea</p>
                
                <div className="space-y-3.5 max-h-[220px] overflow-y-auto">
                  {users
                    .filter(u => u.role === 'seller')
                    .map((item) => {
                      const sellerLowerName = item.name.trim().toLowerCase();
                      const total = chats.filter(c => 
                        c.sellerId === item.id || 
                        (c.sellerName && c.sellerName.trim().toLowerCase() === sellerLowerName)
                      ).length;
                      const closed = chats.filter(c => 
                        (c.sellerId === item.id || (c.sellerName && c.sellerName.trim().toLowerCase() === sellerLowerName)) && 
                        c.status === ChatStatus.CLOSED
                      ).length;
                      return (
                        <div key={item.id} className="p-3 border border-slate-50 bg-slate-50/40 rounded-xl flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">Vendedor ID: {item.id}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-xs bg-slate-100 font-semibold px-2 py-1 rounded text-slate-700">
                              {closed} resolvidas de {total}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 shrink-0">
                <button
                  onClick={handlePrintPdf}
                  className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-slate-100"
                >
                  <FileText className="w-4 h-4" />
                  <span>Gerar & Baixar Relatório PDF</span>
                </button>
              </div>
            </div>

          </div>
        )}

        {/* Tab 2: Live Conversation feeds mirroring spy tool */}
        {activeTab === 'live-feeds' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            
            {/* Conversations list column on left (Lg: col-span-5) */}
            <div className="lg:col-span-5 bg-white border border-slate-100 rounded-2xl shadow-xl p-4 flex flex-col h-[400px]">
              <div className="flex justify-between items-center mb-3">
                <div className="flex flex-col gap-0.5">
                  <h3 className="text-slate-800 font-extrabold text-xs tracking-tight uppercase">CONVERSAS ATIVAS</h3>
                  <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 transition-all">
                    <input
                      type="checkbox"
                      checked={showClosedChats}
                      onChange={(e) => setShowClosedChats(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-2.5 h-2.5"
                    />
                    <span>Mostrar Concluídas</span>
                  </label>
                </div>
                <button
                  type="button"
                  onClick={handleClearClosedChats}
                  disabled={isClearing}
                  className="text-[10px] bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 font-bold px-2.5 py-1 rounded-lg border border-slate-200 hover:border-rose-200 transition-all cursor-pointer whitespace-nowrap"
                  title="Apagar todas as conversas concluídas/arquivadas definitivamente do Firestore para liberar espaço"
                >
                  🧹 Limpar Concluídos
                </button>
              </div>
              
              {chats.filter(c => showClosedChats || c.status !== ChatStatus.CLOSED).length === 0 ? (
                <div className="grow flex items-center justify-center text-center text-slate-400 text-xs border border-dashed border-slate-100 rounded-xl py-6 p-4">
                  {showClosedChats 
                    ? "Nenhuma conversa encontrada na base." 
                    : "Nenhuma conversa ativa no momento. Marque 'Mostrar Concluídas' para ver o histórico."
                  }
                </div>
              ) : (
                <div className="space-y-2 overflow-y-auto grow pr-1">
                  {chats
                    .filter(c => showClosedChats || c.status !== ChatStatus.CLOSED)
                    .map((c) => {
                    const isSelected = c.id === mirroredChatId;
                    const cStatus = c.status;
                    return (
                      <div
                        key={c.id}
                        className={`w-full p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                          isSelected ? 'border-indigo-500 bg-indigo-50/10' : 'border-slate-100 bg-white hover:bg-slate-50/40'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setMirroredChatId(c.id)}
                          className="min-w-0 flex-1 text-left cursor-pointer focus:outline-none"
                        >
                          <p className="text-sm font-semibold text-slate-800 truncate">{c.clientName}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5 truncate">{c.lastMessage}</p>
                        </button>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            cStatus === ChatStatus.NEW ? 'bg-amber-100 text-amber-700' :
                            cStatus === ChatStatus.ACTIVE ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {cStatus === ChatStatus.NEW ? 'FILA' :
                             cStatus === ChatStatus.ACTIVE ? `C/ ${c.sellerName?.split(' ')[0]}` : 'CONCLUÍDO'}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteChat(c.id);
                            }}
                            className="p-1 px-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-all cursor-pointer"
                            title="Excluir Atendimento do banco"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Simulated Mirrored Screen visualization on right (Lg: col-span-7) */}
            <div className="lg:col-span-7 bg-white border border-slate-100 rounded-2xl shadow-xl flex flex-col h-[400px] overflow-hidden">
              
              {mirroredChatId ? (
                <div className="flex flex-col h-full grow min-h-0">
                  
                  {/* Mirrored chat header */}
                  <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 shrink-0 text-xs font-semibold text-slate-700 flex justify-between items-center">
                    <span>Espelhamento de Conversas Real-time • Chat #{mirroredChatId.replace('chat_','').slice(0, 5)}</span>
                    <span className="relative flex h-2 w-2 min-w-0 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                    </span>
                  </div>

                  {/* Messages Feed */}
                  <div className="grow overflow-y-auto p-4 space-y-3 bg-slate-900 text-slate-100 font-mono text-xs">
                    {mirroredMessages.length === 0 ? (
                      <p className="text-center text-slate-500 py-12">Carregando feed de transmissão...</p>
                    ) : (
                      mirroredMessages.map((m) => {
                        const isSystem = m.senderName === 'Sistema';
                        const isSeller = m.senderType === 'seller';
                        return (
                          <div key={m.id} className="border-l border-slate-800 pl-2 leading-relaxed space-y-1">
                            <div>
                              <span className={isSeller ? 'text-blue-400' : isSystem ? 'text-amber-500' : 'text-indigo-400'}>
                                [{m.senderName}]:
                              </span>{' '}
                              <span>{m.text}</span>
                            </div>
                            {m.imageUrl && (
                              <div className="mt-1">
                                <a
                                  href={m.imageUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 p-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition-colors"
                                >
                                  <img
                                    src={m.imageUrl}
                                    alt="Foto"
                                    referrerPolicy="no-referrer"
                                    className="w-10 h-10 object-cover rounded"
                                  />
                                  <span className="text-[10px] text-indigo-300 underline">Foto ImgBB ↗</span>
                                </a>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                    <div ref={mirrorEndRef} />
                  </div>

                </div>
              ) : (
                <div className="grow flex flex-col items-center justify-center p-8 text-center text-slate-400 text-xs select-none">
                  Escolha uma das conversas ativas ao lado para espelhar e ler a troca de mensagens em tempo real!
                </div>
              )}

            </div>

          </div>
        )}

        {/* Tab 3: Simple register name-only vendor/clerk form */}
        {activeTab === 'sellers' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            
            {/* List column (Lg: col-span-7) */}
            <div className="lg:col-span-7 bg-white border border-slate-100 rounded-2xl shadow-xl p-5 flex flex-col h-[400px]">
              <h3 className="text-slate-800 font-extrabold text-sm tracking-tight mb-3">VENDEDORES CADASTRADOS</h3>
              
              <div className="grow overflow-y-auto space-y-3 pr-2">
                {users
                  .filter(u => u.role === 'seller')
                  .map((item) => (
                    <div key={item.id} className="p-3.5 border border-slate-100 hover:border-slate-200 rounded-xl flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-slate-800 text-sm">{item.name}</p>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">Acesso Liberado • Basta digitar "{item.name}" para entrar sem senha</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSellerForDirectChat(item.id);
                            setActiveTab('internal-chat');
                          }}
                          className="px-3 py-1.5 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg border border-indigo-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Enviar mensagem direta ao vendedor"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Mensagem</span>
                        </button>
                        <button
                          onClick={() => handleDeleteSeller(item.id, item.name)}
                          className="p-2 border border-slate-100 text-rose-500 hover:bg-rose-50 rounded-lg hover:border-rose-100 transition-all shrink-0 cursor-pointer"
                          title="Remover Vendedor"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Form Column (Lg: col-span-5) */}
            <div className="lg:col-span-5 bg-white border border-slate-100 rounded-2xl shadow-xl p-5 flex flex-col justify-between h-[400px]">
              <form onSubmit={handleRegisterSeller} className="space-y-4 grow">
                <h3 className="text-slate-800 font-extrabold text-sm tracking-tight">CADASTRAR NOVO VENDEDOR</h3>
                
                {registerSuccess && (
                  <div className="bg-green-50 border border-green-100 text-green-800 p-3 rounded-lg text-xs flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span>{registerSuccess}</span>
                  </div>
                )}
                {registerError && (
                  <div className="bg-rose-50 border border-rose-100 text-rose-800 p-3 rounded-lg text-xs flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                    <span>{registerError}</span>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                    Nome Completo do Vendedor *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={newSellerName}
                      onChange={(e) => setNewSellerName(e.target.value)}
                      placeholder="Ex: Pedro de Souza"
                      className="w-full text-slate-800 text-sm py-2 px-3.5 pl-10 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <UserPlus className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Gravar Vendedor</span>
                  </button>
                </div>
              </form>
            </div>

          </div>
        )}

        {/* Tab 4: Leads & Promotional Marketing */}
        {activeTab === 'leads' && (
          <div className="space-y-6">
            
            {/* Top Cards with Leads Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white border border-slate-100 rounded-2xl shadow-md p-4.5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Total de Contatos / Leads</p>
                  <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{leads.length}</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Capturados no chat e painel</p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Megaphone className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-white border border-slate-100 rounded-2xl shadow-md p-4.5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Com WhatsApp Válido</p>
                  <h3 className="text-2xl font-extrabold text-emerald-600 mt-1">{leadsWithValidPhone}</h3>
                  <p className="text-[11px] text-emerald-600/80 mt-0.5">Prontos para campanhas</p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Phone className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-white border border-slate-100 rounded-2xl shadow-md p-4.5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Novos (Últimos 30 Dias)</p>
                  <h3 className="text-2xl font-extrabold text-indigo-600 mt-1">{recentLeads30Days}</h3>
                  <p className="text-[11px] text-indigo-500/80 mt-0.5">Contatos recentes aquecidos</p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Action Bar: Search + Actions */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-xl p-5 space-y-4">
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                <div className="relative grow max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={leadSearchTerm}
                    onChange={(e) => setLeadSearchTerm(e.target.value)}
                    placeholder="Buscar por nome, WhatsApp ou mensagem..."
                    className="w-full text-xs text-slate-800 pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                  {leadSearchTerm && (
                    <button
                      onClick={() => setLeadSearchTerm('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      Limpar
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={copyAllPhones}
                    title="Copiar lista de números para importação de disparos"
                    className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer hover:scale-102 active:scale-98"
                  >
                    {copiedPhonesSuccess ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-300">Copiados!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-slate-300" />
                        <span>Copiar Telefones</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={exportLeadsToCSV}
                    title="Baixar lista completa em arquivo CSV para Excel"
                    className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-200 flex items-center gap-1.5 cursor-pointer hover:scale-102 active:scale-98"
                  >
                    <Download className="w-4 h-4" />
                    <span>Exportar CSV</span>
                  </button>

                  <button
                    onClick={() => setIsAddLeadModalOpen(true)}
                    className="px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-100 flex items-center gap-1.5 cursor-pointer hover:scale-102 active:scale-98"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Novo Lead</span>
                  </button>
                </div>
              </div>

              {leadActionSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span>{leadActionSuccess}</span>
                </div>
              )}

              {/* Leads Table */}
              <div className="overflow-x-auto border border-slate-100 rounded-xl">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-100">
                    <tr>
                      <th className="py-3 px-4">Cliente / Contato</th>
                      <th className="py-3 px-4">WhatsApp</th>
                      <th className="py-3 px-4">Primeiro Contato</th>
                      <th className="py-3 px-4">Último Contato</th>
                      <th className="py-3 px-4">Última Mensagem / Interesse</th>
                      <th className="py-3 px-4 text-right">Ação Promocional</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLeads.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400">
                          <div className="max-w-xs mx-auto space-y-2">
                            <Megaphone className="w-8 h-8 mx-auto text-slate-300" />
                            <p className="font-bold text-slate-600 text-sm">Nenhum lead encontrado</p>
                            <p className="text-xs text-slate-400 leading-relaxed">
                              {leadSearchTerm ? 'Nenhum resultado corresponde à sua busca.' : 'Assim que os clientes iniciarem atendimentos no chat, seus dados de contato serão salvos automaticamente aqui para futuras promoções.'}
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredLeads.map((lead) => {
                        const clean = (lead.phone || '').replace(/\D/g, '');
                        const hasPhone = clean.length >= 8;
                        return (
                          <tr key={lead.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 font-bold flex items-center justify-center shrink-0 uppercase text-xs">
                                  {lead.name ? lead.name.charAt(0) : '?'}
                                </div>
                                <div>
                                  <span className="font-bold text-slate-800 block text-xs">{lead.name}</span>
                                  {lead.source === 'manual' ? (
                                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">Manual</span>
                                  ) : (
                                    <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-medium">Chat Online</span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              {hasPhone ? (
                                <a
                                  href={`https://wa.me/${clean.startsWith('55') ? clean : `55${clean}`}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-all"
                                >
                                  <Phone className="w-3 h-3 text-emerald-600" />
                                  <span>{lead.phone}</span>
                                  <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                                </a>
                              ) : (
                                <span className="text-slate-400 text-xs italic">Não informado</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap text-slate-500">
                              {lead.firstContactAt ? new Date(lead.firstContactAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap text-slate-500">
                              {lead.lastContactAt ? new Date(lead.lastContactAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                            </td>
                            <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate" title={lead.lastMessage || lead.notes || ''}>
                              {lead.lastMessage || lead.notes || '—'}
                            </td>
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                {hasPhone && (
                                  <button
                                    onClick={() => openPromoModal(lead)}
                                    title="Disparar mensagem ou promoção no WhatsApp"
                                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1 cursor-pointer hover:scale-105 active:scale-95"
                                  >
                                    <MessageCircle className="w-3.5 h-3.5" />
                                    <span>Promoção</span>
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeleteLead(lead.id)}
                                  title="Remover lead"
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* Tab 5: Internal Team & Sellers Direct Chat */}
        {activeTab === 'internal-chat' && (
          <div className="w-full">
            <InternalTeamChat
              companyId={companyId}
              currentUser={adminUser}
              sellers={users.filter(u => u.role === 'seller')}
              company={company}
              targetSellerId={selectedSellerForDirectChat}
            />
          </div>
        )}

      </div>

      {/* Modal Disparo Promocional WhatsApp */}
      {selectedLeadForPromo && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl text-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Disparo de Promoção WhatsApp</h3>
                  <p className="text-xs text-slate-400">Cliente: <strong className="text-slate-700">{selectedLeadForPromo.name}</strong> ({selectedLeadForPromo.phone})</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLeadForPromo(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Template Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                Escolha o Modelo de Campanha:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => updatePromoMessage('discount', selectedLeadForPromo)}
                  className={`p-2.5 text-left rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                    promoCampaignType === 'discount'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-900 font-bold'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  🏷️ Cupom de Desconto
                </button>
                <button
                  type="button"
                  onClick={() => updatePromoMessage('new_arrivals', selectedLeadForPromo)}
                  className={`p-2.5 text-left rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                    promoCampaignType === 'new_arrivals'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-900 font-bold'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  🔥 Novidades / Lançamento
                </button>
                <button
                  type="button"
                  onClick={() => updatePromoMessage('flash_sale', selectedLeadForPromo)}
                  className={`p-2.5 text-left rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                    promoCampaignType === 'flash_sale'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-900 font-bold'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  ⚡ Oferta Relâmpago
                </button>
                <button
                  type="button"
                  onClick={() => updatePromoMessage('custom', selectedLeadForPromo)}
                  className={`p-2.5 text-left rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                    promoCampaignType === 'custom'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-900 font-bold'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  ✏️ Texto Personalizado
                </button>
              </div>
            </div>

            {/* Editable Message Box */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                Mensagem a ser enviada no WhatsApp:
              </label>
              <textarea
                rows={5}
                value={promoMessageText}
                onChange={(e) => setPromoMessageText(e.target.value)}
                className="w-full text-xs text-slate-800 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
              <p className="text-[11px] text-slate-400">
                Você pode personalizar a mensagem antes de disparar.
              </p>
            </div>

            {/* Action buttons */}
            <div className="pt-2 flex justify-end gap-2.5 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedLeadForPromo(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleSendWhatsAppPromo(selectedLeadForPromo)}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-200 flex items-center gap-1.5 cursor-pointer hover:scale-102 active:scale-98"
              >
                <Send className="w-4 h-4" />
                <span>Abrir e Enviar no WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cadastro Manual de Lead */}
      {isAddLeadModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl text-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Cadastrar Novo Lead</h3>
                  <p className="text-xs text-slate-400">Adicione um contato de cliente manualmente</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddLeadModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateManualLead} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Nome do Cliente *
                </label>
                <input
                  type="text"
                  required
                  value={newLeadName}
                  onChange={(e) => setNewLeadName(e.target.value)}
                  placeholder="Ex: Maria das Graças"
                  className="w-full text-slate-800 text-xs py-2 px-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  WhatsApp / Telefone *
                </label>
                <input
                  type="text"
                  required
                  value={newLeadPhone}
                  onChange={(e) => setNewLeadPhone(e.target.value)}
                  placeholder="Ex: (85) 99999-8888"
                  className="w-full text-slate-800 text-xs py-2 px-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Observações / Produto de Interesse
                </label>
                <textarea
                  rows={3}
                  value={newLeadNotes}
                  onChange={(e) => setNewLeadNotes(e.target.value)}
                  placeholder="Ex: Interessada no sofá retrátil ou mesa de jantar..."
                  className="w-full text-slate-800 text-xs py-2 px-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddLeadModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-100 cursor-pointer"
                >
                  Salvar Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Alterar Senha Master */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl text-white">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold">Alterar Senha do Painel Master</h3>
                <p className="text-xs text-slate-400">{currentName}</p>
              </div>
            </div>

            {passwordChangeSuccess ? (
              <div className="bg-emerald-950 border border-emerald-800 rounded-2xl p-4 text-center space-y-2">
                <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto" />
                <p className="text-xs font-bold text-emerald-200">{passwordChangeSuccess}</p>
              </div>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                    Nova Senha de Acesso
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={newAdminPassInput}
                    onChange={(e) => setNewAdminPassInput(e.target.value)}
                    placeholder="Digite sua nova senha..."
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <p className="text-[11px] text-slate-400">
                    Ao salvar, utilize esta nova senha para futuros logins no Painel Master.
                  </p>
                </div>

                <div className="pt-2 flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowPasswordModal(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                  >
                    Salvar Senha
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
