// src/App.tsx
import { useState, useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import Auth from './components/Auth'
import Dashboard from './components/Dashboard'
import AdminPage from './components/Adminpage'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [])

  // /admin 경로 감지
  const isAdminRoute = window.location.pathname === '/admin'

  if (!session) return <Auth />

  if (isAdminRoute) return <AdminPage session={session} />

  return <Dashboard session={session} />
}