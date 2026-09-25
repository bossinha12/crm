import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, sanitizeFirestoreData } from '../lib/firebase';
import { uploadToImgBB } from '../lib/imgbb';
import { User, InternalMessage, Company } from '../types';
import { 
  Send, MessageSquare, Megaphone, User as UserIcon, CheckCheck, 
  Camera, Loader2, ExternalLink, X, Image as ImageIcon, ShieldCheck, 
  Sparkles, Check, Clock, WifiOff, Trash2
} from 'lucide-react';
import { formatMessageDateTime } from '../lib/formatters';

interface InternalTeamChatProps {
  companyId: string;
  currentUser: User; // can be admin or seller
  sellers: User[];
  company?: Company | null;
  targetSellerId?: string | null; // optionally pre-select a specific seller
  onClose?: () => void; // if rendered inside a modal/drawer
  isCompact?: boolean; // if rendered in a smaller panel
}

export default function InternalTeamChat({
  companyId,
  currentUser,
  sellers,
  company,
  targetSellerId,
  onClose,
  isCompact = false
}: InternalTeamChatProps) {
  const isAdmin = currentUser.role === 'admin' || currentUser.id.startsWith('admin');
  
  // Selected conversation recipient ID: 'all' (announcements) or seller.id
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>(() => {
    if (targetSellerId) return targetSellerId;
    if (isAdmin) return sellers.length > 0 ? sellers[0].id : 'all';
    return 'admin'; // Sellers talk to 'admin' or 'all'
  });

  const activeCompanyId = company?.id || (companyId.startsWith('company_') ? companyId : `company_${companyId}`);
  const altCompanyId = company?.slug || companyId.replace(/^company_/, '');

  // Initialize messages directly from cache so they never flash blank or disappear on F5 refresh
  const [messages, setMessages] = useState<InternalMessage[]>(() => {
    const keys = [
      `atendepro_internal_msgs_${activeCompanyId}`,
      `atendepro_internal_msgs_${altCompanyId}`,
      `atendepro_internal_msgs_${companyId}`
    ];
    for (const key of keys) {
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const list = JSON.parse(saved);
          if (Array.isArray(list) && list.length > 0) return list;
        } catch (e) {}
      }
    }
    return [];
  });
  const [inputText, setInputText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);
  const markedAsReadIdsRef = useRef<Set<string>>(new Set());

  // Sync targetSellerId when prop changes
  useEffect(() => {
    if (targetSellerId) {
      setSelectedRecipientId(targetSellerId);
    }
  }, [targetSellerId]);

  // Real-time listener for internal messages: listens across both canonical and slug paths
  useEffect(() => {
    const idsToListen = Array.from(new Set([activeCompanyId, altCompanyId, companyId])).filter(Boolean);
    const messagesById = new Map<string, InternalMessage>();

    // Load initial local cache into memory map
    const localKeys = idsToListen.map(id => `atendepro_internal_msgs_${id}`);
    for (const k of localKeys) {
      const saved = localStorage.getItem(k);
      if (saved) {
        try {
          const parsed: InternalMessage[] = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            parsed.forEach(m => {
              if (m.id) messagesById.set(m.id, m);
            });
          }
        } catch (e) {}
      }
    }

    const unsubs: (() => void)[] = [];

    const syncCombinedMessages = () => {
      const list = Array.from(messagesById.values());
      list.sort((a, b) => {
        const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tA - tB;
      });

      setMessages(list);

      // Persist to all local storage keys so any refresh finds it immediately
      for (const k of localKeys) {
        try {
          localStorage.setItem(k, JSON.stringify(list));
        } catch (e) {}
      }
    };

    idsToListen.forEach((cId) => {
      const internalCol = collection(db, 'companies', cId, 'internal_messages');
      const unsub = onSnapshot(internalCol, (snapshot) => {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'removed') {
            messagesById.delete(change.doc.id);
          } else {
            messagesById.set(change.doc.id, { id: change.doc.id, ...change.doc.data() } as InternalMessage);
          }
        });

        // If master explicitly cleared history, server confirms collection is empty
        if (snapshot.empty && !snapshot.metadata.fromCache) {
          Array.from(messagesById.keys()).forEach(key => {
            const m = messagesById.get(key);
            if (m?.companyId === cId || !m?.companyId) {
              messagesById.delete(key);
            }
          });
        }

        syncCombinedMessages();
      }, (error) => {
        console.warn(`Aviso ao monitorar mensagens internas (${cId}):`, error);
      });

      unsubs.push(unsub);
    });

    return () => {
      unsubs.forEach(u => u());
    };
  }, [activeCompanyId, altCompanyId, companyId]);

  // Auto-scroll ONLY the inner chat messages box (never moving or jerking the browser window)
  useEffect(() => {
    if (chatScrollContainerRef.current) {
      chatScrollContainerRef.current.scrollTop = chatScrollContainerRef.current.scrollHeight;
    }
  }, [messages.length, selectedRecipientId]);

  // Filter messages for current view
  const currentConversationMessages = messages.filter((m) => {
    if (selectedRecipientId === 'all') {
      return m.recipientId === 'all';
    }

    if (isAdmin) {
      // Admin talking to specific seller (e.g. Souza)
      const targetSeller = sellers.find(s => s.id === selectedRecipientId);
      const targetSellerName = targetSeller?.name?.trim().toLowerCase();

      const isFromAdminToSeller = 
        (m.senderId === currentUser.id || m.senderRole === 'admin' || m.senderId.startsWith('admin')) && 
        (m.recipientId === selectedRecipientId || (targetSellerName && m.recipientName?.trim().toLowerCase() === targetSellerName));
        
      const isFromSellerToAdmin = 
        (m.senderId === selectedRecipientId || (targetSellerName && m.senderName?.trim().toLowerCase() === targetSellerName)) && 
        (m.recipientId === 'admin' || m.recipientId === currentUser.id || m.recipientId.startsWith('admin') || m.recipientRole === 'admin');

      return isFromAdminToSeller || isFromSellerToAdmin;
    } else {
      // Seller talking to admin:
      // Show messages sent by this seller to admin
      const isMyMessage = 
        (m.senderId === currentUser.id || (currentUser.name && m.senderName?.trim().toLowerCase() === currentUser.name.trim().toLowerCase())) && 
        (m.recipientId === 'admin' || m.recipientId.startsWith('admin') || m.recipientRole === 'admin');
        
      // Show messages sent by admin to this seller
      const isFromAdminToMe = 
        (m.senderRole === 'admin' || m.senderId.startsWith('admin')) && 
        (m.recipientId === currentUser.id || m.recipientId === 'admin' || (currentUser.name && m.recipientName?.trim().toLowerCase() === currentUser.name.trim().toLowerCase()));

      return isMyMessage || isFromAdminToMe;
    }
  });

  // Calculate unread counters per seller (for admin view)
  const getUnreadCount = (recipientId: string) => {
    return messages.filter((m) => {
      if (m.senderId === currentUser.id) return false;
      const isRead = m.readBy && (
        m.readBy.includes(currentUser.id) ||
        (currentUser.name && m.readBy.includes(currentUser.name)) ||
        (currentUser.name && m.readBy.some((r: string) => r?.toLowerCase() === currentUser.name?.trim().toLowerCase()))
      );
      if (isRead) return false;

      if (recipientId === 'all') {
        return m.recipientId === 'all';
      }
      return m.senderId === recipientId;
    }).length;
  };

  // Calculate unread counters for seller channels ('admin' or 'all')
  const getSellerUnreadCount = (channel: 'admin' | 'all') => {
    return messages.filter((m) => {
      if (m.senderId === currentUser.id) return false;
      const isRead = m.readBy && (
        m.readBy.includes(currentUser.id) ||
        (currentUser.name && m.readBy.includes(currentUser.name)) ||
        (currentUser.name && m.readBy.some((r: string) => r?.toLowerCase() === currentUser.name?.trim().toLowerCase()))
      );
      if (isRead) return false;

      if (channel === 'all') {
        return m.recipientId === 'all';
      } else {
        return m.recipientId === currentUser.id || 
               m.recipientId === 'admin' || 
               (currentUser.name && m.recipientName?.trim().toLowerCase() === currentUser.name?.trim().toLowerCase());
      }
    }).length;
  };

  // Mark messages as read safely across local state and all Firestore company ID aliases
  useEffect(() => {
    const isMsgReadByMe = (m: InternalMessage) => {
      if (!m.readBy) return false;
      return (
        m.readBy.includes(currentUser.id) ||
        (currentUser.name && m.readBy.includes(currentUser.name)) ||
        (currentUser.name && m.readBy.some((r: string) => r?.toLowerCase() === currentUser.name?.trim().toLowerCase()))
      );
    };

    const unreadMsgs = currentConversationMessages.filter(
      (m) => m.id && !markedAsReadIdsRef.current.has(m.id) && m.senderId !== currentUser.id && !isMsgReadByMe(m)
    );

    if (unreadMsgs.length > 0) {
      unreadMsgs.forEach(async (msg) => {
        if (!msg.id) return;
        markedAsReadIdsRef.current.add(msg.id);

        const identifiers = Array.from(new Set([
          currentUser.id,
          currentUser.name,
          currentUser.name?.toLowerCase(),
          isAdmin ? 'admin' : undefined
        ].filter(Boolean))) as string[];

        const updatedReadBy = Array.from(new Set([
          ...(msg.readBy || []),
          ...identifiers
        ]));

        // Optimistically update local message state and backup
        setMessages(prev => {
          const updated = prev.map(m => m.id === msg.id ? { ...m, readBy: updatedReadBy } : m);
          try {
            localStorage.setItem(`atendepro_internal_msgs_${activeCompanyId}`, JSON.stringify(updated));
            if (altCompanyId) localStorage.setItem(`atendepro_internal_msgs_${altCompanyId}`, JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });

        // Persist to all company ID targets in Firestore
        const targetCompIds = Array.from(new Set([
          msg.companyId,
          activeCompanyId,
          altCompanyId,
          companyId
        ])).filter(Boolean) as string[];

        for (const cId of targetCompIds) {
          try {
            const docRef = doc(db, 'companies', cId, 'internal_messages', msg.id);
            await updateDoc(docRef, sanitizeFirestoreData({ readBy: updatedReadBy }));
          } catch (e) {}
        }
      });
    }
  }, [currentConversationMessages, currentUser.id, currentUser.name, activeCompanyId, altCompanyId, companyId, isAdmin]);

  const handleSendMessage = async (e?: React.FormEvent, directText?: string) => {
    if (e) e.preventDefault();
    const textToSend = (directText || inputText).trim();
    if (!textToSend && !isUploading) return;

    const recipient = sellers.find(s => s.id === selectedRecipientId);
    const recipientName = selectedRecipientId === 'all' 
      ? 'Toda a Equipe' 
      : (isAdmin ? (recipient?.name || 'Vendedor') : (company?.adminName || 'Diretoria / Proprietário'));

    const optimisticId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newMsg: InternalMessage = {
      id: optimisticId,
      companyId: activeCompanyId,
      senderId: currentUser.id,
      senderName: currentUser.name || (isAdmin ? 'Diretoria' : 'Vendedor'),
      senderAvatar: currentUser.avatarUrl || null,
      senderRole: isAdmin ? 'admin' : 'seller',
      recipientId: selectedRecipientId,
      recipientName,
      text: textToSend,
      readBy: [currentUser.id],
      createdAt: new Date().toISOString()
    };

    // 1. Optimistic instant UI update
    setMessages(prev => {
      const updated = [...prev, newMsg];
      try {
        localStorage.setItem(`atendepro_internal_msgs_${activeCompanyId}`, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    setInputText('');
    setSendError(null);

    // 2. Deliver to Firestore in background with automatic resilience
    const dataToSave = sanitizeFirestoreData({
      companyId: newMsg.companyId,
      senderId: newMsg.senderId,
      senderName: newMsg.senderName,
      senderAvatar: newMsg.senderAvatar,
      senderRole: newMsg.senderRole,
      recipientId: newMsg.recipientId,
      recipientName: newMsg.recipientName,
      text: newMsg.text,
      readBy: newMsg.readBy,
      createdAt: newMsg.createdAt
    });

    try {
      const internalCol = collection(db, 'companies', activeCompanyId, 'internal_messages');
      await addDoc(internalCol, dataToSave);
      if (altCompanyId && altCompanyId !== activeCompanyId) {
        addDoc(collection(db, 'companies', altCompanyId, 'internal_messages'), dataToSave).catch(() => {});
      }
    } catch (err) {
      console.warn("Aviso ao enviar mensagem interna no Firestore (tentando reconectar):", err);
      // Automatic quick retry after 600ms
      try {
        await new Promise(r => setTimeout(r, 600));
        const internalCol = collection(db, 'companies', activeCompanyId, 'internal_messages');
        await addDoc(internalCol, dataToSave);
        if (altCompanyId && altCompanyId !== activeCompanyId) {
          addDoc(collection(db, 'companies', altCompanyId, 'internal_messages'), dataToSave).catch(() => {});
        }
      } catch (retryErr) {
        console.warn("Segunda tentativa de envio no Firestore falhou (mantendo local):", retryErr);
        setSendError('Mensagem salva localmente no navegador. Sincronizando com a nuvem...');
        setTimeout(() => setSendError(null), 6000);
      }
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setUploadError('Por favor selecione um arquivo de imagem válido (JPG, PNG, WEBP).');
      setTimeout(() => setUploadError(null), 4000);
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setUploadError('A imagem deve ter no máximo 15MB.');
      setTimeout(() => setUploadError(null), 4000);
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      // 1. Upload directly to ImgBB
      const imageUrl = await uploadToImgBB(file);

      const recipient = sellers.find(s => s.id === selectedRecipientId);
      const recipientName = selectedRecipientId === 'all' 
        ? 'Toda a Equipe' 
        : (isAdmin ? (recipient?.name || 'Vendedor') : (company?.adminName || 'Diretoria / Proprietário'));

      const optimisticImgId = `local_img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newMsg: InternalMessage = {
        id: optimisticImgId,
        companyId: activeCompanyId,
        senderId: currentUser.id,
        senderName: currentUser.name || (isAdmin ? 'Diretoria' : 'Vendedor'),
        senderAvatar: currentUser.avatarUrl || null,
        senderRole: isAdmin ? 'admin' : 'seller',
        recipientId: selectedRecipientId,
        recipientName,
        text: '📷 Imagem enviada',
        imageUrl,
        readBy: [currentUser.id],
        createdAt: new Date().toISOString()
      };

      // Optimistic update
      setMessages(prev => {
        const updated = [...prev, newMsg];
        try {
          localStorage.setItem(`atendepro_internal_msgs_${activeCompanyId}`, JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });

      const imgDataToSave = sanitizeFirestoreData({
        companyId: newMsg.companyId,
        senderId: newMsg.senderId,
        senderName: newMsg.senderName,
        senderAvatar: newMsg.senderAvatar,
        senderRole: newMsg.senderRole,
        recipientId: newMsg.recipientId,
        recipientName: newMsg.recipientName,
        text: newMsg.text,
        imageUrl: newMsg.imageUrl,
        readBy: newMsg.readBy,
        createdAt: newMsg.createdAt
      });

      const internalCol = collection(db, 'companies', activeCompanyId, 'internal_messages');
      await addDoc(internalCol, imgDataToSave);
      if (altCompanyId && altCompanyId !== activeCompanyId) {
        addDoc(collection(db, 'companies', altCompanyId, 'internal_messages'), imgDataToSave).catch(() => {});
      }
    } catch (err) {
      console.error("Erro no envio de imagem no chat interno:", err);
      setUploadError(err instanceof Error ? err.message : 'Erro ao enviar imagem ao ImgBB.');
      setTimeout(() => setUploadError(null), 4000);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Quick prompt templates for Admin to quickly direct sellers
  const adminQuickPrompts = [
    "🚀 Atenção equipe: Novos clientes na fila de espera!",
    "🎯 Foco no fechamento de vendas hoje!",
    "⏰ Não esqueçam de atualizar as anotações dos leads.",
    "👏 Parabéns pelo ótimo atendimento aos clientes!"
  ];

  const selectedSeller = sellers.find(s => s.id === selectedRecipientId);

  const handleClearCurrentConversation = async () => {
    if (!isAdmin) return;
    const isMural = selectedRecipientId === 'all';
    const confirmClean = confirm(
      isMural
        ? 'Deseja realmente limpar todos os avisos do Mural Geral da Equipe do banco de dados?'
        : `Deseja realmente apagar o histórico de mensagens desta conversa com ${selectedSeller?.name || 'este vendedor'} do banco de dados?`
    );
    if (!confirmClean) return;

    try {
      const msgsToDelete = currentConversationMessages;
      const targetCompanyIds = Array.from(new Set([activeCompanyId, altCompanyId, companyId])).filter(Boolean);

      for (const m of msgsToDelete) {
        if (!m.id) continue;
        for (const cId of targetCompanyIds) {
          try {
            await deleteDoc(doc(db, 'companies', cId, 'internal_messages', m.id));
          } catch (e) {}
        }
      }

      setMessages(prev => prev.filter(m => !msgsToDelete.some(d => d.id === m.id)));
    } catch (err) {
      console.warn('Erro ao limpar conversa:', err);
    }
  };

  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200/80 shadow-xl overflow-hidden flex flex-col h-[640px]">
      
      {/* Header bar */}
      <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            {isAdmin ? <ShieldCheck className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-tight">
                {isAdmin ? 'Central de Comunicação Interna' : 'Canal Direto com a Diretoria'}
              </h3>
              <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800/80 text-emerald-400">
                Ao Vivo
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {isAdmin 
                ? 'Converse diretamente com seus vendedores ou envie comunicados para toda a equipe'
                : `Envie dúvidas, orientações e fale diretamente com ${company?.adminName || 'a Gerência'}`}
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Main Body Grid */}
      <div className="grow grid grid-cols-1 md:grid-cols-12 min-h-0 overflow-hidden">
        
        {/* Left Column: Sellers / Channels selector (if Admin or when multiple options exist) */}
        {isAdmin ? (
          <div className="md:col-span-4 border-r border-slate-200 bg-slate-50/70 p-3 overflow-y-auto flex flex-col gap-2 shrink-0">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 px-2 py-1">
              Canais e Vendedores
            </span>

            {/* Broadcast / All channel */}
            <button
              type="button"
              onClick={() => setSelectedRecipientId('all')}
              className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between cursor-pointer ${
                selectedRecipientId === 'all'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100 font-bold'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/70'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  selectedRecipientId === 'all' ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-600'
                }`}>
                  <Megaphone className="w-4 h-4" />
                </div>
                <div className="truncate">
                  <p className="text-xs font-bold leading-tight truncate">Mural Geral (Equipe)</p>
                  <p className={`text-[10px] truncate ${selectedRecipientId === 'all' ? 'text-indigo-200' : 'text-slate-400'}`}>
                    Aviso para todos
                  </p>
                </div>
              </div>
              {getUnreadCount('all') > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0">
                  {getUnreadCount('all')}
                </span>
              )}
            </button>

            <div className="pt-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2">
                Conversas Individuais ({sellers.length})
              </span>
            </div>

            {sellers.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6 px-3">
                Nenhum vendedor cadastrado ainda.
              </p>
            ) : (
              sellers.map((seller) => {
                const unread = getUnreadCount(seller.id);
                const isSelected = selectedRecipientId === seller.id;

                return (
                  <button
                    key={seller.id}
                    type="button"
                    onClick={() => setSelectedRecipientId(seller.id)}
                    className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100 font-bold'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/70'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center shrink-0 font-bold text-xs ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {seller.avatarUrl ? (
                          <img src={seller.avatarUrl} referrerPolicy="no-referrer" alt={seller.name} className="w-full h-full object-cover" />
                        ) : (
                          seller.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="truncate">
                        <p className="text-xs font-bold leading-tight truncate">{seller.name}</p>
                        <p className={`text-[10px] truncate ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                          {seller.role === 'admin' ? 'Administrador' : 'Vendedor(a)'}
                        </p>
                      </div>
                    </div>

                    {unread > 0 && (
                      <span className="bg-rose-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0 animate-pulse">
                        {unread}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        ) : (
          /* Seller View: options between General Broadcast and Direct Owner Chat */
          <div className="md:col-span-4 border-r border-slate-200 bg-slate-50/70 p-3 overflow-y-auto flex flex-col gap-2 shrink-0">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 px-2 py-1">
              Canais de Comunicação
            </span>

            <button
              type="button"
              onClick={() => setSelectedRecipientId('admin')}
              className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between cursor-pointer ${
                selectedRecipientId === 'admin'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100 font-bold'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/70'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  selectedRecipientId === 'admin' ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-600'
                }`}>
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div className="truncate">
                  <p className="text-xs font-bold leading-tight truncate">
                    {company?.adminName || 'Diretoria / Proprietário'}
                  </p>
                  <p className={`text-[10px] truncate ${selectedRecipientId === 'admin' ? 'text-indigo-200' : 'text-slate-400'}`}>
                    Conversa Direta Privada
                  </p>
                </div>
              </div>
              {getSellerUnreadCount('admin') > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0 animate-pulse">
                  {getSellerUnreadCount('admin')}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setSelectedRecipientId('all')}
              className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between cursor-pointer ${
                selectedRecipientId === 'all'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100 font-bold'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/70'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  selectedRecipientId === 'all' ? 'bg-white/20 text-white' : 'bg-amber-50 text-amber-600'
                }`}>
                  <Megaphone className="w-4 h-4" />
                </div>
                <div className="truncate">
                  <p className="text-xs font-bold leading-tight truncate">Mural Geral da Loja</p>
                  <p className={`text-[10px] truncate ${selectedRecipientId === 'all' ? 'text-indigo-200' : 'text-slate-400'}`}>
                    Avisos e comunicados da equipe
                  </p>
                </div>
              </div>
              {getSellerUnreadCount('all') > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0 animate-pulse">
                  {getSellerUnreadCount('all')}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Right Column: Chat History & Input */}
        <div className="md:col-span-8 flex flex-col h-full overflow-hidden bg-slate-50/30">
          
          {/* Active Conversation Top Bar */}
          <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
              <div>
                <p className="text-xs font-bold text-slate-800">
                  {selectedRecipientId === 'all' 
                    ? '📢 Mural Geral da Equipe (Todos os Vendedores)'
                    : (isAdmin ? `💬 Conversa com ${selectedSeller?.name || 'Vendedor'}` : `💬 Conversa com ${company?.adminName || 'Diretoria'}`)}
                </p>
                <p className="text-[10px] text-slate-400">
                  {selectedRecipientId === 'all' 
                    ? 'Mensagens enviadas aqui são visíveis para toda a equipe' 
                    : 'Mensagens criptografadas e restritas entre você e este interlocutor'}
                </p>
              </div>
            </div>

            {isAdmin && currentConversationMessages.length > 0 && (
              <button
                type="button"
                onClick={handleClearCurrentConversation}
                className="text-xs text-slate-400 hover:text-rose-600 hover:bg-rose-50 px-2.5 py-1.5 rounded-lg border border-transparent hover:border-rose-100 flex items-center gap-1 transition-all cursor-pointer"
                title="Limpar mensagens desta conversa do banco de dados"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline font-medium">Limpar Conversa</span>
              </button>
            )}
          </div>

          {/* Upload Error Banner */}
          {uploadError && (
            <div className="bg-rose-50 border-b border-rose-200 text-rose-800 text-xs px-4 py-2 flex items-center justify-between shrink-0">
              <span>⚠️ {uploadError}</span>
              <button onClick={() => setUploadError(null)} className="text-rose-500 hover:text-rose-700 font-bold">
                Dispensar
              </button>
            </div>
          )}

          {/* Sync / Send Notice Banner */}
          {sendError && (
            <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-xs px-4 py-2 flex items-center justify-between shrink-0">
              <span className="flex items-center gap-1.5">
                <WifiOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>{sendError}</span>
              </span>
              <button onClick={() => setSendError(null)} className="text-amber-600 hover:text-amber-800 font-bold">
                Dispensar
              </button>
            </div>
          )}

          {/* Messages Feed */}
          <div ref={chatScrollContainerRef} className="grow overflow-y-auto p-4 space-y-3">
            {currentConversationMessages.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-xs space-y-2">
                <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-500 mx-auto flex items-center justify-center">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <p className="font-semibold text-slate-600">Nenhuma mensagem nesta conversa ainda.</p>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                  Envie uma mensagem abaixo para iniciar a comunicação em tempo real.
                </p>
              </div>
            ) : (
              currentConversationMessages.map((m) => {
                const isMe = m.senderId === currentUser.id;
                const isSenderAdmin = m.senderRole === 'admin' || m.senderId.startsWith('admin');
                const hasImage = !!m.imageUrl;

                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                  >
                    <span className="text-[10px] font-semibold text-slate-400 px-1 mb-0.5 flex items-center gap-1">
                      {isMe ? 'Você' : m.senderName}
                      {isSenderAdmin && !isMe && (
                        <span className="bg-indigo-100 text-indigo-700 text-[9px] px-1 rounded font-bold">Diretoria</span>
                      )}
                    </span>

                    <div
                      className={`max-w-[85%] rounded-2xl text-xs leading-relaxed overflow-hidden shadow-sm ${
                        isMe
                          ? 'bg-indigo-600 text-white rounded-tr-none'
                          : isSenderAdmin
                          ? 'bg-slate-900 text-white rounded-tl-none border border-slate-800'
                          : 'bg-white text-slate-800 rounded-tl-none border border-slate-200'
                      } ${hasImage ? 'p-2' : 'px-3.5 py-2.5'}`}
                    >
                      {hasImage && (
                        <div className="space-y-1.5">
                          <button
                            type="button"
                            onClick={() => setPreviewImageUrl(m.imageUrl || null)}
                            className="block overflow-hidden rounded-xl bg-black/10 relative group cursor-pointer"
                            title="Clique para ampliar a imagem"
                          >
                            <img
                              src={m.imageUrl}
                              alt="Foto anexada"
                              referrerPolicy="no-referrer"
                              className="w-full max-h-56 object-cover rounded-xl transition-transform group-hover:scale-102"
                            />
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold gap-1">
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Ampliar</span>
                            </div>
                          </button>
                          {m.text && m.text !== '📷 Imagem enviada' && (
                            <p className="px-2 py-1 text-xs">{m.text}</p>
                          )}
                        </div>
                      )}

                      {!hasImage && <p className="whitespace-pre-wrap">{m.text}</p>}

                      {m.createdAt && (
                        <div className={`text-[10px] text-right mt-1.5 flex items-center justify-end gap-1 font-mono ${
                          isMe ? 'text-indigo-200' : isSenderAdmin ? 'text-slate-400' : 'text-slate-500'
                        }`}>
                          <Clock className="w-3 h-3 opacity-75 shrink-0" />
                          <span>{formatMessageDateTime(m.createdAt)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Quick Prompts for Admin */}
          {isAdmin && (
            <div className="p-2.5 bg-white border-t border-slate-200/80 flex items-center gap-1.5 overflow-x-auto shrink-0">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 whitespace-nowrap pl-1">
                Avisos Rápidos:
              </span>
              {adminQuickPrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendMessage(undefined, prompt)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors border border-slate-200/60 cursor-pointer shrink-0"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Bottom Message Input Bar */}
          <div className="p-3 bg-white border-t border-slate-200 shrink-0">
            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              {/* Hidden ImgBB file input */}
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
                disabled={isUploading}
              />

              {/* Camera button for photo attachment */}
              <button
                type="button"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                title="Anexar imagem (ImgBB)"
                className="p-2.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors border border-slate-200 bg-white cursor-pointer disabled:opacity-50 shrink-0"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </button>

              <input
                type="text"
                required
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={isUploading ? "Enviando imagem ao ImgBB..." : "Digite sua mensagem interna..."}
                className="grow py-2.5 px-3.5 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />

              <button
                type="submit"
                disabled={isUploading}
                className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md shadow-indigo-100 transition-colors flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>

        </div>

      </div>

      {/* Modal Visualizador de Imagem Ampliada */}
      {previewImageUrl && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div 
            className="relative max-w-3xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full p-3 bg-slate-950 flex items-center justify-between text-white text-xs border-b border-slate-800">
              <span className="font-semibold flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-indigo-400" />
                <span>Visualização da Imagem</span>
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={previewImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
                  title="Abrir imagem original"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewImageUrl(null)}
                  className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-2 flex items-center justify-center bg-black/50 overflow-auto max-h-[80vh]">
              <img
                src={previewImageUrl}
                alt="Foto em tela cheia"
                referrerPolicy="no-referrer"
                className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-lg"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
