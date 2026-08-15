export enum ChatStatus {
  NEW = 'new',
  ACTIVE = 'active',
  CLOSED = 'closed'
}

export type LicenseStatus = 'active' | 'trial' | 'blocked' | 'expired' | 'canceled';

export type LicensePlanType = 'lifetime' | 'monthly' | 'trial' | 'annual';

export interface CompanyLicense {
  status: LicenseStatus;
  planType?: LicensePlanType;
  isLifetime?: boolean;
  planName?: string;
  maxSellers?: number; // Limit of sellers allowed (0 or undefined = unlimited)
  expiresAt?: string;
  monthlyPrice?: number;
  contactPhone?: string;
  contactEmail?: string;
  notes?: string;
  createdAt?: string;
  lastPaymentDate?: string;
}

export interface Company {
  id: string;
  name: string;
  slug?: string;
  logoUrl?: string;
  primaryColor?: string;
  adminName?: string;
  adminPassword?: string;
  maxSellers?: number;
  createdAt: string;
  license?: CompanyLicense;
}

export interface User {
  id: string;
  name: string;
  password?: string;
  role: 'admin' | 'seller';
  createdAt: string;
  activeChatsCount?: number;
  avatarUrl?: string | null;
  deviceId?: string | null;
  deviceRegisteredAt?: string | null;
  lastDeviceName?: string | null;
}

export interface Chat {
  id: string;
  companyId: string;
  clientName: string;
  clientPhone?: string;
  status: ChatStatus;
  sellerId?: string;
  sellerName?: string;
  sellerAvatar?: string | null;
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
  senderAvatar?: string | null;
  text: string;
  imageUrl?: string;
  createdAt: string;
}

export interface InternalMessage {
  id: string;
  companyId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  senderRole: 'admin' | 'seller';
  recipientId: string; // sellerId OR 'all' (announcement to all sellers) OR 'admin'
  recipientName?: string;
  text: string;
  imageUrl?: string;
  readBy?: string[]; // Array of user IDs who have seen this message
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

export interface Lead {
  id: string;
  companyId: string;
  name: string;
  phone: string;
  email?: string;
  firstContactAt: string;
  lastContactAt: string;
  totalContactsCount?: number;
  lastMessage?: string;
  notes?: string;
  tags?: string[];
  status?: 'active' | 'contacted' | 'converted' | 'unsubscribed';
  source?: string;
}

