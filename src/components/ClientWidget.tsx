import React, { useState, useEffect, useRef } from 'react';
import { doc, setDoc, collection, onSnapshot, query, orderBy, addDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Chat, Message, ChatStatus } from '../types';
import { Send, MessageSquare, Phone, User, CheckCheck, Landmark, RefreshCw, XCircle } from 'lucide-react';

interface ClientWidgetProps {
  companyId: string;
  companyName: string;
  onGoBack: () => void;
}

export default function ClientWidget({ companyId, companyName, onGoBack }: ClientWidgetProps) {
  const [chatId, setChatId] = useState<string | null>(localStorage.getItem(`atendepro_client_chat_id`));
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  // Form Fields for new chat request
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [initialMsg, setInitialMsg] = useState('');

  // Form Field for actively writing messages
  const [currentMessage, setCurrentMessage] = useState('');
  
  const bottomRef = useRef<HTMLDivElement>(null);

  // 1. If chatId exists, listen to Chat doc and Messages subcollection in real time
  useEffect(() => {
    if (!chatId) return;

    // Chat Metadata listener
    const chatDocRef = doc(db, 'companies', companyId, 'chats', chatId);
    const unsubChat = onSnapshot(chatDocRef, (snapshot) => {
      if (snapshot.exists()) {
        setActiveChat({ id: snapshot.id, ...snapshot.data() } as Chat);
      } else {
        // Chat was deleted on server side, wipe localStorage
        localStorage.removeItem(`atendepro_client_chat_id`);
        setChatId(null);
        setActiveChat(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `companies/${companyId}/chats/${chatId}`);
    });

    // Messages array list listener
    const messagesCollectionRef = collection(db, 'companies', companyId, 'chats', chatId, 'messages');
    const messagesQuery = query(messagesCollectionRef, orderBy('createdAt', 'asc'));
    
    const unsubMessages = onSnapshot(messagesQuery, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((d) => {
        msgs.push({ id: d.id, ...d.data() } as Message);
      });
      setMessages(msgs);
      
      // Mark read list for client side (if last message came from seller, write update to chat that customer has seen it)
      if (activeChat && activeChat.lastMessageSender === 'seller' && activeChat.unreadByClient) {
        updateDoc(chatDocRef, { unreadByClient: false }).catch(err => console.log("Erro auto-read client:", err));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `companies/${companyId}/chats/${chatId}/messages`);
    });

    return () => {
      unsubChat();
      unsubMessages();
    };
  }, [chatId, companyId, activeChat?.lastMessageSender, activeChat?.unreadByClient]);

  // Scroll viewport down upon new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleStartChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) return;

    setLoading(true);
    const newChatId = 'chat_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString().slice(-4);

    try {
      const generatedChat: Chat = {
        id: newChatId,
        companyId,
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim() || undefined,
        status: ChatStatus.NEW,
        unreadBySeller: true,
        unreadByClient: false,
        lastMessage: initialMsg.trim() || 'Iniciou o atendimento',
        lastMessageAt: new Date().toISOString(),
        lastMessageSender: 'client',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Create new chat doc
      await setDoc(doc(db, 'companies', companyId, 'chats', newChatId), generatedChat);

      // Create first message if provided
      const messagesRef = collection(db, 'companies', companyId, 'chats', newChatId, 'messages');
      const textToPulse = initialMsg.trim() || 'Olá! Gostaria de iniciar um atendimento comercial.';
      
      await addDoc(messagesRef, {
        chatId: newChatId,
        companyId,
        senderType: 'client',
        senderName: clientName.trim(),
        text: textToPulse,
        createdAt: new Date().toISOString()
      });

      // Save to localStorage to persist reload/navigation
      localStorage.setItem(`atendepro_client_chat_id`, newChatId);
      setChatId(newChatId);
    } catch (err) {
      console.error(err);
      alert('Houve um erro ao solicitar atendimento em tempo real. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentMessage.trim() || !chatId) return;

    const messageText = currentMessage.trim();
    setCurrentMessage('');

    try {
      const messagesRef = collection(db, 'companies', companyId, 'chats', chatId, 'messages');
      await addDoc(messagesRef, {
        chatId,
        companyId,
        senderType: 'client',
        senderName: activeChat?.clientName || 'Cliente',
        text: messageText,
        createdAt: new Date().toISOString()
      });

      // Update Chat record status
      const chatDocRef = doc(db, 'companies', companyId, 'chats', chatId);
      await updateDoc(chatDocRef, {
        lastMessage: messageText,
        lastMessageAt: new Date().toISOString(),
        lastMessageSender: 'client',
        unreadBySeller: true,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error(err);
    }
  };

  const clearChatSession = () => {
    if (confirm('Deseja mesmo encerrar e abrir uma nova solicitação de atendimento?')) {
      localStorage.removeItem(`atendepro_client_chat_id`);
      setChatId(null);
      setActiveChat(null);
      setMessages([]);
      setInitialMsg('');
    }
  };

  // If no chatId is tracked, show clean register login form
  if (!chatId) {
    return (
      <div className="max-w-lg w-full bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden mt-6 transition-all duration-300">
        
        {/* Header Block */}
        <div className="bg-indigo-600 text-white p-6 relative">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <MessageSquare className="w-24 h-24" />
          </div>
          <p className="text-indigo-100 text-xs font-semibold uppercase tracking-wider">Suporte Ao Vivo</p>
          <h2 className="text-2xl font-bold tracking-tight">{companyName}</h2>
          <p className="text-sm text-indigo-200 mt-1">
            Fale instantaneamente com os nossos vendedores em tempo real!
          </p>
        </div>

        {/* Content Form Body */}
        <form onSubmit={handleStartChat} className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">
              Como podemos lhe chamar? *
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Seu nome completo ou apelido"
                className="w-full text-slate-800 text-sm py-2.5 px-3.5 pl-10 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">
              Telefone / WhatsApp (Opcional)
            </label>
            <div className="relative">
              <input
                type="tel"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="Ex: (85) 98765-4321"
                className="w-full text-slate-800 text-sm py-2.5 px-3.5 pl-10 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Phone className="w-4 h-4" />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-1">
              Qual sua dúvida ou solicitação inicial?
            </label>
            <textarea
              rows={2}
              value={initialMsg}
              onChange={(e) => setInitialMsg(e.target.value)}
              placeholder="Digite aqui o que você está precisando..."
              className="w-full text-slate-800 text-sm p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div className="pt-2">
            <button
               type="submit"
              disabled={loading}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-lg shadow-indigo-150 flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Conectando Chamado...</span>
                </>
              ) : (
                <>
                  <MessageSquare className="w-4 h-4" />
                  <span>Iniciar Atendimento de Suporte</span>
                </>
              )}
            </button>
          </div>

          {/* Quick return link to master menu */}
          <div className="pt-1 text-center">
            <button
              type="button"
              onClick={onGoBack}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-wider font-semibold"
            >
              Voltar ao painel inicial
            </button>
          </div>
        </form>
      </div>
    );
  }

  // Active Live Chat widget structure
  return (
    <div className="max-w-2xl w-full bg-slate-50 rounded-2xl border border-slate-200 shadow-xl overflow-hidden h-[630px] flex flex-col transition-all duration-300">
      
      {/* Active Conversation Header */}
      <div className="bg-indigo-600 text-white px-5 py-4 shrink-0 flex items-center justify-between shadow-md relative">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
            <User className="w-5 h-5 text-indigo-200" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm tracking-tight text-white">{activeChat?.clientName || 'Seu Chat'}</h3>
              <span className="text-[10px] bg-slate-800 text-slate-100 border border-slate-700 font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                ID: {chatId.replace('chat_', '').slice(0, 5)}
              </span>
            </div>
            
            {/* Status Queue details */}
            <div className="text-xs text-indigo-100 flex items-center gap-1.5 mt-0.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span>
                {activeChat?.status === ChatStatus.NEW && 'Aguardando vendedor aceitar o chamado...'}
                {activeChat?.status === ChatStatus.ACTIVE && `Atendido em tempo real por ${activeChat.sellerName}`}
                {activeChat?.status === ChatStatus.CLOSED && 'Chamado Concluído / Encerrado'}
              </span>
            </div>
          </div>
        </div>

        <div>
          <button
            onClick={clearChatSession}
            title="Encerrar e abrir outro chamado"
            className="text-xs bg-black/20 hover:bg-black/30 px-3 py-1.5 rounded-lg text-white font-medium flex items-center gap-1.5 transition-colors border border-white/15 cursor-pointer"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Novo Chamado</span>
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="grow overflow-y-auto p-5 space-y-4 bg-white" id="messages-stream">
        
        {/* Welcome indicator */}
        <div className="text-center py-2 text-xs text-slate-400">
          Início do histórico de chat instantâneo - AtendePro CRM
        </div>

        {messages.map((m) => {
          const isMe = m.senderType === 'client';
          return (
            <div
              key={m.id}
              className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-fade-in`}
            >
              <div className="text-[10px] text-slate-400 font-medium px-2 mb-0.5 uppercase tracking-wide">
                {isMe ? 'Você' : m.senderName}
              </div>
              <div
                className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  isMe
                    ? 'bg-indigo-600 text-white rounded-tr-none shadow-md shadow-indigo-50'
                    : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-100'
                }`}
              >
                {m.text}
              </div>
            </div>
          );
        })}

        {/* Closed chat alert overlay inside stream */}
        {activeChat?.status === ChatStatus.CLOSED && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center space-y-3 mt-4">
            <p className="text-xs text-slate-500 font-semibold">
              Este atendimento foi fechado e resolvido pelo Vendedor {activeChat.sellerName || 'Atendente'}.
            </p>
            <button
              onClick={clearChatSession}
              className="inline-flex items-center gap-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-all shadow-md shadow-indigo-150 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Desejo Abrir Outra Conversa</span>
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Active Messaging input footer */}
      {activeChat?.status !== ChatStatus.CLOSED && (
        <form onSubmit={handleSendMessage} className="bg-slate-50 border-t border-slate-200 p-4 shrink-0 flex items-center gap-3">
          <input
            type="text"
            required
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            placeholder="Digite sua resposta comercial..."
            className="grow py-2.5 px-4 text-sm text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
          <button
            type="submit"
            className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md shadow-indigo-100 transition-colors flex items-center justify-center shrink-0 cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      )}

    </div>
  );
}
