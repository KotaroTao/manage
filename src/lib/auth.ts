import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
      isActive: boolean;
    };
  }

  interface User {
    id: string;
    email: string;
    name: string;
    role: Role;
    isActive: boolean;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    email: string;
    name: string;
    role: Role;
    isActive: boolean;
  }
}

const nextAuth = NextAuth({
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.isActive) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(
          password,
          user.passwordHash,
        );

        if (!isPasswordValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          isActive: user.isActive,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token }) {
      // 毎回DBからユーザー情報を再取得（無効化されたユーザーを即座に検知）
      if (token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id },
          select: { id: true, email: true, name: true, role: true, isActive: true },
        });
        if (!dbUser || !dbUser.isActive) {
          // ユーザーが無効化された場合、トークンを無効化
          token.isActive = false;
          return token;
        }
        token.id = dbUser.id;
        token.email = dbUser.email;
        token.name = dbUser.name;
        token.role = dbUser.role;
        token.isActive = dbUser.isActive;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        ...session.user,
        id: token.id,
        email: token.email,
        name: token.name,
        role: token.role,
        isActive: token.isActive,
      };
      return session;
    },
    async authorized({ auth: session }) {
      return !!session?.user && session.user.isActive !== false;
    },
  },
});

export const auth = nextAuth.auth;
export const signIn = nextAuth.signIn;
export const signOut = nextAuth.signOut;
export const handlers = nextAuth.handlers;
export const { GET, POST } = nextAuth.handlers;
