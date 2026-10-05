import { OperatingHours } from '../types';

export interface OperatingHoursStatus {
  isOpen: boolean;
  isConfigured: boolean;
  message: string;
  scheduleText: string;
  nextOpenText?: string;
}

export const DAY_LABELS: { [key: number]: string } = {
  1: 'Segunda',
  2: 'Terça',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
  6: 'Sábado',
  0: 'Domingo'
};

export const SHORT_DAY_LABELS: { [key: number]: string } = {
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
  0: 'Dom'
};

export const DEFAULT_OPERATING_HOURS: OperatingHours = {
  enabled: false,
  days: [1, 2, 3, 4, 5], // Seg a Sex
  startHour: '08:00',
  endHour: '18:00',
  offlineMessage: 'No momento estamos fora do nosso horário de atendimento. Deixe sua mensagem e telefone que retornaremos assim que nosso expediente iniciar!'
};

/**
 * Checks whether the store is currently within operating hours.
 */
export function checkOperatingHours(operatingHours?: OperatingHours): OperatingHoursStatus {
  if (!operatingHours || !operatingHours.enabled) {
    return {
      isOpen: true,
      isConfigured: false,
      message: 'Atendimento disponível 24 horas',
      scheduleText: 'Horário livre / 24h'
    };
  }

  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const days = operatingHours.days && operatingHours.days.length > 0 ? operatingHours.days : [1, 2, 3, 4, 5];
  const startHourStr = operatingHours.startHour || '08:00';
  const endHourStr = operatingHours.endHour || '18:00';

  const [startH, startM] = startHourStr.split(':').map(Number);
  const [endH, endM] = endHourStr.split(':').map(Number);

  const startMinutes = (isNaN(startH) ? 8 : startH) * 60 + (isNaN(startM) ? 0 : startM);
  const endMinutes = (isNaN(endH) ? 18 : endH) * 60 + (isNaN(endM) ? 0 : endM);

  const isDayOpen = days.includes(currentDay);
  const isTimeOpen = currentMinutes >= startMinutes && currentMinutes < endMinutes;
  const isOpen = isDayOpen && isTimeOpen;

  // Format schedule text e.g. "Seg a Sex: 08:00 às 18:00"
  const formattedDays = formatDaysList(days);
  const scheduleText = `${formattedDays} • ${startHourStr} às ${endHourStr}`;

  if (isOpen) {
    return {
      isOpen: true,
      isConfigured: true,
      message: `Aberto agora • Atendimento até às ${endHourStr}`,
      scheduleText
    };
  }

  // Not open
  let nextOpenText = '';
  if (isDayOpen && currentMinutes < startMinutes) {
    nextOpenText = `Abrimos hoje às ${startHourStr}`;
  } else {
    // Find next open day
    for (let i = 1; i <= 7; i++) {
      const nextDay = (currentDay + i) % 7;
      if (days.includes(nextDay)) {
        if (i === 1) {
          nextOpenText = `Retornamos amanhã às ${startHourStr}`;
        } else {
          nextOpenText = `Retornamos ${DAY_LABELS[nextDay]} às ${startHourStr}`;
        }
        break;
      }
    }
  }

  const offlineMsg = operatingHours.offlineMessage?.trim() || 
    `No momento estamos fora do nosso expediente (${scheduleText}). Deixe seu nome, telefone e mensagem que atenderemos você assim que abrirmos!`;

  return {
    isOpen: false,
    isConfigured: true,
    message: offlineMsg,
    scheduleText,
    nextOpenText
  };
}

/**
 * Format an array of days into human readable text e.g. [1,2,3,4,5] -> "Seg a Sex"
 */
export function formatDaysList(days: number[]): string {
  if (!days || days.length === 0) return 'Todos os dias';
  if (days.length === 7) return 'Segunda a Domingo';
  
  const sorted = [...days].sort((a, b) => a - b);
  // Check if standard Seg a Sex [1,2,3,4,5]
  if (sorted.length === 5 && [1, 2, 3, 4, 5].every((d, i) => d === sorted[i])) {
    return 'Seg a Sex';
  }
  // Check if Seg a Sab [1,2,3,4,5,6]
  if (sorted.length === 6 && [1, 2, 3, 4, 5, 6].every((d, i) => d === sorted[i])) {
    return 'Seg a Sáb';
  }

  return sorted.map(d => SHORT_DAY_LABELS[d] || String(d)).join(', ');
}
