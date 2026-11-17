"use server";

import { redirect } from "next/navigation";
import { getRequestMeta, requestHeaders } from "@/lib/request";
import { getCurrentUser } from "@/lib/session";
import { signOut } from "@/modules/auth/service";

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user) await signOut(await requestHeaders(), user.id, await getRequestMeta());
  redirect("/login");
}
