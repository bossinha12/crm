import React from 'react';
import { Company } from '../types';
import { ShieldAlert, Phone, HelpCircle, ArrowLeft, Lock } from 'lucide-react';

interface BlockedLicenseScreenProps {
  company: Company;
  onSuperAdminClick: () => void;
  onGoBackHome?: () => void;
}

export default function BlockedLicenseScreen({
  company,
  onSuperAdminClick,
  onGoBackHome
}: BlockedLicenseScreenProps) {
  const companyLogo = company.logoUrl || 'https://i.postimg.cc/8CdttXNK/Whats-App-Image-2026-06-10-at-14-30-14.jpg';
  const supportPhone = company.license?.contactPhone || '85999999999';
  const whatsappUrl = `https://wa.me/${supportPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá, gostaria de regularizar a licença de uso do sistema para a empresa ${company.name}.`)}`;

  return (
    <main className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 font-sans text-slate-100 relative overflow-hidden">
      {/* Background soft red/amber glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-rose-500/10 rounded-full blur-3xl pointer-events-none -z-0"></div>

      <div className="max-w-md w-full bg-slate-800/90 border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-sm relative z-10 text-center space-y-6">
        
        {/* Company Header with Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-2xl border-2 border-rose-500/40 p-1 bg-slate-900 shadow-lg flex items-center justify-center overflow-hidden">
            <img 
              src={companyLogo} 
              referrerPolicy="no-referrer" 
              alt={company.name} 
              className="w-full h-full object-cover rounded-xl"
            />
          </div>
          
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-500/20 border border-rose-500/40 text-rose-300 rounded-full text-xs font-bold uppercase tracking-wider">
            <Lock className="w-3.5 h-3.5" />
            <span>Acesso Suspenso</span>
          </div>

          <h1 className="text-2xl font-bold text-white tracking-tight">
            {company.name}
          </h1>
        </div>

        {/* Message */}
        <div className="bg-slate-900/60 border border-slate-700/60 rounded-2xl p-4 text-xs sm:text-sm text-slate-300 leading-relaxed space-y-2">
          <p className="font-semibold text-rose-200">
            A licença de uso desta plataforma está temporariamente bloqueada ou com assinatura pendente.
          </p>
          <p className="text-slate-400 text-xs">
            Se você é o proprietário ou gestor da empresa, entre em contato com o suporte para reativar o sistema imediatamente.
          </p>
        </div>

        {/* Support Buttons */}
        <div className="space-y-3">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-950/30 transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
          >
            <Phone className="w-4 h-4" />
            <span>Regularizar pelo WhatsApp</span>
          </a>

          {onGoBackHome && (
            <button
              onClick={onGoBackHome}
              className="w-full py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar ao Portal Principal</span>
            </button>
          )}
        </div>

        {/* Super admin unlock footer */}
        <div className="pt-4 border-t border-slate-700/60 flex justify-between items-center text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <HelpCircle className="w-3 h-3 text-slate-400" />
            <span>Código: {company.id}</span>
          </span>
          <button
            onClick={onSuperAdminClick}
            className="text-indigo-400 hover:text-indigo-300 hover:underline font-semibold cursor-pointer"
          >
            🔑 Painel SaaS
          </button>
        </div>

      </div>
    </main>
  );
}
