import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, addDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Chat, User, Message, ChatStatus } from '../types';
import { crmAlarm } from '../lib/audio';
import { 
  MessageSquare, User as UserIcon, Send, LogOut, Phone, ShieldClose, 
  Volume2, VolumeX, Sparkles, Copy, Check, CheckSquare 
} from 'lucide-react';

interface SellerDashboardProps {
  companyId: string;
  sellerUser: User;
  onLogout: () => void;
}

export default function SellerDashboard({ companyId, sellerUser, onLogout }: SellerDashboardProps) {
  const [chats, setAvailableChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [selectedChatMessages, setSelectedChatMessages] = useState<Message[]>([]);
  const [currentResponse, setCurrentResponse] = useState('');
  const [alarmIsSounding, setAlarmIsSounding] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Template Quick Answers
  const replies = [
    'Olá! Me chamo ' + sellerUser.name + ', como posso te ajudar hoje?',
    'Um momento, por favor, estou buscando suas informações no sistema.',
    'Excelente escolha! Temos essa opção disponível para pronta entrega.',
    'Qual seria a melhor forma de pagamento para darmos andamento?',
    'Seu pedido foi registrado! Em breve lhe envio o código para acompanhamento.',
    'Foi um prazer lhe atender! Obrigado pela preferência e até a próxima.'
  ];

  const bottomRef = useRef<HTMLDivElement>(null);

  // 1. Listen to ALL chats in real-time under this company to check new and current active assignments
  useEffect(() => {
    const chatsCollectionRef = collection(db, 'companies', companyId, 'chats');
    const q = query(chatsCollectionRef, orderBy('lastMessageAt', 'desc'));

    const unsub = onSnapshot(q, (snapshot) => {
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

      setAvailableChats(list);

      // Sound management rules: Alarm rings if there are pending chats in status 'new'
      if (pendingAlertCount > 0) {
        setAlarmIsSounding(true);
        crmAlarm.start();
      } else {
        setAlarmIsSounding(false);
        crmAlarm.stop();
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `companies/${companyId}/chats`);
    });

    return () => {
      unsub();
      crmAlarm.stop();
    };
  }, [companyId]);

  // 2. Active Chat Messages list watcher
  useEffect(() => {
    if (!selectedChatId) {
      setSelectedChatMessages([]);
      return;
    }

    const messagesRef = collection(db, 'companies', companyId, 'chats', selectedChatId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    const unsubMessages = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((d) => {
        msgs.push({ id: d.id, ...d.data() } as Message);
      });
      setSelectedChatMessages(msgs);

      // Automatically flag messages as read-by-seller when they inspect the tab
      const currentChatObj = chats.find(c => c.id === selectedChatId);
      if (currentChatObj && currentChatObj.unreadBySeller) {
        const chatDocRef = doc(db, 'companies', companyId, 'chats', selectedChatId);
        updateDoc(chatDocRef, { unreadBySeller: false }).catch(err => console.log("Erro auto-read vendedor:", err));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `companies/${companyId}/chats/${selectedChatId}/messages`);
    });

    return () => unsubMessages();
  }, [selectedChatId, companyId, chats]);

  // Scroll to bottom upon receiving or dispatching messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedChatMessages]);

  // Claims a chat from unassigned index list
  const handleClaimChat = async (chat: Chat) => {
    try {
      const chatDocRef = doc(db, 'companies', companyId, 'chats', chat.id);
      
      await updateDoc(chatDocRef, {
        status: ChatStatus.ACTIVE,
        sellerId: sellerUser.id,
        sellerName: sellerUser.name,
        unreadBySeller: false,
        updatedAt: new Date().toISOString()
      });

      // Add a system welcome alert message inside stream
      const messagesRef = collection(db, 'companies', companyId, 'chats', chat.id, 'messages');
      await addDoc(messagesRef, {
        chatId: chat.id,
        companyId,
        senderType: 'seller',
        senderName: 'AtendePro Sistema',
        text: `O atendimento foi assumido por: **${sellerUser.name}**`,
        createdAt: new Date().toISOString()
      });

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
      await addDoc(messagesRef, {
        chatId: selectedChatId,
        companyId,
        senderType: 'seller',
        senderName: sellerUser.name,
        text: finalMsgText,
        createdAt: new Date().toISOString()
      });

      const chatDocRef = doc(db, 'companies', companyId, 'chats', selectedChatId);
      await updateDoc(chatDocRef, {
        lastMessage: finalMsgText,
        lastMessageAt: new Date().toISOString(),
        lastMessageSender: 'seller',
        unreadByClient: true,
        unreadBySeller: false,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Erro ao enviar mensagem:", err);
    }
  };

  const handleCloseChat = async () => {
    if (!selectedChatId) return;
    if (!confirm('Tem certeza de que deseja CONCLUIR e ARQUIVAR este atendimento?')) return;

    try {
      const chatDocRef = doc(db, 'companies', companyId, 'chats', selectedChatId);
      await updateDoc(chatDocRef, {
        status: ChatStatus.CLOSED,
        updatedAt: new Date().toISOString()
      });

      // System notification
      const messagesRef = collection(db, 'companies', companyId, 'chats', selectedChatId, 'messages');
      await addDoc(messagesRef, {
        chatId: selectedChatId,
        companyId,
        senderType: 'seller',
        senderName: 'AtendePro Sistema',
        text: `--- Atendimento encerrado por ${sellerUser.name} ---`,
        createdAt: new Date().toISOString()
      });

      setSelectedChatId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopyLink = () => {
    const clientLink = `${window.location.origin}${window.location.pathname}?view=client`;
    navigator.clipboard.writeText(clientLink);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const currentChat = chats.find(c => c.id === selectedChatId);
  const claimableChats = chats.filter(c => c.status === ChatStatus.NEW);
  const myActiveChats = chats.filter(c => c.status === ChatStatus.ACTIVE && c.sellerId === sellerUser.id);

  return (
    <div className="w-full flex flex-col gap-6">
      
      {/* Top Banner Context Card */}
      <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative overflow-hidden shrink-0 shadow-lg shadow-slate-900/10">
        <div>
          <span className="text-indigo-400 font-extrabold text-[10px] tracking-wider uppercase bg-indigo-950/50 border border-indigo-800/10 px-2.5 py-0.5 rounded-full inline-block mb-1.5">
            CONEXÃO REAL-TIME ATIVA
          </span>
          <h2 className="text-xl font-bold tracking-tight">Atendimentos de {sellerUser.name}</h2>
          <p className="text-xs text-slate-400 mt-0.5">Vendedor(a) Autorizado da Loja • CRM AtendePro</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Audio Alarm Indicator indicator */}
          {alarmIsSounding ? (
            <div className="bg-amber-500/15 border border-amber-500/20 text-amber-500 text-xs px-3.5 py-1.5 rounded-xl flex items-center gap-2 animate-bounce">
              <Volume2 className="w-4 h-4 text-amber-400 rotate-12 shrink-0 animate-ping" />
              <span className="font-bold">Campainha Tocando! Atenda o suporte.</span>
            </div>
          ) : (
            <div className="bg-slate-800 border border-slate-700/80 text-slate-400 text-xs px-3 py-1.5 rounded-xl flex items-center gap-2">
              <VolumeX className="w-4 h-4 shrink-0 text-slate-500" />
              <span>Sons Carregados e Silenciados</span>
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

          <button
            onClick={onLogout}
            className="text-xs bg-rose-950/20 hover:bg-rose-950/40 border border-rose-900/20 rounded-xl px-3.5 py-1.5 text-rose-400 flex items-center gap-1.5 font-bold transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair</span>
          </button>
        </div>
      </div>

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
              <div className="grow overflow-y-auto p-5 space-y-4" id="messages-panel">
                {selectedChatMessages.map((m) => {
                  const isSystem = m.senderName === 'AtendePro Sistema';
                  const isSeller = m.senderType === 'seller';
                  
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
                        className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          isSeller
                            ? 'bg-slate-800 text-slate-100 rounded-tr-none border border-slate-800 shadow-md shadow-slate-100'
                            : 'bg-indigo-50 text-slate-900 rounded-tl-none border border-indigo-100 shadow-sm'
                        }`}
                      >
                        {m.text}
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

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

                <form onSubmit={handleSendResponse} className="flex items-center gap-3">
                  <input
                    type="text"
                    required
                    value={currentResponse}
                    onChange={(e) => setCurrentResponse(e.target.value)}
                    placeholder="Escreva sua resposta de atendimento..."
                    className="grow py-2.5 px-4 text-sm text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md shadow-indigo-100 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
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

    </div>
  );
}
