export enum ChatStatus {
  NEW = 'new',
  ACTIVE = 'active',
  CLOSED = 'closed'
}

export interface Company {
  id: string;
  name: string;
  createdAt: string;
  status?: 'active' | 'blocked';
  blockMessage?: string;
  plan?: string;
  expiresAt?: string;
}

export interface User {
  id: string;
  name: string;
  password?: string;
  role: 'admin' | 'seller';
  createdAt: string;
  activeChatsCount?: number;
}

export interface Chat {
  id: string;
  companyId: string;
  clientName: string;
  clientPhone?: string;
  status: ChatStatus;
  sellerId?: string;
  sellerName?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  lastMessageSender?: 'client' | 'seller';
  unreadBySeller?: boolean;
  unreadByClient?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  chatId: string;
  companyId: string;
  senderType: 'client' | 'seller';
  senderName: string;
  text: string;
  createdAt: string;
}

export interface Report {
  id: string;
  month: string; // e.g. "2026-06"
  totalServiceCount: number;
  sellerDocStats: Array<{
    sellerName: string;
    chatsCount: number;
    closedCount: number;
    activeCount: number;
  }>;
  generatedAt: string;
}
