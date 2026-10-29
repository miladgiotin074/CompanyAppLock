import { createContext, useContext } from 'react';

export const DeviceContext = createContext(null);

export function useDevice() {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error('useDevice must be used inside a device screen');
  return ctx;
}
