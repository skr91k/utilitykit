import { useState, useEffect } from 'react';
import { onAuthChange, signInWithGoogle, logOut, signInAnonymous } from './firebase';
import type { User } from './firebase';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthChange((user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const logout = async () => {
    try {
      await logOut();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const loginAnonymous = async () => {
    try {
      await signInAnonymous();
    } catch (error) {
      console.error('Anonymous login failed:', error);
    }
  };

  return { user, loading, login, logout, loginAnonymous };
}
