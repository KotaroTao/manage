"use server";

import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";

export async function login(formData: FormData) {
  try {
    await signIn("credentials", {
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "メールアドレスまたはパスワードが正しくありません。" };
    }
    // NextAuth redirects throw NEXT_REDIRECT, which must be re-thrown
    throw error;
  }
}
