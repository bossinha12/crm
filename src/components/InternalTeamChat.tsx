import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db, sanitizeFirestoreData } from '../lib/firebase';
import { uploadToImgBB } from '../lib/imgbb';
import { User, InternalMessage, Company } from '../types';
import { 
  Send, MessageSquare, Megaphone, User as UserIcon, CheckCheck, 
  Camera, Loader2, ExternalLink, X, Image as ImageIcon, ShieldCheck, 
  Sparkles, Check
} from 'lucide-react';

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

  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync targetSellerId when prop changes
  useEffect(() => {
    if (targetSellerId) {
      setSelectedRecipientId(targetSellerId);
    }
  }, [targetSellerId]);

  // Real-time listener for internal messages in this company
  useEffect(() => {
    const internalCol = collection(db, 'companies', companyId, 'internal_messages');
    const unsub = onSnapshot(internalCol, (snapshot) => {
      const list: InternalMessage[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as InternalMessage);
      });

      // Sort in-memory ascending by createdAt
      list.sort((a, b) => {
        const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tA - tB;
      });

      setMessages(list);

      // Backup locally
      localStorage.setItem(`atendepro_internal_msgs_${companyId}`, JSON.stringify(list));
    }, (error) => {
      console.warn("Aviso ao carregar mensagens internas do Firestore (usando fallback):", error);
      const saved = localStorage.getItem(`atendepro_internal_msgs_${companyId}`);
      if (saved) {
        try {
          setMessages(JSON.parse(saved));
        } catch (e) {}
      }
    });

    return () => unsub();
  }, [companyId]);

  // Auto-scroll when messages change or recipient changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedRecipientId]);

  // Filter messages for current view
  const currentConversationMessages = messages.filter((m) => {
    if (selectedRecipientId === 'all') {
      return m.recipientId === 'all';
    }

    if (isAdmin) {
      // Admin talking to specific seller
      return (
        (m.senderId === currentUser.id && m.recipientId === selectedRecipientId) ||
        (m.senderId === selectedRecipientId && (m.recipientId === 'admin' || m.recipientId === currentUser.id))
      );
    } else {
      // Seller talking to admin or seeing 'all'
      return (
        (m.senderId === currentUser.id && (m.recipientId === 'admin' || m.recipientId === 'all')) ||
        ((m.senderRole === 'admin' || m.senderId.startsWith('admin')) && (m.recipientId === currentUser.id || m.recipientId === 'all'))
      );
    }
  });

  // Calculate unread counters per seller (for admin view)
  const getUnreadCount = (recipientId: string) => {
    return messages.filter((m) => {
      if (m.senderId === currentUser.id) return false;
      const isRead = m.readBy && m.readBy.includes(currentUser.id);
      if (isRead) return false;

      if (recipientId === 'all') {
        return m.recipientId === 'all';
      }
      return m.senderId === recipientId;
    }).length;
  };

  // Mark messages as read when viewing conversation
  useEffect(() => {
    const unreadMsgs = currentConversationMessages.filter(
      (m) => m.senderId !== currentUser.id && (!m.readBy || !m.readBy.includes(currentUser.id))
    );

    if (unreadMsgs.length > 0) {
      unreadMsgs.forEach(async (msg) => {
        try {
          const docRef = doc(db, 'companies', companyId, 'internal_messages', msg.id);
          const updatedReadBy = [...(msg.readBy || []), currentUser.id];
          await updateDoc(docRef, sanitizeFirestoreData({ readBy: updatedReadBy }));
        } catch (e) {
          // ignore transient errors
        }
      });
    }
  }, [currentConversationMessages, currentUser.id, companyId]);

  const handleSendMessage = async (e?: React.FormEvent, directText?: string) => {
    if (e) e.preventDefault();
    const textToSend = (directText || inputText).trim();
    if (!textToSend && !isUploading) return;

    const recipient = sellers.find(s => s.id === selectedRecipientId);
    const recipientName = selectedRecipientId === 'all' 
      ? 'Toda a Equipe' 
      : (isAdmin ? (recipient?.name || 'Vendedor') : (company?.adminName || 'Diretoria / Proprietário'));

    const newMsg: Partial<InternalMessage> = {
      companyId,
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderRole: isAdmin ? 'admin' : 'seller',
      recipientId: selectedRecipientId,
      recipientName,
      text: textToSend,
      readBy: [currentUser.id],
      createdAt: new Date().toISOString()
    };

    setInputText('');

    try {
      const internalCol = collection(db, 'companies', companyId, 'internal_messages');
      await addDoc(internalCol, sanitizeFirestoreData(newMsg));
    } catch (err) {
      console.error("Erro ao enviar mensagem interna:", err);
      alert("Não foi possível enviar a mensagem. Verifique a conexão.");
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

      const newMsg: Partial<InternalMessage> = {
        companyId,
        senderId: currentUser.id,
        senderName: currentUser.name,
        senderRole: isAdmin ? 'admin' : 'seller',
        recipientId: selectedRecipientId,
        recipientName,
        text: '📷 Imagem enviada',
        imageUrl,
        readBy: [currentUser.id],
        createdAt: new Date().toISOString()
      };

      const internalCol = collection(db, 'companies', companyId, 'internal_messages');
      await addDoc(internalCol, sanitizeFirestoreData(newMsg));
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
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-xs ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {seller.name.charAt(0).toUpperCase()}
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

          {/* Messages Feed */}
          <div className="grow overflow-y-auto p-4 space-y-3">
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

                      <div className={`text-[9px] text-right mt-1 font-mono ${
                        isMe ? 'text-indigo-200' : isSenderAdmin ? 'text-slate-400' : 'text-slate-400'
                      }`}>
                        {m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
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
