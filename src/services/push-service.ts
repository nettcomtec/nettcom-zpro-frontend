import api from "@/lib/api";

export async function getPublicVapidKey(tenantId: number) {
  return api.get<{ publicKeyVapid: string }>(`/push/vapid/${tenantId}`);
}

export async function saveUserSubscription(
  subscription: PushSubscription,
  deviceInfo: string
) {
  return api.post("/push/subscribe", { subscription, deviceInfo });
}
