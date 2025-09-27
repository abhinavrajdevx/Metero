import { IOU, Provider, Service } from "./types.js";

export const Providers = new Map<string, Provider>();          // key: apiKey
export const Services = new Map<string, Service>();            // key: serviceId
export const IOUs = new Map<string, IOU>();                    // key: id

export function byProviderAddr(addr: string) {
  return [...Providers.values()].find(p => p.providerAddr.toLowerCase() === addr.toLowerCase());
}
export function servicesByProvider(addr: string) {
  return [...Services.values()].filter(s => s.providerAddr.toLowerCase() === addr.toLowerCase());
}
export function pendingByProvider(addr: string): IOU[] {
  return [...IOUs.values()].filter(i => i.status === "pending" && i.debit.provider.toLowerCase() === addr.toLowerCase());
}
export function pendingSumByPayer(payer: string): bigint {
  return [...IOUs.values()]
    .filter(i => i.status === "pending" && i.debit.payer.toLowerCase() === payer.toLowerCase())
    .reduce((acc, i) => acc + i.debit.amount, 0n);
}
