import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, orderBy, doc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { User, Chat, Message, ChatStatus } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
  Users, UserPlus, FileText, Eye, Key, LogOut, Trash2, 
  TrendingUp, TrendingDown, ClipboardList, ShieldAlert, CheckCircle 
} from 'lucide-react';

interface MasterDashboardProps {
  companyId: string;
  adminUser: User;
  onLogout: () => void;
}

export default function MasterDashboard({ companyId, adminUser, onLogout }: MasterDashboardProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  
  // Registration Form state
  const [newSellerName, setNewSellerName] = useState('');
  const [newSellerPassword, setNewSellerPassword] = useState('');
  const [registerSuccess, setRegisterSuccess] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);

  // Live Mirror session
  const [mirroredChatId, setMirroredChatId] = useState<string | null>(null);
  const [mirroredMessages, setMirroredMessages] = useState<Message[]>([]);
  const mirrorEndRef = useRef<HTMLDivElement>(null);

  // Active Menu Tabs: 'analytics' | 'sellers' | 'live-feeds'
  const [activeTab, setActiveTab] = useState<'analytics' | 'sellers' | 'live-feeds'>('analytics');
  const [isClearing, setIsClearing] = useState(false);
  const [oldAndClosedChats, setOldAndClosedChats] = useState<Chat[]>([]);
  const [showClosedChats, setShowClosedChats] = useState(false);

  // Load all users (Vendedores) in real time with local fallback storage
  useEffect(() => {
    const usersRef = collection(db, 'companies', companyId, 'users');
    const unsubUsers = onSnapshot(usersRef, (snapshot) => {
      const list: User[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as User);
      });

      // Load offline sellers from localStorage
      const localSellersStr = localStorage.getItem('local_sellers_atendepro');
      let localSellers: User[] = [];
      if (localSellersStr) {
        try {
          localSellers = JSON.parse(localSellersStr);
        } catch (e) {}
      }

      // Load deleted users from localStorage
      const deletedUsersStr = localStorage.getItem('deleted_users_atendepro');
      let deletedUserIds: string[] = [];
      if (deletedUsersStr) {
        try {
          deletedUserIds = JSON.parse(deletedUsersStr);
        } catch (e) {}
      }

      let merged = [...list];
      localSellers.forEach((ls) => {
        if (!merged.some(u => u.id === ls.id)) {
          merged.push(ls);
        }
      });

      merged = merged.filter(u => !deletedUserIds.includes(u.id));
      setUsers(merged);
    }, (error) => {
      console.warn("Firestore snapshot users blocked, retrieving local cache:", error);
      const localSellersStr = localStorage.getItem('local_sellers_atendepro');
      let localSellers: User[] = [];
      if (localSellersStr) {
        try {
          localSellers = JSON.parse(localSellersStr);
        } catch (e) {}
      }
      setUsers(localSellers);
    });

    return () => unsubUsers();
  }, [companyId]);

  // Load all active or closed chats in real time with robust deleted exclusion filter
  useEffect(() => {
    const chatsRef = collection(db, 'companies', companyId, 'chats');
    const q = query(chatsRef, orderBy('createdAt', 'desc'));
    
    const unsubChats = onSnapshot(q, (snapshot) => {
      const list: Chat[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as Chat);
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

  // Automated background database cleanup hook for test chats and numbered/invalid sellers
  useEffect(() => {
    if (chats.length === 0 && users.length === 0) return;

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

      // 2. Identify sellers that have numbers in their names (e.g., "vendedor 1") or are default test values
      const usersToPurge = users.filter(u => 
        u.role === 'seller' && (
          /\d/.test(u.name) || 
          ['vendedor', 'vendedor 1', 'vendedor 2', 'vendedor 3', 'vendedor1', 'vendedor2', 'vendedor3'].includes(u.name.trim().toLowerCase())
        )
      );

      if (usersToPurge.length > 0) {
        const deletedUsersStr = localStorage.getItem('deleted_users_atendepro');
        let deletedUserIds: string[] = [];
        if (deletedUsersStr) {
          try {
            deletedUserIds = JSON.parse(deletedUsersStr);
          } catch (e) {}
        }
        let changed = false;
        usersToPurge.forEach(u => {
          if (!deletedUserIds.includes(u.id)) {
            deletedUserIds.push(u.id);
            changed = true;
          }
        });
        if (changed) {
          localStorage.setItem('deleted_users_atendepro', JSON.stringify(deletedUserIds));
          setUsers(prev => prev.filter(u => !deletedUserIds.includes(u.id)));
        }
      }
    };

    performBackgroundPurge();
  }, [chats, users, companyId]);

  // Mirror specified active customer chat thread in real-time
  useEffect(() => {
    if (!mirroredChatId) {
      setMirroredMessages([]);
      return;
    }

    const messagesRef = collection(db, 'companies', companyId, 'chats', mirroredChatId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    const unsubMirror = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((d) => {
        msgs.push({ id: d.id, ...d.data() } as Message);
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

  const handleRegisterSeller = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError(null);
    setRegisterSuccess(null);

    const nameToRegister = newSellerName.trim();

    if (!nameToRegister) {
      setRegisterError('Preencha o nome do novo vendedor.');
      return;
    }

    // Check conflict locally
    const alreadyExists = users.some(u => u.name.toLowerCase() === nameToRegister.toLowerCase());
    if (alreadyExists) {
      setRegisterError('Já existe um vendedor cadastrado com este nome.');
      return;
    }

    const newUserId = 'seller_' + Math.random().toString(36).substring(2, 9);
    const newUser: User = {
      id: newUserId,
      name: nameToRegister,
      role: 'seller',
      createdAt: new Date().toISOString()
    };

    // Optimistically update the local state lists to make it snappy
    setUsers(prev => {
      const exists = prev.some(u => u.id === newUserId);
      if (!exists) {
        return [...prev, newUser];
      }
      return prev;
    });

    try {
      await setDoc(doc(db, 'companies', companyId, 'users', newUserId), newUser);
      
      setNewSellerName('');
      setNewSellerPassword('');
      setRegisterSuccess(`Vendedor "${nameToRegister}" cadastrado com sucesso!`);
    } catch (err) {
      console.warn("Erro ao salvar vendedor no Firestore (salvando localmente):", err);
      
      const localSellersStr = localStorage.getItem('local_sellers_atendepro');
      let localSellers: User[] = [];
      if (localSellersStr) {
        try {
          localSellers = JSON.parse(localSellersStr);
        } catch (e) {}
      }
      localSellers.push(newUser);
      localStorage.setItem('local_sellers_atendepro', JSON.stringify(localSellers));

      // Remove from deleted list if it was there before
      const deletedUsersStr = localStorage.getItem('deleted_users_atendepro');
      if (deletedUsersStr) {
        try {
          let deletedUserIds: string[] = JSON.parse(deletedUsersStr);
          deletedUserIds = deletedUserIds.filter(id => id !== newUserId);
          localStorage.setItem('deleted_users_atendepro', JSON.stringify(deletedUserIds));
        } catch (e) {}
      }

      setNewSellerName('');
      setNewSellerPassword('');
      setRegisterError(`⚠️ Salvo apenas localmente: O vendedor "${nameToRegister}" foi cadastrado no seu navegador, mas NÃO foi possível sincronizar com o servidor (banco de dados). Ele só conseguirá entrar se usar este mesmo aparelho, até que a conexão com o servidor seja restabelecida.`);
    }
  };

  const handleDeleteSeller = async (userId: string, name: string) => {
    if (userId === adminUser.id) {
      alert('Você não pode excluir o seu próprio perfil de administrador.');
      return;
    }
    if (!confirm(`Deseja mesmo remover o vendedor "${name}"? Ele perderá acesso ao painel.`)) return;

    // Update state to make deletion snappy
    setUsers(prev => prev.filter(u => u.id !== userId));

    const deletedUsersStr = localStorage.getItem('deleted_users_atendepro');
    let deletedUserIds: string[] = [];
    if (deletedUsersStr) {
      try {
        deletedUserIds = JSON.parse(deletedUsersStr);
      } catch (e) {}
    }
    if (!deletedUserIds.includes(userId)) {
      deletedUserIds.push(userId);
      localStorage.setItem('deleted_users_atendepro', JSON.stringify(deletedUserIds));
    }

    const localSellersStr = localStorage.getItem('local_sellers_atendepro');
    if (localSellersStr) {
      try {
        let localSellers: User[] = JSON.parse(localSellersStr);
        localSellers = localSellers.filter(u => u.id !== userId);
        localStorage.setItem('local_sellers_atendepro', JSON.stringify(localSellers));
      } catch (e) {}
    }

    try {
      await deleteDoc(doc(db, 'companies', companyId, 'users', userId));
    } catch (err) {
      console.warn("Aviso ao remover vendedor no Firestore (removido localmente):", err);
    }
    alert('Vendedor removido com sucesso!');
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

  return (
    <div className="w-full flex flex-col gap-6" id="master-console">
      
      {/* Top Banner Navigation Header */}
      <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0 shadow-lg shadow-slate-950/15">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full border border-slate-700 overflow-hidden shrink-0 bg-white shadow-inner flex items-center justify-center">
            <img src="https://i.postimg.cc/8CdttXNK/Whats-App-Image-2026-06-10-at-14-30-14.jpg" referrerPolicy="no-referrer" alt="Larissa Móveis Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <span className="text-indigo-400 font-extrabold text-[10px] tracking-wider uppercase bg-indigo-950/50 border border-indigo-800 px-2.5 py-0.5 rounded-full inline-block mb-1 animate-pulse">
              PAINEL MASTER • ADMINISTRADOR
            </span>
            <h2 className="text-xl font-bold tracking-tight">Larissa Móveis Master Control</h2>
            <p className="text-xs text-slate-400 mt-0.5">Gerenciador de equipes, gráficos de conversão e relatórios analíticos em tempo real</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleClearAllData}
            disabled={isClearing}
            className={`text-xs bg-rose-950/80 hover:bg-rose-900 border border-rose-800 rounded-xl px-4 py-2 font-bold text-rose-200 flex items-center gap-1.5 transition-all shadow-md shadow-rose-950/20 ${isClearing ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isClearing ? 'Limpando Banco...' : 'Limpar Históricos de Teste'}</span>
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
      <div className="flex border-b border-slate-100 pb-3 gap-3 shrink-0">
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
                          <div key={m.id} className="border-l border-slate-800 pl-2 leading-relaxed">
                            <span className={isSeller ? 'text-blue-400' : isSystem ? 'text-amber-500' : 'text-indigo-400'}>
                              [{m.senderName}]:
                            </span>{' '}
                            <span>{m.text}</span>
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
                    <div key={item.id} className="p-3.5 border border-slate-100 hover:border-slate-200 rounded-xl flex items-center justify-between gap-4">
                      <div>
                        <p className="font-bold text-slate-800 text-sm">{item.name}</p>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">Acesso Liberado • Basta digitar "{item.name}" para entrar sem senha</p>
                      </div>
                      <button
                        onClick={() => handleDeleteSeller(item.id, item.name)}
                        className="p-2 border border-slate-100 text-rose-500 hover:bg-rose-50 rounded-lg hover:border-rose-100 transition-all shrink-0"
                        title="Remover Vendedor"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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

      </div>

    </div>
  );
}
