/**
 * Utility functions for formatting dates, times, and numbers across the application.
 */

export function formatMessageDateTime(dateVal?: any): string {
  if (!dateVal) return '';

  try {
    let date: Date;

    if (typeof dateVal?.toDate === 'function') {
      date = dateVal.toDate();
    } else if (dateVal && typeof dateVal === 'object' && typeof dateVal.seconds === 'number') {
      date = new Date(dateVal.seconds * 1000);
    } else if (typeof dateVal === 'string' || typeof dateVal === 'number') {
      date = new Date(dateVal);
    } else if (dateVal instanceof Date) {
      date = dateVal;
    } else {
      return '';
    }

    if (isNaN(date.getTime())) return '';

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}/${month}/${year} às ${hours}:${minutes}`;
  } catch {
    return '';
  }
}

export function formatMessageTimeOnly(dateVal?: any): string {
  if (!dateVal) return '';

  try {
    let date: Date;

    if (typeof dateVal?.toDate === 'function') {
      date = dateVal.toDate();
    } else if (dateVal && typeof dateVal === 'object' && typeof dateVal.seconds === 'number') {
      date = new Date(dateVal.seconds * 1000);
    } else if (typeof dateVal === 'string' || typeof dateVal === 'number') {
      date = new Date(dateVal);
    } else if (dateVal instanceof Date) {
      date = dateVal;
    } else {
      return '';
    }

    if (isNaN(date.getTime())) return '';

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${hours}:${minutes}`;
  } catch {
    return '';
  }
}
