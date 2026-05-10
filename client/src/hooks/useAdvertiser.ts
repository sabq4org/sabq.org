import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export interface AdvertiserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  logo?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdvertiserAd {
  id: string;
  title: string;
  description?: string;
  imageUrl: string;
  destinationUrl: string;
  status: 'pending_approval' | 'active' | 'paused' | 'rejected' | 'completed' | 'expired';
  impressions: number;
  clicks: number;
  costPerClick: number;
  totalCost: number;
  startDate: string;
  endDate?: string;
  createdAt: string;
}

export interface AdvertiserStats {
  totalAds: number;
  activeAds: number;
  pendingAds: number;
  totalImpressions: number;
  totalClicks: number;
  totalCost: number;
}

export function useAdvertiserProfile() {
  return useQuery<AdvertiserProfile>({
    queryKey: ["/api/advertiser/me"],
    retry: false,
  });
}

export function useAdvertiserAds() {
  return useQuery<AdvertiserAd[]>({
    queryKey: ["/api/advertiser/ads"],
  });
}

export function useAdvertiserStats() {
  return useQuery<AdvertiserStats>({
    queryKey: ["/api/advertiser/stats"],
  });
}

export function useAdvertiserLogin() {
  return useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      return await apiRequest<AdvertiserProfile>("/api/advertiser/login", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advertiser/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/advertiser/ads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/advertiser/stats"] });
    },
  });
}

export function useAdvertiserRegister() {
  return useMutation({
    mutationFn: async (data: { 
      name: string; 
      email: string; 
      password: string;
      phone?: string;
      company?: string;
    }) => {
      return await apiRequest<AdvertiserProfile>("/api/advertiser/register", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advertiser/me"] });
    },
  });
}

export function useAdvertiserLogout() {
  return useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/advertiser/logout", {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advertiser/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/advertiser/ads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/advertiser/stats"] });
    },
  });
}

export function useAdvertiserUpdateProfile() {
  return useMutation({
    mutationFn: async (data: { 
      name?: string; 
      phone?: string;
      company?: string;
      logo?: string;
    }) => {
      return await apiRequest<AdvertiserProfile>("/api/advertiser/profile", {
        method: "PUT",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advertiser/me"] });
    },
  });
}
