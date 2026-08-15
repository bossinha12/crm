import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, addDoc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, sanitizeFirestoreData } from '../lib/firebase';
import { uploadToImgBB } from '../lib/imgbb';
import { Chat, User, Message, ChatStatus, Company } from '../types';
import { crmAlarm } from '../lib/audio';
import { 
  MessageSquare, User as UserIcon, Send, LogOut, Phone, ShieldClose, 
  Volume2, VolumeX, Sparkles, Copy, Check, CheckSquare,
  Image as ImageIcon, Camera, Loader2, ExternalLink, X, ShieldCheck, Megaphone
} from 'lucide-react';
import InternalTeamChat from './InternalTeamChat';

interface SellerDashboardProps {
  companyId: string;
  company?: Company | null;
  sellerUser: User;
  onLogout: () => void;
}

export default function SellerDashboard({ companyId, company, sellerUser, onLogout }: SellerDashboardProps) {
  const [chats, setAvailableChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [selectedChatMessages, setSelectedChatMessages] = useState<Message[]>([]);
  const [currentResponse, setCurrentResponse] = useState('');
  const [alarmIsSounding, setAlarmIsSounding] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Internal Direct Team Chat with Owner / Management
  const [isInternalChatOpen, setIsInternalChatOpen] = useState(false);
  const [unreadInternalMsgs, setUnreadInternalMsgs] = useState(0);
  const [lastAdminNotice, setLastAdminNotice] = useState<string | null>(null);
  const [companySellers, setCompanySellers] = useState<User[]>([]);

  // Image Upload State
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Keep a synced ref of chats to prevent re-subscriptions in dependent effects
  const chatsRef = useRef<Chat[]>([]);
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  // Mute preference and auto-registration setup with CRMAlarm
  const [soundMuted, setSoundMuted] = useState(() => {
    const saved = localStorage.getItem('atendepro_sound_muted');
    const isMuted = saved === 'true';
    crmAlarm.setMuted(isMuted);
    return isMuted;
  });

  const toggleSound = () => {
    const nextMuted = !soundMuted;
    setSoundMuted(nextMuted);
    crmAlarm.setMuted(nextMuted);
    localStorage.setItem('atendepro_sound_muted', String(nextMuted));
    
    if (!nextMuted) {
      crmAlarm.playTestBeep();
      const hasPending = chatsRef.current.some(c => c.status === ChatStatus.NEW);
      if (hasPending) {
        setAlarmIsSounding(true);
        crmAlarm.start();
      }
    } else {
      crmAlarm.stop();
      setAlarmIsSounding(false);
    }
  };

  // Template Quick Answers
  const replies = [
    'Olá! Me chamo ' + sellerUser.name + ', como posso te ajudar hoje?',
    'Um momento, por favor, estou buscando suas informações no sistema.',
    'Excelente escolha! Temos essa opção disponível para pronta entrega.',
    'Qual seria a melhor forma de pagamento para darmos andamento?',
    'Seu pedido foi registrado! Em breve lhe envio o código para acompanhamento.',
    'Foi um prazer lhe atender! Obrigado pela preferência e até a próxima.'
  ];

  const sellerMessagesContainerRef = useRef<HTMLDivElement>(null);

  // 1. Listen to ALL chats in real-time under this company to check new and current active assignments
  // (Index-free query with robust in-memory sorting to survive missing index errors)
  useEffect(() => {
    const chatsCollectionRef = collection(db, 'companies', companyId, 'chats');

    const unsub = onSnapshot(chatsCollectionRef, (snapshot) => {
      const list: Chat[] = [];
      let pendingAlertCount = 0;

      snapshot.forEach((d) => {
        const item = { id: d.id, ...d.data() } as Chat;
        list.push(item);

        // Check if there are unassigned waiting calls to beep-alert the console
        if (item.status === ChatStatus.NEW) {
          pendingAlertCount++;
        }
      });

      // Sort in-memory by lastMessageAt descending
      list.sort((a, b) => {
        const timeA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const timeB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return timeB - timeA;
      });

      setAvailableChats(list);

      // Sound management rules: Alarm rings if there are pending chats in status 'new' and sound is not muted
      if (pendingAlertCount > 0 && !crmAlarm.getMuted()) {
        setAlarmIsSounding(true);
        crmAlarm.start();
      } else {
        setAlarmIsSounding(false);
        crmAlarm.stop();
      }
    }, (error) => {
      console.warn("Aviso ao carregar chats do Firestore em tempo real (usando contingência):", error);
    });

    return () => {
      unsub();
      crmAlarm.stop();
    };
  }, [companyId]);

  // Hook to log out if the seller's user document is deleted from Firestore (server confirmed)
  useEffect(() => {
    if (sellerUser.id === 'admin-larissa') return;
    const userDocRef = doc(db, 'companies', companyId, 'users', sellerUser.id);
    const unsubUser = onSnapshot(userDocRef, (snapshot: any) => {
      if (!snapshot.exists() && !snapshot.metadata?.fromCache) {
        alert("Atenção: Seu perfil de vendedor foi removido pelo administrador. Você foi desconectado.");
        onLogout();
      }
    }, (error) => {
      console.warn("Aviso ao monitorar perfil do vendedor no Firestore:", error);
    });
    return () => unsubUser();
  }, [sellerUser.id, companyId, onLogout]);

  // Load all sellers for the company context
  useEffect(() => {
    const usersCol = collection(db, 'companies', companyId, 'users');
    const unsubUsers = onSnapshot(usersCol, (snapshot) => {
      const list: User[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as User);
      });
      setCompanySellers(list);
    }, (error) => {
      console.warn("Aviso ao carregar vendedores:", error);
    });

    return () => unsubUsers();
  }, [companyId]);

  // Real-time listener for internal messages from Admin / Management to this Seller or to 'all'
  useEffect(() => {
    const internalCol = collection(db, 'companies', companyId, 'internal_messages');
    const unsubInternal = onSnapshot(internalCol, (snapshot) => {
      let unread = 0;
      let latestNotice: string | null = null;

      snapshot.forEach((d) => {
        const data = d.data();
        const isForMe = data.recipientId === sellerUser.id || data.recipientId === 'all';
        const fromAdmin = data.senderRole === 'admin' || data.senderId.startsWith('admin');

        if (isForMe && fromAdmin) {
          latestNotice = data.text;
          if (!data.readBy || !data.readBy.includes(sellerUser.id)) {
            unread++;
          }
        }
      });

      setUnreadInternalMsgs(unread);
      setLastAdminNotice(latestNotice);
    }, (error) => {
      console.warn("Aviso ao monitorar mensagens internas do vendedor:", error);
    });

    return () => unsubInternal();
  }, [companyId, sellerUser.id]);

  // Hook to automatically unselect the active chat if it gets deleted from resources
  useEffect(() => {
    if (selectedChatId && chats.length > 0) {
      const exists = chats.some(c => c.id === selectedChatId);
      if (!exists) {
        setSelectedChatId(null);
        setSelectedChatMessages([]);
      }
    }
  }, [chats, selectedChatId]);

  // 2. Active Chat Messages list watcher
  // (Index-free query with robust in-memory sorting)
  useEffect(() => {
    if (!selectedChatId) {
      setSelectedChatMessages([]);
      return;
    }

    const messagesRef = collection(db, 'companies', companyId, 'chats', selectedChatId, 'messages');

    const unsubMessages = onSnapshot(messagesRef, (snapshot) => {
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

      setSelectedChatMessages(msgs);

      // Automatically flag messages as read-by-seller when they inspect the tab
      const currentChatObj = chatsRef.current.find(c => c.id === selectedChatId);
      if (currentChatObj && currentChatObj.unreadBySeller) {
        const chatDocRef = doc(db, 'companies', companyId, 'chats', selectedChatId);
        getDoc(chatDocRef).then((snap) => {
          if (snap.exists()) {
            updateDoc(chatDocRef, sanitizeFirestoreData({ unreadBySeller: false })).catch(err => console.log("Erro auto-read vendedor:", err));
          }
        }).catch(err => console.log("Erro ao checar chat antes de auto-read:", err));
      }
    }, (error) => {
      console.warn("Aviso ao carregar mensagens do Firestore em tempo real (usando contingência):", error);
    });

    return () => unsubMessages();
  }, [selectedChatId, companyId]);

  // Scroll to bottom of message container upon receiving or dispatching messages safely
  useEffect(() => {
    if (sellerMessagesContainerRef.current) {
      sellerMessagesContainerRef.current.scrollTop = sellerMessagesContainerRef.current.scrollHeight;
    }
  }, [selectedChatMessages.length]);

  // Claims a chat from unassigned index list
  const handleClaimChat = async (chat: Chat) => {
    try {
      const chatDocRef = doc(db, 'companies', companyId, 'chats', chat.id);
      
      await updateDoc(chatDocRef, sanitizeFirestoreData({
        status: ChatStatus.ACTIVE,
        sellerId: sellerUser.id,
        sellerName: sellerUser.name,
        unreadBySeller: false,
        updatedAt: new Date().toISOString()
      }));

      // Add a system welcome alert message inside stream
      const messagesRef = collection(db, 'companies', companyId, 'chats', chat.id, 'messages');
      await addDoc(messagesRef, sanitizeFirestoreData({
        chatId: chat.id,
        companyId,
        senderType: 'seller',
        senderName: 'Sistema',
        text: `O atendimento foi assumido por: **${sellerUser.name}**`,
        createdAt: new Date().toISOString()
      }));

      setSelectedChatId(chat.id);
    } catch (err) {
      console.error("Erro ao aceitar atendimento:", err);
    }
  };

  const handleSendResponse = async (e: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    const finalMsgText = (customText || currentResponse).trim();
    if (!finalMsgText || !selectedChatId) return;

    if (!customText) {
      setCurrentResponse('');
    }

    try {
      const messagesRef = collection(db, 'companies', companyId, 'chats', selectedChatId, 'messages');
      await addDoc(messagesRef, sanitizeFirestoreData({
        chatId: selectedChatId,
        companyId,
        senderType: 'seller',
        senderName: sellerUser.name,
        text: finalMsgText,
        createdAt: new Date().toISOString()
      }));

      const chatDocRef = doc(db, 'companies', companyId, 'chats', selectedChatId);
      await updateDoc(chatDocRef, sanitizeFirestoreData({
        lastMessage: finalMsgText,
        lastMessageAt: new Date().toISOString(),
        lastMessageSender: 'seller',
        unreadByClient: true,
        unreadBySeller: false,
        updatedAt: new Date().toISOString()
      }));
    } catch (err) {
      console.error("Erro ao enviar mensagem:", err);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChatId) return;

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

    setIsUploadingImage(true);
    setUploadError(null);

    try {
      // Upload directly to ImgBB (hosted outside database)
      const imageUrl = await uploadToImgBB(file);

      // Save message in Firestore with image URL only
      const messagesRef = collection(db, 'companies', companyId, 'chats', selectedChatId, 'messages');
      await addDoc(messagesRef, sanitizeFirestoreData({
        chatId: selectedChatId,
        companyId,
        senderType: 'seller',
        senderName: sellerUser.name,
        text: '📷 Foto do produto enviada',
        imageUrl,
        createdAt: new Date().toISOString()
      }));

      const chatDocRef = doc(db, 'companies', companyId, 'chats', selectedChatId);
      await updateDoc(chatDocRef, sanitizeFirestoreData({
        lastMessage: '📷 Foto',
        lastMessageAt: new Date().toISOString(),
        lastMessageSender: 'seller',
        unreadByClient: true,
        unreadBySeller: false,
        updatedAt: new Date().toISOString()
      }));
    } catch (err) {
      console.error("Erro ao enviar imagem pelo vendedor:", err);
      setUploadError(err instanceof Error ? err.message : 'Erro ao enviar imagem ao ImgBB.');
      setTimeout(() => setUploadError(null), 4000);
    } finally {
      setIsUploadingImage(false);
      if (imageInputRef.current) {
        imageInputRef.current.value = '';
      }
    }
  };

  const handleCloseChat = async () => {
    if (!selectedChatId) return;
    if (!confirm('Tem certeza de que deseja CONCLUIR e ARQUIVAR este atendimento?')) return;

    try {
      const chatDocRef = doc(db, 'companies', companyId, 'chats', selectedChatId);
      await updateDoc(chatDocRef, sanitizeFirestoreData({
        status: ChatStatus.CLOSED,
        updatedAt: new Date().toISOString()
      }));

      // System notification
      const messagesRef = collection(db, 'companies', companyId, 'chats', selectedChatId, 'messages');
      await addDoc(messagesRef, sanitizeFirestoreData({
        chatId: selectedChatId,
        companyId,
        senderType: 'seller',
        senderName: 'Sistema',
        text: `--- Atendimento encerrado por ${sellerUser.name} ---`,
        createdAt: new Date().toISOString()
      }));

      setSelectedChatId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopyLink = () => {
    const companyParam = companyId !== 'atendepro_default' ? `&company=${companyId}` : '';
    const clientLink = `${window.location.origin}${window.location.pathname}?view=client${companyParam}`;
    navigator.clipboard.writeText(clientLink);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const currentChat = chats.find(c => c.id === selectedChatId);
  const claimableChats = chats.filter(c => c.status === ChatStatus.NEW);
  const myActiveChats = chats.filter(c => c.status === ChatStatus.ACTIVE && c.sellerId === sellerUser.id);

  const currentLogo = company?.logoUrl || '';
  const currentName = company?.name || 'Atendimento Online';

  return (
    <div className="w-full flex flex-col gap-6">
      
      {/* Top Banner Context Card */}
      <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative overflow-hidden shrink-0 shadow-lg shadow-slate-900/10">
        <div className="flex items-center gap-3.5 mr-auto">
          <div className="w-12 h-12 rounded-2xl border border-slate-700 overflow-hidden shrink-0 bg-indigo-950/40 shadow-inner flex items-center justify-center">
            {currentLogo ? (
              <img src={currentLogo} referrerPolicy="no-referrer" alt={`${currentName} Logo`} className="w-full h-full object-cover" />
            ) : (
              <MessageSquare className="w-6 h-6 text-indigo-400" />
            )}
          </div>
          <div>
            <span className="text-indigo-400 font-extrabold text-[10px] tracking-wider uppercase bg-indigo-950/50 border border-indigo-800/10 px-2.5 py-0.5 rounded-full inline-block mb-1">
              CONEXÃO REAL-TIME ATIVA
            </span>
            <h2 className="text-xl font-bold tracking-tight">Atendimentos de {sellerUser.name}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{currentName} • CRM Atendimento</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Audio Alarm Controller (Click to test/unmute) */}
          <button
            onClick={toggleSound}
            className={`text-xs font-semibold px-3.5 py-1.5 rounded-xl flex items-center gap-2 transition-all cursor-pointer ${
              soundMuted 
                ? 'bg-rose-950/40 hover:bg-rose-950/60 border border-rose-900/30 text-rose-400 animate-pulse' 
                : 'bg-emerald-950/40 hover:bg-emerald-950/60 border border-emerald-900/30 text-emerald-400'
            }`}
            title={soundMuted ? 'Clique para Ativar Alarme Sonoro' : 'Clique para Silenciar Alarme Sonoro'}
          >
            {soundMuted ? (
              <>
                <VolumeX className="w-4 h-4 shrink-0 text-rose-400" />
                <span>Campainha Silenciada (Ativar Som 🔊)</span>
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>Campainha Ativada (Som Ativo)</span>
              </>
            )}
          </button>

          {/* Audio Alarm Status Alert */}
          {alarmIsSounding && !soundMuted && (
            <div className="bg-amber-500/15 border border-amber-500/20 text-amber-500 text-xs px-3.5 py-1.5 rounded-xl flex items-center gap-2 animate-bounce">
              <Volume2 className="w-4 h-4 text-amber-400 rotate-12 shrink-0 animate-ping" />
              <span className="font-bold">Cliente Chamando! Atenda o suporte.</span>
            </div>
          )}

          {/* Customer Support direct sharing link copier */}
          <button
            onClick={handleCopyLink}
            className="text-xs bg-slate-800 hover:bg-slate-700/80 border border-slate-700 font-semibold px-3 py-1.5 rounded-xl text-slate-200 flex items-center gap-1.5 transition-all text-left"
          >
            {isCopied ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-500" />
                <span className="text-green-400">Link Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Link dos Clientes</span>
              </>
            )}
          </button>

          {/* Internal Chat with Owner / Management Button */}
          <button
            type="button"
            onClick={() => setIsInternalChatOpen(true)}
            className={`text-xs font-bold px-3.5 py-1.5 rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-sm ${
              unreadInternalMsgs > 0
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white animate-pulse shadow-indigo-500/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
            title="Abrir comunicação direta com o Proprietário / Gerência"
          >
            <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
            <span>Falar com Diretoria</span>
            {unreadInternalMsgs > 0 && (
              <span className="bg-rose-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
                {unreadInternalMsgs} {unreadInternalMsgs === 1 ? 'novo' : 'novos'}
              </span>
            )}
          </button>

          <button
            onClick={onLogout}
            className="text-xs bg-rose-950/20 hover:bg-rose-950/40 border border-rose-900/20 rounded-xl px-3.5 py-1.5 text-rose-400 flex items-center gap-1.5 font-bold transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair</span>
          </button>
        </div>
      </div>

      {/* Internal Management Notice Banner (if there are unread messages) */}
      {unreadInternalMsgs > 0 && (
        <div 
          onClick={() => setIsInternalChatOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl p-4 flex items-center justify-between gap-4 cursor-pointer shadow-lg shadow-indigo-500/20 transition-all border border-indigo-500"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Megaphone className="w-5 h-5 text-white animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded bg-white/20 text-white">
                  Aviso da Diretoria / Gerência
                </span>
                <span className="text-xs font-bold text-indigo-100">
                  {unreadInternalMsgs} nova{unreadInternalMsgs > 1 ? 's' : ''} mensagem{unreadInternalMsgs > 1 ? 'ens' : ''}
                </span>
              </div>
              <p className="text-xs font-medium text-white mt-0.5 line-clamp-1">
                {lastAdminNotice || 'Você possui nova mensagem da diretoria. Clique para responder.'}
              </p>
            </div>
          </div>
          <button className="px-3.5 py-1.5 bg-white text-indigo-700 hover:bg-indigo-50 text-xs font-bold rounded-xl shrink-0 transition-colors shadow-sm">
            Responder Agora 💬
          </button>
        </div>
      )}

      {/* Main Grid: Left sidebar directories vs Right active conversation chat feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Sidebar directory lists (Lg: col-span-4) */}
        <div className="lg:col-span-4 flex flex-col gap-6" id="seller-directories">
          
          {/* 1. Queue waiting list chamados */}
          <div className="bg-white border border-slate-100 rounded-2xl shadow-xl p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <span className="h-2 w-2 bg-amber-500 rounded-full animate-ping"></span>
                <span>Chamados Aguardando ({claimableChats.length})</span>
              </h3>
            </div>

            {claimableChats.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-slate-100 rounded-xl text-slate-400 text-xs">
                Nenhum novo cliente na fila agora.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[220px] overflow-y-auto">
                {claimableChats.map((c) => (
                  <div key={c.id} className="p-3 border border-indigo-100 bg-indigo-50/20 rounded-xl flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{c.clientName}</p>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">{c.lastMessage}</p>
                    </div>
                    <button
                      onClick={() => handleClaimChat(c)}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-100 shrink-0 cursor-pointer"
                    >
                      Atender
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. My Active conversations list directory */}
          <div className="bg-white border border-slate-100 rounded-2xl shadow-xl p-4 flex flex-col grow shrink-0 min-h-[300px]">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-3">
              <CheckSquare className="w-3.5 h-3.5 text-slate-400" />
              <span>Meus Atendimentos Ativos ({myActiveChats.length})</span>
            </h3>

            {myActiveChats.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-100 rounded-xl text-slate-400 text-xs grow flex flex-col justify-center">
                Você não possui nenhum chat ativo no momento. Aceite chamados da lista acima para começar!
              </div>
            ) : (
              <div className="space-y-2.5 overflow-y-auto grow max-h-[350px]">
                {myActiveChats.map((c) => {
                  const isActiveTab = c.id === selectedChatId;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedChatId(c.id)}
                      className={`w-full text-left p-3.5 rounded-xl border flex items-center justify-between gap-4 transition-all relative cursor-pointer ${
                        isActiveTab
                          ? 'border-indigo-500 bg-indigo-50/30'
                          : 'border-slate-100 hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sm text-slate-800 truncate">{c.clientName}</span>
                          {c.clientPhone && (
                            <span className="text-[10px] text-slate-400 shrink-0">({c.clientPhone})</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate mt-0.5">{c.lastMessage || 'Nenhuma conversa ainda...'}</p>
                      </div>

                      {/* Red notification dots for unread bubbles */}
                      {c.unreadBySeller && (
                        <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0"></div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Selected Chat Box Feed console (Lg: col-span-8) */}
        <div className="lg:col-span-8 bg-white border border-slate-100 rounded-2xl shadow-xl flex flex-col h-[580px] overflow-hidden">
          
          {selectedChatId ? (
            <div className="flex flex-col h-full grow shrink-0 min-h-0">
              
              {/* Active Conversation header */}
              <div className="bg-slate-50 px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-800 text-base">{currentChat?.clientName}</h3>
                    {currentChat?.clientPhone && (
                      <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md font-mono">{currentChat.clientPhone}</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">Tempo real • Conversando com você</p>
                </div>

                <div>
                  <button
                    onClick={handleCloseChat}
                    className="text-xs bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 px-4 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <ShieldClose className="w-3.5 h-3.5" />
                    <span>Concluir Chamado</span>
                  </button>
                </div>
              </div>

              {/* Messages Body */}
              <div ref={sellerMessagesContainerRef} className="grow overflow-y-auto p-5 space-y-4" id="messages-panel">
                {selectedChatMessages.map((m) => {
                  const isSystem = m.senderName === 'Sistema';
                  const isSeller = m.senderType === 'seller';
                  const hasImage = !!m.imageUrl;
                  
                  if (isSystem) {
                    return (
                      <div key={m.id} className="text-center py-1 text-slate-400 font-mono text-[10px]">
                        {m.text}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isSeller ? 'items-end' : 'items-start'} animate-fade-in`}
                    >
                      <span className="text-[10px] text-slate-400 px-2 mb-0.5 font-bold uppercase tracking-wider">
                        {isSeller ? 'Você' : m.senderName}
                      </span>
                      <div
                        className={`max-w-[85%] rounded-2xl text-sm leading-relaxed overflow-hidden ${
                          isSeller
                            ? 'bg-slate-800 text-slate-100 rounded-tr-none border border-slate-800 shadow-md shadow-slate-100'
                            : 'bg-indigo-50 text-slate-900 rounded-tl-none border border-indigo-100 shadow-sm'
                        } ${hasImage ? 'p-2' : 'px-4 py-2.5'}`}
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
                                alt="Imagem enviada"
                                referrerPolicy="no-referrer"
                                className="w-full max-h-64 object-cover rounded-xl transition-transform group-hover:scale-102"
                              />
                              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold gap-1">
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span>Ampliar</span>
                              </div>
                            </button>
                            {m.text && m.text !== '📷 Foto enviada' && m.text !== '📷 Foto' && m.text !== '📷 Foto do produto enviada' && (
                              <p className="px-2 py-1 text-xs">{m.text}</p>
                            )}
                          </div>
                        )}
                        {!hasImage && m.text}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Upload error banner */}
              {uploadError && (
                <div className="bg-rose-50 border-t border-rose-200 text-rose-800 text-xs px-4 py-2 flex items-center justify-between">
                  <span>⚠️ {uploadError}</span>
                  <button onClick={() => setUploadError(null)} className="text-rose-500 hover:text-rose-700 font-bold">
                    Dispensar
                  </button>
                </div>
              )}

              {/* Quick Template Answers and Field response inputs */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 shrink-0 space-y-3">
                
                {/* Scrollable replies badges */}
                <div className="flex items-center gap-2 overflow-x-auto text-[11px] py-1 border-b border-slate-200 pb-2">
                  <span className="text-slate-400 font-bold uppercase tracking-wider shrink-0 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-indigo-500" />
                    <span>Atalhos Rápidos:</span>
                  </span>
                  {replies.map((rep, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendResponse(null as any, rep)}
                      className="shrink-0 bg-white border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/20 text-slate-600 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                    >
                      {rep.slice(0, 30)}...
                    </button>
                  ))}
                </div>

                <form onSubmit={handleSendResponse} className="flex items-center gap-2">
                  {/* Hidden File Input for ImgBB Upload */}
                  <input
                    type="file"
                    ref={imageInputRef}
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                    disabled={isUploadingImage}
                  />

                  {/* Camera / Image Upload Button */}
                  <button
                    type="button"
                    disabled={isUploadingImage}
                    onClick={() => imageInputRef.current?.click()}
                    title="Enviar foto do produto (hospedada no ImgBB)"
                    className="p-2.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 active:bg-indigo-100 rounded-xl transition-all flex items-center justify-center shrink-0 border border-slate-200 bg-white cursor-pointer disabled:opacity-50"
                  >
                    {isUploadingImage ? (
                      <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                    ) : (
                      <Camera className="w-5 h-5" />
                    )}
                  </button>

                  <input
                    type="text"
                    required
                    value={currentResponse}
                    onChange={(e) => setCurrentResponse(e.target.value)}
                    placeholder={isUploadingImage ? "Enviando imagem ao ImgBB..." : "Escreva sua resposta de atendimento..."}
                    className="grow py-2.5 px-4 text-sm text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={isUploadingImage}
                    className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md shadow-indigo-100 transition-colors flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
                {isUploadingImage && (
                  <p className="text-[11px] text-indigo-600 font-medium flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Hospedando foto no ImgBB... Aguarde.</span>
                  </p>
                )}
              </div>

            </div>
          ) : (
            <div className="grow flex flex-col items-center justify-center text-center p-8 select-none">
              <div className="w-16 h-16 rounded-3xl bg-slate-50 flex items-center justify-center mb-4 text-slate-400 border border-slate-100">
                <MessageSquare className="w-8 h-8" />
              </div>
              <h4 className="font-extrabold text-slate-800 text-lg leading-tight">Nenhum Atendimento Selecionado</h4>
              <p className="text-slate-400 text-xs max-w-sm mt-1">
                Escolha uma das abas ao lado para carregar o histórico de chamados em tempo real ou assuma um novo atendente na fila!
              </p>
            </div>
          )}

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
                  title="Abrir no navegador"
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

      {/* Modal / Dialog de Comunicação Direta com o Proprietário / Diretoria */}
      {isInternalChatOpen && (
        <div 
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setIsInternalChatOpen(false)}
        >
          <div 
            className="relative max-w-4xl w-full max-h-[95vh] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <InternalTeamChat
              companyId={companyId}
              currentUser={sellerUser}
              sellers={companySellers.filter(u => u.role === 'seller')}
              company={company}
              onClose={() => setIsInternalChatOpen(false)}
            />
          </div>
        </div>
      )}

    </div>
  );
}
