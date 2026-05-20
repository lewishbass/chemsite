// src/routes/plugin@auth.ts
import { QwikAuth$ } from "@auth/qwik";
import Credentials from "@auth/qwik/providers/credentials";

declare module "@auth/core/types" {
  interface User {
    stoat_token?: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    stoat_token?: string;
  }
}

// This is the function where we validate against your Stoat server
async function authorize(credentials: Partial<Record<"email" | "password", unknown>>) {
  const email = credentials.email as string;
  const password = credentials.password as string;

  // 1. Create the request payload for Stoat's API
  const body = JSON.stringify({ email, password });

  // 2. Prepare the headers
  const headers = new Headers({
    "Content-Type": "application/json",
  });

  try {
    // 3. MAKE THE API CALL TO YOUR SELF-HOSTED STOAT SERVER
    //    Use the private docker network URL or your server's internal IP
    const response = await fetch("https://chat.chemistryml.com/api/auth/session/login", {
      method: "POST",
      headers: headers,
      body: body,
    });

    // 4. Handle the response from Stoat
    if (!response.ok) {
      // Login failed
      const errorData = await response.json();
      console.error("Stoat login failed:", errorData);
      // Throw a generic error to not reveal too much
      throw new Error("Invalid credentials");
    }

    const userData = await response.json();

    // 5. Return a user object that QwikAuth understands
    //    This is what you'll see in useSession().user
    //    Note: the login response does NOT include email or username.
    //    - email comes from the form credentials
    //    - name comes from the session display name in the login response
    //    The real Stoat username is fetched client-side via GET /api/users/@me
    return {
      id: userData.user_id,
      email: email,
      name: userData.name || email.split("@")[0],
      stoat_token: userData.token,
    };
  } catch (error) {
    console.error("Authorization error:", error);
    // Always return null if authorization fails
    return null;
  }
}

// This exports the QwikAuth configuration
export const { onRequest, useSession, useSignIn, useSignOut } = QwikAuth$(() => ({
  providers: [
    Credentials({
      // The credentials you'll ask the user for
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      // The function that does the actual authorization
      authorize: authorize,
    }),
  ],
  // Use a secret for encrypting cookies (generate a strong one)
  secret: process.env.AUTH_SECRET,
  // Use JWT for session strategy
  session: { strategy: "jwt" },
  callbacks: {
    // This callback runs when a JWT is created or updated
    // We use it to persist the Stoat token in the session
    async jwt({ token, user }) {
      // If it's the first time (user just logged in), copy the stoat token
      if (user) {
        token.stoat_token = user.stoat_token;
      }
      return token;
    },
    // This callback runs when a session is checked
    // We use it to make the Stoat token available on the client
    async session({ session, token }) {
      if (session?.user) {
        session.user.stoat_token = token.stoat_token;
      }
      return session;
    },
  },
}));